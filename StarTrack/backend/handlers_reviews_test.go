package main

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestReviewEligibility_EmptyWithoutCheckin(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant := seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago"})
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/review-eligibility"), token, nil)
	var resp struct {
		Eligible         bool              `json:"eligible"`
		ReviewableVisits []reviewableVisit `json:"reviewable_visits"`
	}
	decodeJSON(t, w, &resp)
	if resp.Eligible || len(resp.ReviewableVisits) != 0 {
		t.Errorf("expected no reviewable visits when the user has never checked in, got %+v", resp)
	}
}

func TestCreateReview_ForbiddenWithoutVerifiedCheckin(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant := seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago"})
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodPost, restaurantPath(restaurant, "/reviews"), token, createReviewRequest{
		CheckinID: 999, Rating: 5, Comment: "Incredible tasting menu.",
	})
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 without a verified checkin, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateReview_SucceedsAfterVerifiedCheckin(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant, device := seedCheckinFixture(t)
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	checkinResp := doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
		TagID:        device.TagID,
		Signature:    computeSignature(device.TagID, device.Salt),
		LocationLat:  restaurant.LocationLat,
		LocationLong: restaurant.LocationLong,
	})
	if checkinResp.Code != http.StatusOK {
		t.Fatalf("fixture checkin failed: %d %s", checkinResp.Code, checkinResp.Body.String())
	}

	eligibility := doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/review-eligibility"), token, nil)
	var eligResp struct {
		Eligible         bool              `json:"eligible"`
		ReviewableVisits []reviewableVisit `json:"reviewable_visits"`
	}
	decodeJSON(t, eligibility, &eligResp)
	if !eligResp.Eligible || len(eligResp.ReviewableVisits) != 1 {
		t.Fatalf("expected exactly one reviewable visit after a verified checkin, got %+v", eligResp)
	}
	checkinID := eligResp.ReviewableVisits[0].CheckinID

	w := doRequest(t, router, http.MethodPost, restaurantPath(restaurant, "/reviews"), token, createReviewRequest{
		CheckinID: checkinID, Rating: 5, Comment: "Incredible tasting menu.",
		Photos: []reviewPhotoInput{{URL: "https://example.com/wagyu.jpg", Label: "Seared Wagyu"}},
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating a review after a verified checkin, got %d: %s", w.Code, w.Body.String())
	}

	list := doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/reviews"), "", nil)
	var listResp struct {
		Reviews []reviewResponse `json:"reviews"`
	}
	decodeJSON(t, list, &listResp)
	if len(listResp.Reviews) != 1 || listResp.Reviews[0].Author != "Laura Liu" {
		t.Errorf("expected one review authored by Laura Liu, got %+v", listResp.Reviews)
	}

	// A second review against the same visit is rejected...
	dupe := doRequest(t, router, http.MethodPost, restaurantPath(restaurant, "/reviews"), token, createReviewRequest{
		CheckinID: checkinID, Rating: 4, Comment: "Trying to review the same visit twice.",
	})
	if dupe.Code != http.StatusConflict {
		t.Errorf("expected 409 reviewing the same visit twice, got %d: %s", dupe.Code, dupe.Body.String())
	}

	// ...and that visit no longer shows up as reviewable.
	eligibilityAfter := doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/review-eligibility"), token, nil)
	decodeJSON(t, eligibilityAfter, &eligResp)
	if eligResp.Eligible || len(eligResp.ReviewableVisits) != 0 {
		t.Errorf("expected no reviewable visits left after reviewing the only checkin, got %+v", eligResp)
	}
}

