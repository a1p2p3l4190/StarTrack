package main

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ---------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------

func leaderboardHandler(c *gin.Context) {
	var users []User
	db.Order("score desc, id asc").Limit(20).Find(&users)

	out := make([]gin.H, 0, len(users))
	for _, u := range users {
		out = append(out, gin.H{
			"id":     u.ID,
			"name":   u.DisplayName,
			"score":  u.Score,
			"region": u.Region,
		})
	}
	c.JSON(http.StatusOK, gin.H{"leaderboard": out})
}

// ---------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------

func listWishlistHandler(c *gin.Context) {
	var items []WishlistItem
	db.Where("user_id = ?", currentUserID(c)).Order("created_at desc").Find(&items)
	c.JSON(http.StatusOK, gin.H{"wishlist": items})
}

type createWishlistRequest struct {
	RestaurantName string `json:"restaurant_name" binding:"required"`
	Note           string `json:"note"`
}

func createWishlistHandler(c *gin.Context) {
	var req createWishlistRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	item := WishlistItem{UserID: currentUserID(c), RestaurantName: req.RestaurantName, Note: req.Note}
	if err := db.Create(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, item)
}

func deleteWishlistHandler(c *gin.Context) {
	result := db.Where("id = ? AND user_id = ?", c.Param("id"), currentUserID(c)).Delete(&WishlistItem{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "wishlist item not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": c.Param("id")})
}

// ---------------------------------------------------------------------
// Anomalies (admin Security Dashboard)
// ---------------------------------------------------------------------

func listAnomaliesHandler(c *gin.Context) {
	var anomalies []Anomaly
	query := db.Order("created_at desc")
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	query.Limit(50).Find(&anomalies)
	c.JSON(http.StatusOK, gin.H{"anomalies": anomalies})
}

type resolveAnomalyRequest struct {
	Action string `json:"action" binding:"required,oneof=dismiss confirm"`
}

// resolveAnomalyHandler marks an anomaly reviewed without taking any
// punitive action — "dismiss" for a false positive, "confirm" for a
// verified violation the admin has otherwise already handled.
func resolveAnomalyHandler(c *gin.Context) {
	var anomaly Anomaly
	if err := db.First(&anomaly, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "anomaly not found"})
		return
	}
	var req resolveAnomalyRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Action == "dismiss" {
		anomaly.Status = "dismissed"
	} else {
		anomaly.Status = "confirmed"
	}
	db.Save(&anomaly)
	logAuditEvent(c, "RESOLVE_ANOMALY", "anomaly", &anomaly.ID, "action="+req.Action)
	c.JSON(http.StatusOK, anomaly)
}

// revokeAnomalyCheckinHandler invalidates the checkin that triggered this
// anomaly and claws back any score it awarded.
func revokeAnomalyCheckinHandler(c *gin.Context) {
	var anomaly Anomaly
	if err := db.First(&anomaly, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "anomaly not found"})
		return
	}
	if anomaly.CheckInID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "this anomaly has no associated checkin"})
		return
	}
	var checkin CheckIn
	if err := db.First(&checkin, *anomaly.CheckInID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "checkin not found"})
		return
	}

	if checkin.Verified && !checkin.Revoked {
		var restaurant Restaurant
		var user User
		if db.First(&restaurant, checkin.RestaurantID).Error == nil && db.First(&user, checkin.UserID).Error == nil {
			newScore := user.Score - restaurant.Stars*10
			if newScore < 0 {
				newScore = 0
			}
			db.Model(&user).Update("score", newScore)
		}
	}

	checkin.Revoked = true
	checkin.Verified = false
	db.Save(&checkin)

	anomaly.Status = "confirmed"
	db.Save(&anomaly)

	logAuditEvent(c, "REVOKE_CHECKIN", "checkin", &checkin.ID, fmt.Sprintf("anomaly=%d", anomaly.ID))
	c.JSON(http.StatusOK, gin.H{"checkin": checkin, "anomaly": anomaly})
}

