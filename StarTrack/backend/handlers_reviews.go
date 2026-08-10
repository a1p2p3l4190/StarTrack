package main

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const reviewUnlockWindow = 7 * 24 * time.Hour

type reviewResponse struct {
	ID             uint      `json:"id"`
	RestaurantID   uint      `json:"restaurant_id"`
	Author         string    `json:"author"`
	Rating         int       `json:"rating"`
	Comment        string    `json:"comment"`
	FoodPhotoLabel string    `json:"food_photo_label"`
	MenuLabel      string    `json:"menu_label"`
	CreatedAt      time.Time `json:"created_at"`
}

func listReviewsHandler(c *gin.Context) {
	restaurantID := c.Param("id")
	var reviews []Review
	db.Preload("Author").Where("restaurant_id = ?", restaurantID).Order("created_at desc").Find(&reviews)

	out := make([]reviewResponse, 0, len(reviews))
	for _, r := range reviews {
		out = append(out, reviewResponse{
			ID: r.ID, RestaurantID: r.RestaurantID, Author: r.Author.DisplayName,
			Rating: r.Rating, Comment: r.Comment,
			FoodPhotoLabel: r.FoodPhotoLabel, MenuLabel: r.MenuLabel, CreatedAt: r.CreatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"reviews": out})
}

// reviewEligibilityHandler tells the client whether the current user can
// review this restaurant right now (verified checkin within the last 7
// days), so the UI can show/hide the review composer without guessing.
func reviewEligibilityHandler(c *gin.Context) {
	userID := currentUserID(c)
	restaurantID := c.Param("id")

	eligible := hasRecentVerifiedCheckin(userID, restaurantID)
	c.JSON(http.StatusOK, gin.H{"eligible": eligible})
}

type createReviewRequest struct {
	Rating         int    `json:"rating"`
	Comment        string `json:"comment" binding:"required"`
	FoodPhotoLabel string `json:"food_photo_label"`
	MenuLabel      string `json:"menu_label"`
}

func createReviewHandler(c *gin.Context) {
	userID := currentUserID(c)
	restaurantID := c.Param("id")

	if !hasRecentVerifiedCheckin(userID, restaurantID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "a verified checkin within the last 7 days is required to review this restaurant"})
		return
	}

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

	review := Review{
		RestaurantID:   restaurant.ID,
		UserID:         userID,
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
		"review": reviewResponse{
			ID: review.ID, RestaurantID: review.RestaurantID, Author: author.DisplayName,
			Rating: review.Rating, Comment: review.Comment,
			FoodPhotoLabel: review.FoodPhotoLabel, MenuLabel: review.MenuLabel, CreatedAt: review.CreatedAt,
		},
		"new_badges": newBadges,
	})
}

func hasRecentVerifiedCheckin(userID uint, restaurantID string) bool {
	var count int64
	cutoff := time.Now().Add(-reviewUnlockWindow)
	db.Model(&CheckIn{}).
		Where("user_id = ? AND restaurant_id = ? AND verified = ? AND verified_at >= ?", userID, restaurantID, true, cutoff).
		Count(&count)
	return count > 0
}