func TestReview_MultiplePhotosRoundTripThroughCreateAndUpdate(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant, device := seedCheckinFixture(t)
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
		TagID: device.TagID, Signature: computeSignature(device.TagID, device.Salt),
		LocationLat: restaurant.LocationLat, LocationLong: restaurant.LocationLong,
	})
	var eligResp struct {
		ReviewableVisits []reviewableVisit `json:"reviewable_visits"`
	}
	decodeJSON(t, doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/review-eligibility"), token, nil), &eligResp)
	checkinID := eligResp.ReviewableVisits[0].CheckinID

	create := doRequest(t, router, http.MethodPost, restaurantPath(restaurant, "/reviews"), token, createReviewRequest{
		CheckinID: checkinID, Rating: 4, Comment: "Loved it.",
		Photos: []reviewPhotoInput{
			{URL: "https://example.com/food.jpg", Label: "Wagyu"},
			{URL: "https://example.com/menu.jpg"},
			{URL: "https://example.com/interior.jpg"},
		},
	})
	if create.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", create.Code, create.Body.String())
	}
	var created struct {
		Review reviewResponse `json:"review"`
	}
	decodeJSON(t, create, &created)
	if created.Review.Rating != 4 {
		t.Errorf("expected rating 4 to round-trip, got %d", created.Review.Rating)
	}
	if len(created.Review.Photos) != 3 || created.Review.Photos[0].URL != "https://example.com/food.jpg" || created.Review.Photos[0].Label != "Wagyu" {
		t.Fatalf("expected 3 photos on create response, got %+v", created.Review.Photos)
	}

	reviewPath := fmt.Sprintf("/api/reviews/%d", created.Review.ID)
	edit := doRequest(t, router, http.MethodPut, reviewPath, token, updateReviewRequest{
		Rating: 2, Comment: "Actually, it was mediocre.",
		Photos: []reviewPhotoInput{{URL: "https://example.com/food2.jpg"}},
	})
	if edit.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", edit.Code, edit.Body.String())
	}
	var edited struct {
		Review reviewResponse `json:"review"`
	}
	decodeJSON(t, edit, &edited)
	if edited.Review.Rating != 2 {
		t.Errorf("expected updated rating 2 to round-trip, got %d", edited.Review.Rating)
	}
	if len(edited.Review.Photos) != 1 || edited.Review.Photos[0].URL != "https://example.com/food2.jpg" {
		t.Fatalf("expected the photo set to be replaced down to 1 photo, got %+v", edited.Review.Photos)
	}

	list := doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/reviews"), "", nil)
	var listResp struct {
		Reviews []reviewResponse `json:"reviews"`
	}
	decodeJSON(t, list, &listResp)
	if len(listResp.Reviews) != 1 || len(listResp.Reviews[0].Photos) != 1 || listResp.Reviews[0].Photos[0].URL != "https://example.com/food2.jpg" {
		t.Errorf("expected listing to reflect the updated photo set, got %+v", listResp.Reviews)
	}
}

func TestCreateReview_RejectsInvalidRating(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant, device := seedCheckinFixture(t)
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
		TagID: device.TagID, Signature: computeSignature(device.TagID, device.Salt),
		LocationLat: restaurant.LocationLat, LocationLong: restaurant.LocationLong,
	})
	var eligResp struct {
		ReviewableVisits []reviewableVisit `json:"reviewable_visits"`
	}
	decodeJSON(t, doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/review-eligibility"), token, nil), &eligResp)
	checkinID := eligResp.ReviewableVisits[0].CheckinID

	for _, rating := range []int{0, 6, -1} {
		w := doRequest(t, router, http.MethodPost, restaurantPath(restaurant, "/reviews"), token, createReviewRequest{
			CheckinID: checkinID, Rating: rating, Comment: "Should be rejected.",
		})
		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400 for rating %d, got %d: %s", rating, w.Code, w.Body.String())
		}
	}
}

