package main

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type reviewPhotoInput struct {
	URL   string `json:"url" binding:"required"`
	Label string `json:"label"`
}

type reviewPhotoResponse struct {
	ID    uint   `json:"id"`
	URL   string `json:"url"`
	Label string `json:"label"`
}

type reviewResponse struct {
	ID           uint                  `json:"id"`
	RestaurantID uint                  `json:"restaurant_id"`
	UserID       uint                  `json:"user_id"`
	CheckinID    *uint                 `json:"checkin_id"`
	Author       string                `json:"author"`
	Rating       int                   `json:"rating"`
	Comment      string                `json:"comment"`
	Photos       []reviewPhotoResponse `json:"photos"`
	CreatedAt    time.Time             `json:"created_at"`
	UpdatedAt    time.Time             `json:"updated_at"`
}

func toReviewResponse(r Review, authorName string, photos []ReviewPhoto) reviewResponse {
	photoOut := make([]reviewPhotoResponse, 0, len(photos))
	for _, p := range photos {
		photoOut = append(photoOut, reviewPhotoResponse{ID: p.ID, URL: p.URL, Label: p.Label})
	}
	return reviewResponse{
		ID: r.ID, RestaurantID: r.RestaurantID, UserID: r.UserID, CheckinID: r.CheckInID,
		Author: authorName, Rating: r.Rating, Comment: r.Comment, Photos: photoOut,
		CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
	}
}

// createReviewPhotos inserts photo rows for a review, skipping blank URLs,
// and returns the rows so callers can build a response without a re-query.
func createReviewPhotos(reviewID uint, inputs []reviewPhotoInput) []ReviewPhoto {
	photos := make([]ReviewPhoto, 0, len(inputs))
	for i, in := range inputs {
		url := strings.TrimSpace(in.URL)
		if url == "" {
			continue
		}
		photos = append(photos, ReviewPhoto{ReviewID: reviewID, URL: url, Label: strings.TrimSpace(in.Label), Position: i})
	}
	if len(photos) > 0 {
		db.Create(&photos)
	}
	return photos
}

func listReviewsHandler(c *gin.Context) {
	restaurantID := c.Param("id")
	var reviews []Review
	db.Preload("Author").Where("restaurant_id = ?", restaurantID).Order("created_at desc").Find(&reviews)

	reviewIDs := make([]uint, 0, len(reviews))
	for _, r := range reviews {
		reviewIDs = append(reviewIDs, r.ID)
	}
	var photos []ReviewPhoto
	if len(reviewIDs) > 0 {
		db.Where("review_id IN ?", reviewIDs).Order("position asc, id asc").Find(&photos)
	}
	photosByReview := make(map[uint][]ReviewPhoto, len(reviews))
	for _, p := range photos {
		photosByReview[p.ReviewID] = append(photosByReview[p.ReviewID], p)
	}

	out := make([]reviewResponse, 0, len(reviews))
	for _, r := range reviews {
		out = append(out, toReviewResponse(r, r.Author.DisplayName, photosByReview[r.ID]))
	}
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"reviews": out})
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

	RespondSuccess(c, http.StatusOK, map[string]interface{}{"eligible": len(visits) > 0, "reviewable_visits": visits})
}

type createReviewRequest struct {
	CheckinID uint               `json:"checkin_id" binding:"required"`
	Rating    int                `json:"rating" binding:"required,min=1,max=5"`
	Comment   string             `json:"comment" binding:"required"`
	Photos    []reviewPhotoInput `json:"photos"`
}

func createReviewHandler(c *gin.Context) {
	userID := currentUserID(c)
	restaurantID := c.Param("id")

	var req createReviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}

	var restaurant Restaurant
	if err := db.First(&restaurant, restaurantID).Error; err != nil {
		RespondNotFound(c, "Restaurant not found")
		return
	}

	var checkin CheckIn
	if err := db.Where("id = ? AND user_id = ? AND restaurant_id = ? AND verified = ?", req.CheckinID, userID, restaurant.ID, true).
		First(&checkin).Error; err != nil {
		RespondForbidden(c, "A verified checkin at this restaurant is required to review it")
		return
	}

	var alreadyReviewed int64
	db.Model(&Review{}).Where("checkin_id = ? AND user_id = ?", checkin.ID, userID).Count(&alreadyReviewed)
	if alreadyReviewed > 0 {
		RespondConflict(c, "You've already reviewed this visit — edit that review instead")
		return
	}

	review := Review{
		RestaurantID: restaurant.ID,
		UserID:       userID,
		CheckInID:    &checkin.ID,
		Rating:       req.Rating,
		Comment:      req.Comment,
	}
	if err := db.Create(&review).Error; err != nil {
		RespondInternalError(c, "Failed to create review")
		return
	}
	photos := createReviewPhotos(review.ID, req.Photos)

	db.Model(&User{}).Where("id = ?", userID).UpdateColumn("score", gorm.Expr("score + ?", 5))
	newBadges := evaluateBadgesForUser(userID)

	var author User
	db.First(&author, userID)

	// Create notification for review creation
	db.Create(&Notification{
		UserID:  userID,
		Kind:    "review",
		Title:   "Review posted at " + restaurant.Name,
		Message: fmt.Sprintf("Your %d-star review has been shared with the community.", req.Rating),
	})

	RespondSuccess(c, http.StatusCreated, map[string]interface{}{
		"review":     toReviewResponse(review, author.DisplayName, photos),
		"new_badges": newBadges,
	})
}

