package main

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type reviewResponse struct {
	ID             uint      `json:"id"`
	RestaurantID   uint      `json:"restaurant_id"`
	UserID         uint      `json:"user_id"`
	CheckinID      *uint     `json:"checkin_id"`
	Author         string    `json:"author"`
	Rating         int       `json:"rating"`
	Comment        string    `json:"comment"`
	FoodPhotoLabel string    `json:"food_photo_label"`
	MenuLabel      string    `json:"menu_label"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func toReviewResponse(r Review, authorName string) reviewResponse {
	return reviewResponse{
		ID: r.ID, RestaurantID: r.RestaurantID, UserID: r.UserID, CheckinID: r.CheckInID,
		Author: authorName, Rating: r.Rating, Comment: r.Comment,
		FoodPhotoLabel: r.FoodPhotoLabel, MenuLabel: r.MenuLabel,
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

func listReviewsHandler(c *gin.Context) {
	restaurantID := c.Param("id")
	var reviews []Review
	db.Preload("Author").Where("restaurant_id = ?", restaurantID).Order("created_at desc").Find(&reviews)

	out := make([]reviewResponse, 0, len(reviews))
	for _, r := range reviews {
		out = append(out, toReviewResponse(r, r.Author.DisplayName))
	}
	c.JSON(http.StatusOK, gin.H{"reviews": out})
}

type reviewableVisit struct {
	CheckinID  uint      `json:"checkin_id"`
	VerifiedAt time.Time `json:"verified_at"`
}

// reviewEligibilityHandler tells the client which of the current user's
// verified visits to this restaurant don't have a review yet, so the UI can
// offer one review slot per unreviewed visit.
func reviewEligibilityHandler(c *gin.Context) {
	userID := currentUserID(c)
	restaurantID := c.Param("id")

	var checkins []CheckIn
	db.Where("user_id = ? AND restaurant_id = ? AND verified = ?", userID, restaurantID, true).
		Order("verified_at desc").
		Find(&checkins)

	var reviewedCheckinIDs []uint
	db.Model(&Review{}).
		Where("user_id = ? AND restaurant_id = ? AND checkin_id IS NOT NULL", userID, restaurantID).
		Pluck("checkin_id", &reviewedCheckinIDs)
	reviewed := make(map[uint]bool, len(reviewedCheckinIDs))
	for _, id := range reviewedCheckinIDs {
		reviewed[id] = true
	}

	visits := make([]reviewableVisit, 0, len(checkins))
	for _, ci := range checkins {
		if ci.VerifiedAt == nil || reviewed[ci.ID] {
			continue
		}
		visits = append(visits, reviewableVisit{CheckinID: ci.ID, VerifiedAt: *ci.VerifiedAt})
	}

	c.JSON(http.StatusOK, gin.H{"eligible": len(visits) > 0, "reviewable_visits": visits})
}

type createReviewRequest struct {
	CheckinID      uint   `json:"checkin_id" binding:"required"`
	Rating         int    `json:"rating"`
	Comment        string `json:"comment" binding:"required"`
	FoodPhotoLabel string `json:"food_photo_label"`
	MenuLabel      string `json:"menu_label"`
}

func createReviewHandler(c *gin.Context) {
	userID := currentUserID(c)
	restaurantID := c.Param("id")

	var req createReviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Rating < 1 || req.Rating > 5 {
		req.Rating = 5
	}

	var restaurant Restaurant
	if err := db.First(&restaurant, restaurantID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "restaurant not found"})
		return
	}

	var checkin CheckIn
	if err := db.Where("id = ? AND user_id = ? AND restaurant_id = ? AND verified = ?", req.CheckinID, userID, restaurant.ID, true).
		First(&checkin).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "a verified checkin at this restaurant is required to review it"})
		return
	}

	var alreadyReviewed int64
	db.Model(&Review{}).Where("checkin_id = ? AND user_id = ?", checkin.ID, userID).Count(&alreadyReviewed)
	if alreadyReviewed > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "you've already reviewed this visit — edit that review instead"})
		return
	}

	review := Review{
		RestaurantID:   restaurant.ID,
		UserID:         userID,
		CheckInID:      &checkin.ID,
		Rating:         req.Rating,
		Comment:        req.Comment,
		FoodPhotoLabel: req.FoodPhotoLabel,
		MenuLabel:      req.MenuLabel,
	}
	if err := db.Create(&review).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	db.Model(&User{}).Where("id = ?", userID).UpdateColumn("score", gorm.Expr("score + ?", 5))
	newBadges := evaluateBadgesForUser(userID)

	var author User
	db.First(&author, userID)

	c.JSON(http.StatusCreated, gin.H{
		"review":     toReviewResponse(review, author.DisplayName),
		"new_badges": newBadges,
	})
}

type updateReviewRequest struct {
	Rating         int    `json:"rating"`
	Comment        string `json:"comment" binding:"required"`
	FoodPhotoLabel string `json:"food_photo_label"`
	MenuLabel      string `json:"menu_label"`
}

func updateReviewHandler(c *gin.Context) {
	userID := currentUserID(c)

	var review Review
	if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&review).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "review not found"})
		return
	}

	var req updateReviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Rating < 1 || req.Rating > 5 {
		req.Rating = review.Rating
	}

	review.Rating = req.Rating
	review.Comment = req.Comment
	review.FoodPhotoLabel = req.FoodPhotoLabel
	review.MenuLabel = req.MenuLabel
	if err := db.Save(&review).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var author User
	db.First(&author, userID)
	c.JSON(http.StatusOK, gin.H{"review": toReviewResponse(review, author.DisplayName)})
}

// deleteReviewHandler soft-deletes (via Review.DeletedAt) so the review
// disappears from every normal query but stays recoverable at the DB level.
func deleteReviewHandler(c *gin.Context) {
	userID := currentUserID(c)
	result := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).Delete(&Review{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "review not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": c.Param("id")})
}