func TestUpdateReview_OwnerOnly(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant, device := seedCheckinFixture(t)
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")
	otherToken, _ := registerUser(t, router, "other@example.com", "hunter22", "Other User")

	doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
		TagID: device.TagID, Signature: computeSignature(device.TagID, device.Salt),
		LocationLat: restaurant.LocationLat, LocationLong: restaurant.LocationLong,
	})
	var eligResp struct {
		ReviewableVisits []reviewableVisit `json:"reviewable_visits"`
	}
	decodeJSON(t, doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/review-eligibility"), token, nil), &eligResp)
	checkinID := eligResp.ReviewableVisits[0].CheckinID

	createResp := doRequest(t, router, http.MethodPost, restaurantPath(restaurant, "/reviews"), token, createReviewRequest{
		CheckinID: checkinID, Rating: 3, Comment: "Good, not great.",
	})
	var created struct {
		Review reviewResponse `json:"review"`
	}
	decodeJSON(t, createResp, &created)
	reviewPath := fmt.Sprintf("/api/reviews/%d", created.Review.ID)

	// The author can edit it.
	edit := doRequest(t, router, http.MethodPut, reviewPath, token, updateReviewRequest{Rating: 5, Comment: "Actually, incredible."})
	if edit.Code != http.StatusOK {
		t.Fatalf("expected 200 editing own review, got %d: %s", edit.Code, edit.Body.String())
	}

	// Someone else cannot.
	forbiddenEdit := doRequest(t, router, http.MethodPut, reviewPath, otherToken, updateReviewRequest{Rating: 1, Comment: "Hijacked."})
	if forbiddenEdit.Code != http.StatusNotFound {
		t.Errorf("expected 404 editing someone else's review, got %d: %s", forbiddenEdit.Code, forbiddenEdit.Body.String())
	}

	// Someone else cannot delete it either.
	forbiddenDelete := doRequest(t, router, http.MethodDelete, reviewPath, otherToken, nil)
	if forbiddenDelete.Code != http.StatusNotFound {
		t.Errorf("expected 404 deleting someone else's review, got %d: %s", forbiddenDelete.Code, forbiddenDelete.Body.String())
	}

	// The author can delete it, which frees the visit up to be reviewed again.
	del := doRequest(t, router, http.MethodDelete, reviewPath, token, nil)
	if del.Code != http.StatusOK {
		t.Fatalf("expected 200 deleting own review, got %d: %s", del.Code, del.Body.String())
	}
	decodeJSON(t, doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/review-eligibility"), token, nil), &eligResp)
	if len(eligResp.ReviewableVisits) != 1 {
		t.Errorf("expected the visit to be reviewable again after deleting its review, got %+v", eligResp.ReviewableVisits)
	}
}

func TestReportReview_CreatesReport(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant, device := seedCheckinFixture(t)
	token, _ := registerUser(t, router, "reporter@example.com", "hunter22", "Reporter")

	checkinResp := doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
		TagID:        device.TagID,
		Signature:    computeSignature(device.TagID, device.Salt),
		LocationLat:  restaurant.LocationLat,
		LocationLong: restaurant.LocationLong,
	})
	if checkinResp.Code != http.StatusOK {
		t.Fatalf("fixture checkin failed: %d %s", checkinResp.Code, checkinResp.Body.String())
	}

	var eligResp struct {
		ReviewableVisits []reviewableVisit `json:"reviewable_visits"`
	}
	decodeJSON(t, doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/review-eligibility"), token, nil), &eligResp)
	if len(eligResp.ReviewableVisits) == 0 {
		t.Fatal("expected a reviewable visit to exist")
	}

	create := doRequest(t, router, http.MethodPost, restaurantPath(restaurant, "/reviews"), token, createReviewRequest{
		CheckinID: eligResp.ReviewableVisits[0].CheckinID,
		Rating:    3,
		Comment:   "This had an issue with service.",
	})
	if create.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating a review, got %d: %s", create.Code, create.Body.String())
	}
	var created struct {
		Review reviewResponse `json:"review"`
	}
	decodeJSON(t, create, &created)

	report := doRequest(t, router, http.MethodPost, fmt.Sprintf("/api/reviews/%d/report", created.Review.ID), token, gin.H{
		"reason":  "spam",
		"details": "This review contains repeated false claims.",
	})
	if report.Code != http.StatusCreated {
		t.Fatalf("expected 201 reporting a review, got %d: %s", report.Code, report.Body.String())
	}
	var resp map[string]interface{}
	decodeJSON(t, report, &resp)
	if resp["status"] == nil || resp["status"] != "open" {
		t.Fatalf("expected returned status to be open; got %+v", resp)
	}

	// The same reporter filing a second report against the same still-open
	// report must be rejected rather than flooding the moderation queue.
	dupe := doRequest(t, router, http.MethodPost, fmt.Sprintf("/api/reviews/%d/report", created.Review.ID), token, gin.H{
		"reason": "abusive",
	})
	if dupe.Code != http.StatusConflict {
		t.Errorf("expected 409 for a duplicate open report from the same user, got %d: %s", dupe.Code, dupe.Body.String())
	}
}