type updateReviewRequest struct {
	Rating  int                `json:"rating" binding:"required,min=1,max=5"`
	Comment string             `json:"comment" binding:"required"`
	Photos  []reviewPhotoInput `json:"photos"`
}

type reviewReportRequest struct {
	Reason  string `json:"reason" binding:"required,oneof=spam abusive offensive false_info other"`
	Details string `json:"details"`
}

func listReviewReportsHandler(c *gin.Context) {
	var reports []ReviewReport
	if err := db.Order("created_at desc").Find(&reports).Error; err != nil {
		RespondInternalError(c, "Failed to fetch review reports")
		return
	}
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"reports": reports})
}

func reportReviewHandler(c *gin.Context) {
	userID := currentUserID(c)
	var review Review
	if err := db.First(&review, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "Review not found")
		return
	}

	var req reviewReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}

	var existingOpen int64
	db.Model(&ReviewReport{}).Where("review_id = ? AND user_id = ? AND status = ?", review.ID, userID, "open").Count(&existingOpen)
	if existingOpen > 0 {
		RespondConflict(c, "You've already reported this review — it's pending moderator review")
		return
	}

	report := ReviewReport{
		ReviewID: review.ID,
		UserID:   userID,
		Reason:   req.Reason,
		Details:  req.Details,
		Status:   "open",
	}
	if err := db.Create(&report).Error; err != nil {
		RespondInternalError(c, "Failed to create review report")
		return
	}

	RespondSuccess(c, http.StatusCreated, map[string]interface{}{"report": report, "status": "open"})
}

type resolveReviewReportRequest struct {
	Action string `json:"action" binding:"required,oneof=dismiss delete_review"`
}

// resolveReviewReportHandler allows admins to dismiss reports or delete the flagged review.
func resolveReviewReportHandler(c *gin.Context) {
	var report ReviewReport
	if err := db.First(&report, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "Report not found")
		return
	}

	var req resolveReviewReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}

	if req.Action == "dismiss" {
		report.Status = "dismissed"
		if err := db.Save(&report).Error; err != nil {
			RespondInternalError(c, "Failed to dismiss report")
			return
		}
		logAuditEvent(c, "DISMISS_REVIEW_REPORT", "review_report", &report.ID, fmt.Sprintf("report_id=%d", report.ID))
	} else if req.Action == "delete_review" {
		var review Review
		if err := db.First(&review, report.ReviewID).Error; err != nil {
			RespondNotFound(c, "Review not found")
			return
		}

		// Soft delete the review
		if err := db.Delete(&review).Error; err != nil {
			RespondInternalError(c, "Failed to delete review")
			return
		}

		// Mark report as resolved
		report.Status = "resolved"
		if err := db.Save(&report).Error; err != nil {
			RespondInternalError(c, "Failed to update report status")
			return
		}

		logAuditEvent(c, "DELETE_REPORTED_REVIEW", "review", &review.ID, fmt.Sprintf("report_id=%d", report.ID))
	}

	RespondSuccess(c, http.StatusOK, map[string]interface{}{"report": report, "action": req.Action})
}

func updateReviewHandler(c *gin.Context) {
	userID := currentUserID(c)

	var review Review
	if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&review).Error; err != nil {
		RespondNotFound(c, "Review not found")
		return
	}

	var req updateReviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}

	review.Rating = req.Rating
	review.Comment = req.Comment
	if err := db.Save(&review).Error; err != nil {
		RespondInternalError(c, "Failed to update review")
		return
	}

	// Photos are fully replaced on each edit — simplest correct way to
	// support add/remove/reorder without diffing old vs new.
	db.Where("review_id = ?", review.ID).Delete(&ReviewPhoto{})
	photos := createReviewPhotos(review.ID, req.Photos)

	var author User
	db.First(&author, userID)
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"review": toReviewResponse(review, author.DisplayName, photos)})
}

// deleteReviewHandler soft-deletes (via Review.DeletedAt) so the review
// disappears from every normal query but stays recoverable at the DB level.
func deleteReviewHandler(c *gin.Context) {
	userID := currentUserID(c)
	reviewID := c.Param("id")
	result := db.Where("id = ? AND user_id = ?", reviewID, userID).Delete(&Review{})
	if result.Error != nil {
		RespondInternalError(c, "Failed to delete review")
		return
	}
	if result.RowsAffected == 0 {
		RespondNotFound(c, "Review not found")
		return
	}
	db.Where("review_id = ?", reviewID).Delete(&ReviewPhoto{})
	RespondSuccess(c, http.StatusOK, map[string]string{"deleted": reviewID})
}
