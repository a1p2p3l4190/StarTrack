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
	db.Where("role <> ? OR role IS NULL", "admin").Order("score desc, id asc").Limit(20).Find(&users)

	out := make([]gin.H, 0, len(users))
	for _, u := range users {
		out = append(out, gin.H{
			"id":     u.ID,
			"name":   u.DisplayName,
			"score":  u.Score,
			"region": u.Region,
		})
	}
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"leaderboard": out})
}

func hydrateFollowCounts(user *User) {
	if user == nil {
		return
	}
	var followerCount int64
	db.Model(&Follow{}).Where("following_user_id = ?", user.ID).Count(&followerCount)
	user.FollowersCount = int(followerCount)

	var followingCount int64
	db.Model(&Follow{}).Where("user_id = ?", user.ID).Count(&followingCount)
	user.FollowingCount = int(followingCount)
}

func isFollowing(currentUserID, targetUserID uint) bool {
	var count int64
	db.Model(&Follow{}).Where("user_id = ? AND following_user_id = ?", currentUserID, targetUserID).Count(&count)
	return count > 0
}

func userSocialStatsHandler(c *gin.Context) {
	var user User
	if err := db.First(&user, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "User not found")
		return
	}
	hydrateFollowCounts(&user)
	RespondSuccess(c, http.StatusOK, map[string]interface{}{
		"id":              user.ID,
		"display_name":    user.DisplayName,
		"region":          user.Region,
		"avatar_url":      user.AvatarURL,
		"follower_count":  user.FollowersCount,
		"following_count": user.FollowingCount,
		"following":       isFollowing(currentUserID(c), user.ID),
	})
}

func toggleFollowHandler(c *gin.Context) {
	currentID := currentUserID(c)
	var target User
	if err := db.First(&target, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "User not found")
		return
	}
	if currentID == target.ID {
		RespondSuccess(c, http.StatusOK, map[string]interface{}{
			"following":       false,
			"follower_count":  userFollowCount(target.ID),
			"following_count": userFollowingCount(currentID),
		})
		return
	}

	var existing Follow
	err := db.Where("user_id = ? AND following_user_id = ?", currentID, target.ID).First(&existing).Error
	if err == nil {
		if delErr := db.Delete(&existing).Error; delErr != nil {
			RespondInternalError(c, "Failed to unfollow user")
			return
		}
		RespondSuccess(c, http.StatusOK, map[string]interface{}{
			"following":       false,
			"follower_count":  userFollowCount(target.ID),
			"following_count": userFollowingCount(currentID),
		})
		return
	}

	if err := db.Create(&Follow{UserID: currentID, FollowingUserID: target.ID}).Error; err != nil {
		RespondInternalError(c, "Failed to follow user")
		return
	}

	newFollowerCount := userFollowCount(target.ID)

	var currentUser User
	if err := db.First(&currentUser, currentID).Error; err == nil {
		db.Create(&Notification{
			UserID:  target.ID,
			Kind:    "follow",
			Title:   currentUser.DisplayName + " started following you",
			Message: "You now have " + fmt.Sprintf("%d", newFollowerCount) + " followers.",
		})
	}

	RespondSuccess(c, http.StatusOK, map[string]interface{}{
		"following":       true,
		"follower_count":  newFollowerCount,
		"following_count": userFollowingCount(currentID),
	})
}

// userBadgeWallHandler is the "Star Map" — a friend's badge wall and dining
// footprint. Gated behind following them (or it being your own profile), so
// this stays a privacy-controlled circle rather than a public leaderboard.
func userBadgeWallHandler(c *gin.Context) {
	currentID := currentUserID(c)
	var target User
	if err := db.First(&target, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "User not found")
		return
	}

	if currentID != target.ID && !isFollowing(currentID, target.ID) {
		RespondForbidden(c, "Follow this user to view their badge wall")
		return
	}

	var verifiedCount int64
	db.Model(&CheckIn{}).Where("user_id = ? AND verified = ?", target.ID, true).Count(&verifiedCount)

	var distinctRestaurants int64
	db.Model(&CheckIn{}).Where("user_id = ? AND verified = ?", target.ID, true).Distinct("restaurant_id").Count(&distinctRestaurants)

	var distinctCities int64
	db.Table("checkins").
		Joins("JOIN restaurants ON restaurants.id = checkins.restaurant_id").
		Where("checkins.user_id = ? AND checkins.verified = ?", target.ID, true).
		Distinct("restaurants.city").
		Count(&distinctCities)

	RespondSuccess(c, http.StatusOK, map[string]interface{}{
		"id":            target.ID,
		"display_name":  target.DisplayName,
		"region":        target.Region,
		"avatar_url":    target.AvatarURL,
		"badges":        badgesForUser(target.ID),
		"verified_days": verifiedDaysForUser(target.ID),
		"footprint": map[string]interface{}{
			"verified_checkins":    verifiedCount,
			"distinct_restaurants": distinctRestaurants,
			"distinct_cities":      distinctCities,
		},
	})
}