func TestListReviewReports_AdminOnlyAndReturnsReports(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant, device := seedCheckinFixture(t)
	userToken, _ := registerUser(t, router, "reporter@example.com", "hunter22", "Reporter")
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "StarTrack123!", "Admin User")
	otherToken, _ := registerUser(t, router, "reviewer@example.com", "hunter22", "Reviewer")

	doRequest(t, router, http.MethodPost, "/api/checkins/verify", userToken, verifyCheckinRequest{
		TagID:        device.TagID,
		Signature:    computeSignature(device.TagID, device.Salt),
		LocationLat:  restaurant.LocationLat,
		LocationLong: restaurant.LocationLong,
	})

	var eligResp struct {
		ReviewableVisits []reviewableVisit `json:"reviewable_visits"`
	}
	decodeJSON(t, doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/review-eligibility"), userToken, nil), &eligResp)
	if len(eligResp.ReviewableVisits) == 0 {
		t.Fatal("expected a reviewable visit to exist")
	}

	create := doRequest(t, router, http.MethodPost, restaurantPath(restaurant, "/reviews"), userToken, createReviewRequest{
		CheckinID: eligResp.ReviewableVisits[0].CheckinID,
		Rating:    3,
		Comment:   "This had an issue with service.",
	})
	if create.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating review, got %d: %s", create.Code, create.Body.String())
	}
	var created struct {
		Review reviewResponse `json:"review"`
	}
	decodeJSON(t, create, &created)

	report := doRequest(t, router, http.MethodPost, fmt.Sprintf("/api/reviews/%d/report", created.Review.ID), otherToken, gin.H{
		"reason":  "spam",
		"details": "Repeated false claims.",
	})
	if report.Code != http.StatusCreated {
		t.Fatalf("expected 201 reporting review, got %d: %s", report.Code, report.Body.String())
	}

	userList := doRequest(t, router, http.MethodGet, "/api/reports", userToken, nil)
	if userList.Code != http.StatusForbidden {
		t.Fatalf("expected non-admin to be blocked from report list, got %d: %s", userList.Code, userList.Body.String())
	}

	adminList := doRequest(t, router, http.MethodGet, "/api/reports", adminToken, nil)
	if adminList.Code != http.StatusOK {
		t.Fatalf("expected 200 listing reports as admin, got %d: %s", adminList.Code, adminList.Body.String())
	}
	var reportList struct {
		Reports []ReviewReport `json:"reports"`
	}
	decodeJSON(t, adminList, &reportList)
	if len(reportList.Reports) != 1 {
		t.Fatalf("expected one report in report list, got %+v", reportList.Reports)
	}
}

