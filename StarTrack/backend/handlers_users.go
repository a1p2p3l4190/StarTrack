package main

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// listUsersHandler supports the admin portal's member lookup — search by
// email or display name so support can find an account from a ticket.
func listUsersHandler(c *gin.Context) {
	var users []User
	query := db.Order("created_at desc")
	if q := c.Query("search"); q != "" {
		like := "%" + q + "%"
		query = query.Where("LOWER(email) LIKE LOWER(?) OR LOWER(display_name) LIKE LOWER(?)", like, like)
	}
	query.Find(&users)
	c.JSON(http.StatusOK, gin.H{"users": users})
}

// getUserHistoryHandler is the admin equivalent of the mobile app's
// passport — every checkin attempt (not just verified ones), so support
// can see failed attempts when diagnosing a complaint.
func getUserHistoryHandler(c *gin.Context) {
	var user User
	if err := db.First(&user, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	var checkins []CheckIn
	db.Preload("Restaurant").Where("user_id = ?", user.ID).Order("created_at desc").Find(&checkins)
	c.JSON(http.StatusOK, gin.H{"user": user, "checkins": checkins})
}

func banUserHandler(c *gin.Context) {
	var user User
	if err := db.First(&user, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	user.Banned = true
	db.Save(&user)
	logAuditEvent(c, "BAN_USER", "user", &user.ID, user.Email)
	c.JSON(http.StatusOK, user)
}

func unbanUserHandler(c *gin.Context) {
	var user User
	if err := db.First(&user, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	user.Banned = false
	db.Save(&user)
	logAuditEvent(c, "UNBAN_USER", "user", &user.ID, user.Email)
	c.JSON(http.StatusOK, user)
}

type manualVerifyRequest struct {
	UserID       uint   `json:"user_id" binding:"required"`
	RestaurantID uint   `json:"restaurant_id" binding:"required"`
	Note         string `json:"note"`
}

// manualVerifyCheckinHandler lets an admin back-fill a verified checkin for
// a customer whose physical NFC tap failed but who has other proof of
// dining (e.g. a receipt), awarding score and evaluating badges exactly
// like a real verified tap would.
func manualVerifyCheckinHandler(c *gin.Context) {
	var req manualVerifyRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var user User
	if err := db.First(&user, req.UserID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	var restaurant Restaurant
	if err := db.First(&restaurant, req.RestaurantID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "restaurant not found"})
		return
	}

	adminID := currentUserID(c)
	signature := fmt.Sprintf("manual-override:admin-%d", adminID)
	if req.Note != "" {
		signature = fmt.Sprintf("manual-override:admin-%d:%s", adminID, req.Note)
	}

	now := time.Now()
	record := CheckIn{
		UserID:       req.UserID,
		RestaurantID: req.RestaurantID,
		NFCSignature: signature,
		Verified:     true,
		VerifiedAt:   &now,
		CreatedAt:    now,
	}
	if err := db.Create(&record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	db.Model(&User{}).Where("id = ?", req.UserID).Updates(map[string]interface{}{
		"score":  gorm.Expr("score + ?", restaurant.Stars*10),
		"region": restaurant.City,
	})
	newBadges := evaluateBadgesForUser(req.UserID)

	logAuditEvent(c, "MANUAL_VERIFY_CHECKIN", "checkin", &record.ID, fmt.Sprintf("user=%d restaurant=%d note=%s", req.UserID, req.RestaurantID, req.Note))

	c.JSON(http.StatusCreated, gin.H{"checkin": record, "new_badges": newBadges})
}
