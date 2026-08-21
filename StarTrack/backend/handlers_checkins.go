package main

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const geofenceRadiusKM = 0.2 // ~200m tolerance around a restaurant's registered coordinates
const checkinCooldownWindow = 5 * time.Minute

type verifyCheckinRequest struct {
	TagID        string  `json:"tag_id" binding:"required"`
	Signature    string  `json:"signature" binding:"required"`
	LocationLat  float64 `json:"location_lat"`
	LocationLong float64 `json:"location_long"`
}

func verifyCheckinHandler(c *gin.Context) {
	userID := currentUserID(c)

	var payload verifyCheckinRequest
	if err := c.BindJSON(&payload); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}

	var device NFCDevice
	if err := db.Where("tag_id = ?", payload.TagID).First(&device).Error; err != nil {
		RespondError(c, http.StatusBadRequest, ErrCodeBadRequest, "Unknown NFC tag", nil)
		return
	}
	if device.Status == "disabled" {
		RespondError(c, http.StatusBadRequest, ErrCodeBadRequest, "This device has been disabled", nil)
		return
	}

	var restaurant Restaurant
	if err := db.First(&restaurant, device.RestaurantID).Error; err != nil {
		RespondNotFound(c, "Restaurant not found")
		return
	}
	currentYear, currentStars := currentRestaurantAward(restaurant.ID)

	// A flaky connection can make a successful checkin look like it failed on
	// the client, which invites an immediate retry. Reject that retry instead
	// of double-awarding score/badges for what was really one visit.
	if hasRecentVerifiedCheckin(userID, restaurant.ID) {
		RespondError(c, http.StatusConflict, ErrCodeConflict, "Recent verified checkin exists", nil)
		return
	}

	expected := computeSignature(payload.TagID, device.Salt)
	signatureValid := payload.Signature == expected

	distance := haversineDistance(payload.LocationLat, payload.LocationLong, restaurant.LocationLat, restaurant.LocationLong)
	withinGeofence := distance <= geofenceRadiusKM
	verified := signatureValid && withinGeofence

	message := "check-in verified"
	switch {
	case !signatureValid:
		message = "signature validation failed"
	case !withinGeofence:
		message = "geofence validation failed"
	}

	now := time.Now()
	deviceID := device.ID
	record := CheckIn{
		UserID:       userID,
		RestaurantID: restaurant.ID,
		DeviceID:     &deviceID,
		NFCSignature: payload.Signature,
		Verified:     verified,
		LocationLat:  payload.LocationLat,
		LocationLong: payload.LocationLong,
		CreatedAt:    now,
	}
	if verified {
		record.VerifiedAt = &now
	}
	if err := db.Create(&record).Error; err != nil {
		RespondInternalError(c, "Failed to create checkin record")
		return
	}

	var newBadges []Badge
	if verified {
		db.Model(&User{}).Where("id = ?", userID).Updates(map[string]interface{}{
			"score":  gorm.Expr("score + ?", currentStars*10),
			"region": restaurant.City,
		})
		newBadges = evaluateBadgesForUser(userID)
	}

	detectAnomalies(userID, restaurant.ID, device.ID, record.ID, signatureValid, withinGeofence)

	if !signatureValid {
		RespondUnauthorized(c, "Signature validation failed")
		return
	}

	RespondSuccess(c, http.StatusOK, map[string]interface{}{
		"verified":   verified,
		"message":    message,
		"restaurant": restaurant.Name,
		"badge":      fmt.Sprintf("%d %s Star Achievement", currentYear, ordinal(currentStars)),
		"new_badges": newBadges,
	})
}

// historyHandler returns the shape the mobile app's original mock
// `checkInHistory` used: { "<restaurant_id>": { timestamp, shorthand } }
// keyed by the most recent verified checkin per restaurant.
func historyHandler(c *gin.Context) {
	userID := currentUserID(c)
	history := buildCheckinHistory(userID)
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"history": history})
}

// passportHandler returns { "1": "AT", "2": "CB", ... } — up to 28 stamped
// slots in chronological order, matching the Passport grid's `verifiedDays`.
func passportHandler(c *gin.Context) {
	RespondSuccess(c, http.StatusOK, map[string]interface{}{
		"verified_days": verifiedDaysForUser(currentUserID(c)),
	})
}

// verifiedDaysForUser is shared by passportHandler (self) and the friend
// badge-wall endpoint (userBadgeWallHandler).
func verifiedDaysForUser(userID uint) gin.H {
	history := buildCheckinHistory(userID)

	type entry struct {
		timestamp time.Time
		shorthand string
	}
	entries := make([]entry, 0, len(history))
	for _, v := range history {
		entries = append(entries, entry{timestamp: v.Timestamp, shorthand: v.Shorthand})
	}
	// stable-ish ordering: oldest verified stamp first, capped at 28
	for i := 0; i < len(entries); i++ {
		for j := i + 1; j < len(entries); j++ {
			if entries[j].timestamp.Before(entries[i].timestamp) {
				entries[i], entries[j] = entries[j], entries[i]
			}
		}
	}
	if len(entries) > 28 {
		entries = entries[:28]
	}

	verifiedDays := gin.H{}
	for i, e := range entries {
		verifiedDays[fmt.Sprintf("%d", i+1)] = e.shorthand
	}
	return verifiedDays
}

type checkinHistoryEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Shorthand string    `json:"shorthand"`
}

func buildCheckinHistory(userID uint) map[string]checkinHistoryEntry {
	var checkins []CheckIn
	db.Preload("Restaurant").
		Where("user_id = ? AND verified = ?", userID, true).
		Order("verified_at asc").
		Find(&checkins)

	history := map[string]checkinHistoryEntry{}
	for _, ci := range checkins {
		if ci.VerifiedAt == nil {
			continue
		}
		key := fmt.Sprintf("%d", ci.RestaurantID)
		history[key] = checkinHistoryEntry{
			Timestamp: *ci.VerifiedAt,
			Shorthand: initials(ci.Restaurant.Name),
		}
	}
	return history
}

func hasRecentVerifiedCheckin(userID, restaurantID uint) bool {
	var count int64
	cutoff := time.Now().Add(-checkinCooldownWindow)
	db.Model(&CheckIn{}).
		Where("user_id = ? AND restaurant_id = ? AND verified = ? AND verified_at >= ?", userID, restaurantID, true, cutoff).
		Count(&count)
	return count > 0
}

func initials(name string) string {
	words := strings.Fields(name)
	out := ""
	for _, w := range words {
		out += strings.ToUpper(string([]rune(w)[0]))
	}
	return out
}
