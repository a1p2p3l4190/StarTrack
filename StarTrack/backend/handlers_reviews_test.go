package main

import (
	"fmt"
	"net/http"
	"testing"
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
		CheckinID: checkinID, Rating: 5, Comment: "Incredible tasting menu.", FoodPhotoLabel: "Seared Wagyu",
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

func restaurantPath(r Restaurant, suffix string) string {
	return fmt.Sprintf("/api/restaurants/%d%s", r.ID, suffix)
}