func userFollowCount(targetUserID uint) int {
	var count int64
	db.Model(&Follow{}).Where("following_user_id = ?", targetUserID).Count(&count)
	return int(count)
}

func userFollowingCount(userID uint) int {
	var count int64
	db.Model(&Follow{}).Where("user_id = ?", userID).Count(&count)
	return int(count)
}

// ---------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------

func listWishlistHandler(c *gin.Context) {
	var items []WishlistItem
	db.Where("user_id = ?", currentUserID(c)).Order("created_at desc").Find(&items)
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"wishlist": items})
}

type createWishlistRequest struct {
	RestaurantID   uint   `json:"restaurant_id"`
	RestaurantName string `json:"restaurant_name" binding:"required"`
	PhotoURL       string `json:"photo_url"`
	PriceTier      int    `json:"price_tier"`
	OpeningHours   string `json:"opening_hours"`
	Note           string `json:"note"`
}

func createWishlistHandler(c *gin.Context) {
	var req createWishlistRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}
	item := WishlistItem{
		UserID:         currentUserID(c),
		RestaurantName: req.RestaurantName,
		PhotoURL:       req.PhotoURL,
		PriceTier:      req.PriceTier,
		OpeningHours:   req.OpeningHours,
		Note:           req.Note,
	}
	if req.RestaurantID != 0 {
		item.RestaurantID = &req.RestaurantID
	}
	if err := db.Create(&item).Error; err != nil {
		RespondInternalError(c, "Failed to create wishlist item")
		return
	}
	RespondSuccess(c, http.StatusCreated, item)
}

func deleteWishlistHandler(c *gin.Context) {
	result := db.Where("id = ? AND user_id = ?", c.Param("id"), currentUserID(c)).Delete(&WishlistItem{})
	if result.Error != nil {
		RespondInternalError(c, "Failed to delete wishlist item")
		return
	}
	if result.RowsAffected == 0 {
		RespondNotFound(c, "Wishlist item not found")
		return
	}
	RespondSuccess(c, http.StatusOK, map[string]string{"deleted": c.Param("id")})
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
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"anomalies": anomalies})
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
		RespondNotFound(c, "Anomaly not found")
		return
	}
	var req resolveAnomalyRequest
	if err := c.BindJSON(&req); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}
	if req.Action == "dismiss" {
		anomaly.Status = "dismissed"
	} else {
		anomaly.Status = "confirmed"
	}
	db.Save(&anomaly)
	logAuditEvent(c, "RESOLVE_ANOMALY", "anomaly", &anomaly.ID, "action="+req.Action)
	RespondSuccess(c, http.StatusOK, anomaly)
}

// revokeAnomalyCheckinHandler invalidates the checkin that triggered this
// anomaly and claws back any score it awarded.
func revokeAnomalyCheckinHandler(c *gin.Context) {
	var anomaly Anomaly
	if err := db.First(&anomaly, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "Anomaly not found")
		return
	}
	if anomaly.CheckInID == nil {
		RespondValidationError(c, "This anomaly has no associated checkin", nil)
		return
	}
	var checkin CheckIn
	if err := db.First(&checkin, *anomaly.CheckInID).Error; err != nil {
		RespondNotFound(c, "Checkin not found")
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
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"checkin": checkin, "anomaly": anomaly})
}

// disableAnomalyDeviceHandler disables the NFC device implicated in this
// anomaly, e.g. after a tag is reported stolen or tampered with.
func disableAnomalyDeviceHandler(c *gin.Context) {
	var anomaly Anomaly
	if err := db.First(&anomaly, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "Anomaly not found")
		return
	}
	if anomaly.DeviceID == nil {
		RespondValidationError(c, "This anomaly has no associated device", nil)
		return
	}
	var device NFCDevice
	if err := db.First(&device, *anomaly.DeviceID).Error; err != nil {
		RespondNotFound(c, "Device not found")
		return
	}
	device.Status = "disabled"
	db.Save(&device)

	anomaly.Status = "confirmed"
	db.Save(&anomaly)

	logAuditEvent(c, "NFC_DEVICE_STATUS", "nfc_device", &device.ID, fmt.Sprintf("status=disabled anomaly=%d", anomaly.ID))
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"device": device, "anomaly": anomaly})
}

// banAnomalyUserHandler bans the user implicated in this anomaly, e.g. for
// a confirmed velocity-check violation (impossible cross-region travel).
func banAnomalyUserHandler(c *gin.Context) {
	var anomaly Anomaly
	if err := db.First(&anomaly, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "Anomaly not found")
		return
	}
	if anomaly.UserID == nil {
		RespondValidationError(c, "This anomaly has no associated user", nil)
		return
	}
	var user User
	if err := db.First(&user, *anomaly.UserID).Error; err != nil {
		RespondNotFound(c, "User not found")
		return
	}
	user.Banned = true
	db.Save(&user)

	anomaly.Status = "confirmed"
	db.Save(&anomaly)

	logAuditEvent(c, "BAN_USER", "user", &user.ID, fmt.Sprintf("email=%s anomaly=%d", user.Email, anomaly.ID))
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"user": user, "anomaly": anomaly})
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
