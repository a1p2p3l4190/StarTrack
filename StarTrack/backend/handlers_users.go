package main

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// userSortColumns whitelists which columns the admin portal's Users table
// may sort by — never interpolate c.Query("sort") directly into SQL.
var userSortColumns = map[string]string{
	"created_at":   "created_at",
	"display_name": "display_name",
	"email":        "email",
	"score":        "score",
	"region":       "region",
}

// listUsersHandler supports the admin portal's member lookup — search by
// email or display name so support can find an account from a ticket.
// Omitting "limit" returns the full unpaginated list, matching
// listRestaurantsHandler's convention (other callers rely on the full set).
func listUsersHandler(c *gin.Context) {
	var users []User
	query := db.Model(&User{})
	if q := c.Query("search"); q != "" {
		like := "%" + q + "%"
		query = query.Where("LOWER(email) LIKE LOWER(?) OR LOWER(display_name) LIKE LOWER(?)", like, like)
	}

	column, ok := userSortColumns[c.Query("sort")]
	if !ok {
		column = "created_at"
	}
	direction := "desc"
	if c.Query("order") == "asc" {
		direction = "asc"
	}
	query = query.Order(column + " " + direction)

	limitStr := c.Query("limit")
	if limitStr == "" {
		query.Find(&users)
		RespondSuccess(c, http.StatusOK, map[string]interface{}{"users": users})
		return
	}

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 20
	}
	page, err := strconv.Atoi(c.Query("page"))
	if err != nil || page <= 0 {
		page = 1
	}

	var total int64
	query.Count(&total)
	query.Offset((page - 1) * limit).Limit(limit).Find(&users)

	meta := &Metadata{Pagination: &PaginationMeta{Page: page, Limit: limit, Total: int(total)}}
	RespondSuccessWithMeta(c, http.StatusOK, map[string]interface{}{"users": users}, meta)
}

// getUserHistoryHandler is the admin equivalent of the mobile app's
// passport — every checkin attempt (not just verified ones), so support
// can see failed attempts when diagnosing a complaint.
func getUserHistoryHandler(c *gin.Context) {
	var user User
	if err := db.First(&user, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "User not found")
		return
	}
	checkins := []CheckIn{}
	db.Preload("Restaurant").Where("user_id = ?", user.ID).Order("created_at desc").Find(&checkins)
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"user": user, "checkins": checkins})
}

func banUserHandler(c *gin.Context) {
	var user User
	if err := db.First(&user, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "User not found")
		return
	}
	user.Banned = true
	db.Save(&user)
	logAuditEvent(c, "BAN_USER", "user", &user.ID, user.Email)
	RespondSuccess(c, http.StatusOK, user)
}

func unbanUserHandler(c *gin.Context) {
	var user User
	if err := db.First(&user, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "User not found")
		return
	}
	user.Banned = false
	db.Save(&user)
	logAuditEvent(c, "UNBAN_USER", "user", &user.ID, user.Email)
	RespondSuccess(c, http.StatusOK, user)
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
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}
	var user User
	if err := db.First(&user, req.UserID).Error; err != nil {
		RespondNotFound(c, "User not found")
		return
	}
	var restaurant Restaurant
	if err := db.First(&restaurant, req.RestaurantID).Error; err != nil {
		RespondNotFound(c, "Restaurant not found")
		return
	}
	currentStars := currentRestaurantStars(restaurant.ID)

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
		RespondInternalError(c, "Failed to create manual verification checkin")
		return
	}

	db.Model(&User{}).Where("id = ?", req.UserID).Updates(map[string]interface{}{
		"score":  gorm.Expr("score + ?", currentStars*10),
		"region": restaurant.City,
	})
	newBadges := evaluateBadgesForUser(req.UserID)

	logAuditEvent(c, "MANUAL_VERIFY_CHECKIN", "checkin", &record.ID, fmt.Sprintf("user=%d restaurant=%d note=%s", req.UserID, req.RestaurantID, req.Note))

	RespondSuccess(c, http.StatusCreated, map[string]interface{}{"checkin": record, "new_badges": newBadges})
}
