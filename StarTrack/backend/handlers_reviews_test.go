package main

import (
	"fmt"
	"net/http"
	"testing"
)

func TestReviewEligibility_FalseWithoutCheckin(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant := seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago"})
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/review-eligibility"), token, nil)
	var resp struct {
		Eligible bool `json:"eligible"`
	}
	decodeJSON(t, w, &resp)
	if resp.Eligible {
		t.Error("expected eligible=false when the user has never checked in")
	}
}

func TestCreateReview_ForbiddenWithoutVerifiedCheckin(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant := seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago"})
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodPost, restaurantPath(restaurant, "/reviews"), token, createReviewRequest{
		Rating: 5, Comment: "Incredible tasting menu.",
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
		Eligible bool `json:"eligible"`
	}
	decodeJSON(t, eligibility, &eligResp)
	if !eligResp.Eligible {
		t.Fatal("expected eligible=true after a verified checkin")
	}

	w := doRequest(t, router, http.MethodPost, restaurantPath(restaurant, "/reviews"), token, createReviewRequest{
		Rating: 5, Comment: "Incredible tasting menu.", FoodPhotoLabel: "Seared Wagyu",
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
}

func restaurantPath(r Restaurant, suffix string) string {
	return fmt.Sprintf("/api/restaurants/%d%s", r.ID, suffix)
}