// disableAnomalyDeviceHandler disables the NFC device implicated in this
// anomaly, e.g. after a tag is reported stolen or tampered with.
func disableAnomalyDeviceHandler(c *gin.Context) {
	var anomaly Anomaly
	if err := db.First(&anomaly, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "anomaly not found"})
		return
	}
	if anomaly.DeviceID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "this anomaly has no associated device"})
		return
	}
	var device NFCDevice
	if err := db.First(&device, *anomaly.DeviceID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
		return
	}
	device.Status = "disabled"
	db.Save(&device)

	anomaly.Status = "confirmed"
	db.Save(&anomaly)

	logAuditEvent(c, "NFC_DEVICE_STATUS", "nfc_device", &device.ID, fmt.Sprintf("status=disabled anomaly=%d", anomaly.ID))
	c.JSON(http.StatusOK, gin.H{"device": device, "anomaly": anomaly})
}

// banAnomalyUserHandler bans the user implicated in this anomaly, e.g. for
// a confirmed velocity-check violation (impossible cross-region travel).
func banAnomalyUserHandler(c *gin.Context) {
	var anomaly Anomaly
	if err := db.First(&anomaly, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "anomaly not found"})
		return
	}
	if anomaly.UserID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "this anomaly has no associated user"})
		return
	}
	var user User
	if err := db.First(&user, *anomaly.UserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	user.Banned = true
	db.Save(&user)

	anomaly.Status = "confirmed"
	db.Save(&anomaly)

	logAuditEvent(c, "BAN_USER", "user", &user.ID, fmt.Sprintf("email=%s anomaly=%d", user.Email, anomaly.ID))
	c.JSON(http.StatusOK, gin.H{"user": user, "anomaly": anomaly})
}

const velocityWindow = 15 * time.Minute
const velocityMinDistanceKM = 5.0
const failureWindow = 1 * time.Hour
const failureThreshold = 3

// detectAnomalies runs a couple of lightweight fraud heuristics after every
// checkin attempt (successful or not) and persists anything suspicious for
// the admin Security Dashboard to review.
func detectAnomalies(userID, restaurantID, deviceID, checkinID uint, signatureValid, withinGeofence bool) {
	detectVelocityAnomaly(userID, restaurantID, checkinID)
	if !signatureValid || !withinGeofence {
		detectRepeatedFailureAnomaly(userID, deviceID, checkinID)
	}
}

func detectVelocityAnomaly(userID, restaurantID, checkinID uint) {
	var previous CheckIn
	err := db.Where("user_id = ? AND restaurant_id <> ? AND verified = ?", userID, restaurantID, true).
		Order("verified_at desc").
		First(&previous).Error
	if err != nil || previous.VerifiedAt == nil {
		return
	}
	if time.Since(*previous.VerifiedAt) > velocityWindow {
		return
	}

	var current, prior Restaurant
	if db.First(&current, restaurantID).Error != nil || db.First(&prior, previous.RestaurantID).Error != nil {
		return
	}
	distance := haversineDistance(current.LocationLat, current.LocationLong, prior.LocationLat, prior.LocationLong)
	if distance < velocityMinDistanceKM {
		return
	}

	description := fmt.Sprintf(
		"Rapid check-ins %.0f km apart within %d minutes: %q then %q",
		distance, int(velocityWindow.Minutes()), prior.Name, current.Name,
	)
	uid := userID
	rid := restaurantID
	cid := checkinID
	db.Create(&Anomaly{UserID: &uid, RestaurantID: &rid, CheckInID: &cid, Description: description, Severity: "high", Status: "open"})
}

func detectRepeatedFailureAnomaly(userID, deviceID, checkinID uint) {
	var count int64
	cutoff := time.Now().Add(-failureWindow)
	db.Model(&CheckIn{}).
		Where("user_id = ? AND device_id = ? AND verified = ? AND created_at >= ?", userID, deviceID, false, cutoff).
		Count(&count)
	if count < failureThreshold {
		return
	}

	uid := userID
	did := deviceID
	cid := checkinID
	description := fmt.Sprintf("Repeated failed check-in signatures from one device (%d attempts in the last hour)", count)
	db.Create(&Anomaly{UserID: &uid, DeviceID: &did, CheckInID: &cid, Description: description, Severity: "medium", Status: "open"})
}