func TestResolveReviewReport_DismissAndDeleteReview(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant, device := seedCheckinFixture(t)
	reviewerToken, _ := registerUser(t, router, "reviewer@example.com", "hunter22", "Reviewer")
	reviewer2Token, _ := registerUser(t, router, "reviewer2@example.com", "hunter22", "Reviewer 2")
	reporterToken, _ := registerUser(t, router, "reporter@example.com", "hunter22", "Reporter")
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "StarTrack123!", "Admin User")

	// User 1 creates a review
	verifyResp := doRequest(t, router, http.MethodPost, "/api/checkins/verify", reviewerToken, verifyCheckinRequest{
		TagID:        device.TagID,
		Signature:    computeSignature(device.TagID, device.Salt),
		LocationLat:  restaurant.LocationLat,
		LocationLong: restaurant.LocationLong,
	})
	if verifyResp.Code != http.StatusOK {
		t.Fatalf("expected 200 verifying checkin, got %d: %s", verifyResp.Code, verifyResp.Body.String())
	}

	var eligResp struct {
		ReviewableVisits []reviewableVisit `json:"reviewable_visits"`
	}
	decodeJSON(t, doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/review-eligibility"), reviewerToken, nil), &eligResp)
	if len(eligResp.ReviewableVisits) == 0 {
		t.Fatal("expected a reviewable visit to exist")
	}

	createResp := doRequest(t, router, http.MethodPost, restaurantPath(restaurant, "/reviews"), reviewerToken, createReviewRequest{
		CheckinID: eligResp.ReviewableVisits[0].CheckinID,
		Rating:    3,
		Comment:   "This had an issue with service.",
	})
	if createResp.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating review, got %d: %s", createResp.Code, createResp.Body.String())
	}
	var created struct {
		Review reviewResponse `json:"review"`
	}
	decodeJSON(t, createResp, &created)
	reviewID := created.Review.ID

	// Reporter reports the review
	reportResp := doRequest(t, router, http.MethodPost, fmt.Sprintf("/api/reviews/%d/report", reviewID), reporterToken, gin.H{
		"reason":  "spam",
		"details": "Repeated false claims.",
	})
	if reportResp.Code != http.StatusCreated {
		t.Fatalf("expected 201 reporting review, got %d: %s", reportResp.Code, reportResp.Body.String())
	}
	var reportResp2 struct {
		Report ReviewReport `json:"report"`
	}
	decodeJSON(t, reportResp, &reportResp2)
	reportID := reportResp2.Report.ID

	// Test 1: Dismiss the report
	dismissResp := doRequest(t, router, http.MethodPatch, fmt.Sprintf("/api/reports/%d/resolve", reportID), adminToken, gin.H{
		"action": "dismiss",
	})
	if dismissResp.Code != http.StatusOK {
		t.Fatalf("expected 200 dismissing report, got %d: %s", dismissResp.Code, dismissResp.Body.String())
	}

	// Verify report status is now dismissed
	adminListResp := doRequest(t, router, http.MethodGet, "/api/reports", adminToken, nil)
	var dismissedReports struct {
		Reports []ReviewReport `json:"reports"`
	}
	decodeJSON(t, adminListResp, &dismissedReports)
	var foundReport *ReviewReport
	for _, r := range dismissedReports.Reports {
		if r.ID == reportID {
			foundReport = &r
			break
		}
	}
	if foundReport == nil || foundReport.Status != "dismissed" {
		t.Fatalf("expected dismissed report with status 'dismissed', got %+v", foundReport)
	}

	// Test 2: Create another review by a different user and delete it via report
	device2 := seedNFCDevice(t, NFCDevice{TagID: "TAG-STAR-002", RestaurantID: restaurant.ID, Salt: "silver-salt-2026"})
	verifyResp2 := doRequest(t, router, http.MethodPost, "/api/checkins/verify", reviewer2Token, verifyCheckinRequest{
		TagID:        device2.TagID,
		Signature:    computeSignature(device2.TagID, device2.Salt),
		LocationLat:  restaurant.LocationLat,
		LocationLong: restaurant.LocationLong,
	})
	if verifyResp2.Code != http.StatusOK {
		t.Fatalf("expected 200 verifying second checkin, got %d: %s", verifyResp2.Code, verifyResp2.Body.String())
	}

	var eligResp2 struct {
		ReviewableVisits []reviewableVisit `json:"reviewable_visits"`
	}
	decodeJSON(t, doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/review-eligibility"), reviewer2Token, nil), &eligResp2)
	if len(eligResp2.ReviewableVisits) == 0 {
		t.Fatal("expected a reviewable visit to exist for second review")
	}

	createResp2 := doRequest(t, router, http.MethodPost, restaurantPath(restaurant, "/reviews"), reviewer2Token, createReviewRequest{
		CheckinID: eligResp2.ReviewableVisits[0].CheckinID,
		Rating:    4,
		Comment:   "Better this time.",
	})
	var created2 struct {
		Review reviewResponse `json:"review"`
	}
	decodeJSON(t, createResp2, &created2)
	reviewID2 := created2.Review.ID

	// Report the second review
	reportResp3 := doRequest(t, router, http.MethodPost, fmt.Sprintf("/api/reviews/%d/report", reviewID2), reporterToken, gin.H{
		"reason":  "abusive",
		"details": "Offensive language.",
	})
	var reportResp3Data struct {
		Report ReviewReport `json:"report"`
	}
	decodeJSON(t, reportResp3, &reportResp3Data)
	reportID2 := reportResp3Data.Report.ID

	// Delete the review via report resolution
	deleteResp := doRequest(t, router, http.MethodPatch, fmt.Sprintf("/api/reports/%d/resolve", reportID2), adminToken, gin.H{
		"action": "delete_review",
	})
	if deleteResp.Code != http.StatusOK {
		t.Fatalf("expected 200 deleting review via report, got %d: %s", deleteResp.Code, deleteResp.Body.String())
	}

	// Verify report status is now resolved
	adminListResp2 := doRequest(t, router, http.MethodGet, "/api/reports", adminToken, nil)
	var resolvedReports struct {
		Reports []ReviewReport `json:"reports"`
	}
	decodeJSON(t, adminListResp2, &resolvedReports)
	var foundReport2 *ReviewReport
	for _, r := range resolvedReports.Reports {
		if r.ID == reportID2 {
			foundReport2 = &r
			break
		}
	}
	if foundReport2 == nil || foundReport2.Status != "resolved" {
		t.Fatalf("expected resolved report with status 'resolved', got %+v", foundReport2)
	}

	// Verify the review is actually deleted
	reviewCheckResp := doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/reviews"), reviewer2Token, nil)
	var reviews struct {
		Reviews []reviewResponse `json:"reviews"`
	}
	decodeJSON(t, reviewCheckResp, &reviews)
	for _, r := range reviews.Reviews {
		if r.ID == reviewID2 {
			t.Fatalf("expected review %d to be deleted, but it still exists", reviewID2)
		}
	}
}

func restaurantPath(r Restaurant, suffix string) string {
	return fmt.Sprintf("/api/restaurants/%d%s", r.ID, suffix)
}
