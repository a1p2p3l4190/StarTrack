package main

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestListRestaurants_FiltersByCityCaseInsensitive(t *testing.T) {
	router, _ := newTestApp(t)
	seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago", Cuisine: "Contemporary", YearAwarded: 2026})
	seedRestaurant(t, Restaurant{Name: "Celeste Bistro", Stars: 2, City: "New York", Cuisine: "French", YearAwarded: 2025})

	w := doRequest(t, router, http.MethodGet, "/api/restaurants?city=chicago", "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Restaurants []Restaurant `json:"restaurants"`
	}
	decodeJSON(t, w, &resp)
	if len(resp.Restaurants) != 1 || resp.Restaurants[0].Name != "Aurum Table" {
		t.Errorf("expected only Aurum Table for city=chicago, got %+v", resp.Restaurants)
	}
}

func TestListRestaurants_FiltersByStars(t *testing.T) {
	router, _ := newTestApp(t)
	seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago"})
	seedRestaurant(t, Restaurant{Name: "Miroir Lounge", Stars: 1, City: "San Francisco"})

	w := doRequest(t, router, http.MethodGet, "/api/restaurants?stars=3", "", nil)
	var resp struct {
		Restaurants []Restaurant `json:"restaurants"`
	}
	decodeJSON(t, w, &resp)
	if len(resp.Restaurants) != 1 || resp.Restaurants[0].Stars != 3 {
		t.Errorf("expected only 3-star restaurants, got %+v", resp.Restaurants)
	}
}

func TestCreateRestaurant_RequiresAdmin(t *testing.T) {
	router, _ := newTestApp(t)
	userToken, _ := registerUser(t, router, "user@example.com", "hunter22", "Regular User")

	w := doRequest(t, router, http.MethodPost, "/api/restaurants", userToken, Restaurant{Name: "New Spot", Stars: 1, City: "Austin"})
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for non-admin create, got %d: %s", w.Code, w.Body.String())
	}

	w = doRequest(t, router, http.MethodPost, "/api/restaurants", "", Restaurant{Name: "New Spot", Stars: 1, City: "Austin"})
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for anonymous create, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateRestaurant_AdminSucceeds(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	w := doRequest(t, router, http.MethodPost, "/api/restaurants", adminToken, Restaurant{
		Name: "New Spot", Stars: 1, City: "Austin", Cuisine: "Tex-Mex", YearAwarded: 2026,
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 for admin create, got %d: %s", w.Code, w.Body.String())
	}
}

// Stars is only meaningfully constrained by the frontend's <input min/max>,
// which any HTTP client can bypass — this is the actual enforcement.
func TestCreateRestaurant_RejectsOutOfRangeStars(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	for _, stars := range []int{0, -1, 4, 999} {
		w := doRequest(t, router, http.MethodPost, "/api/restaurants", adminToken, Restaurant{
			Name: "Bad Stars", Stars: stars, City: "Austin",
		})
		if w.Code != http.StatusBadRequest {
			t.Errorf("stars=%d: expected 400, got %d: %s", stars, w.Code, w.Body.String())
		}
	}
}

func TestUpdateRestaurant_RejectsOutOfRangeStars(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	restaurant := seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago"})

	w := doRequest(t, router, http.MethodPut, fmt.Sprintf("/api/restaurants/%d", restaurant.ID), adminToken, Restaurant{
		Name: "Aurum Table", Stars: 7, City: "Chicago",
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for out-of-range stars on update, got %d: %s", w.Code, w.Body.String())
	}
}

func TestDeleteRestaurant_WritesAuditLog(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, adminID := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	restaurant := seedRestaurant(t, Restaurant{Name: "Doomed Bistro", Stars: 2, City: "Chicago"})

	w := doRequest(t, router, http.MethodDelete, fmt.Sprintf("/api/restaurants/%d", restaurant.ID), adminToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var logs []AdminAuditLog
	db.Where("action = ?", "DELETE_RESTAURANT").Find(&logs)
	if len(logs) != 1 {
		t.Fatalf("expected exactly one DELETE_RESTAURANT audit entry, got %d", len(logs))
	}
	if logs[0].AdminID != adminID {
		t.Errorf("expected audit log admin_id %d, got %d", adminID, logs[0].AdminID)
	}
	if logs[0].TargetID == nil || *logs[0].TargetID != restaurant.ID {
		t.Errorf("expected audit log target_id %d, got %+v", restaurant.ID, logs[0].TargetID)
	}
}

func TestListRestaurants_Pagination(t *testing.T) {
	router, _ := newTestApp(t)
	for i := 0; i < 15; i++ {
		seedRestaurant(t, Restaurant{Name: fmt.Sprintf("Spot %02d", i), Stars: 1, City: "Chicago"})
	}

	w := doRequest(t, router, http.MethodGet, "/api/restaurants?limit=10&page=1", "", nil)
	var resp struct {
		Restaurants []Restaurant `json:"restaurants"`
		Total       int64        `json:"total"`
	}
	decodeJSON(t, w, &resp)
	if resp.Total != 15 {
		t.Errorf("expected total=15, got %d", resp.Total)
	}
	if len(resp.Restaurants) != 10 {
		t.Errorf("expected 10 restaurants on page 1, got %d", len(resp.Restaurants))
	}

	w = doRequest(t, router, http.MethodGet, "/api/restaurants?limit=10&page=2", "", nil)
	decodeJSON(t, w, &resp)
	if len(resp.Restaurants) != 5 {
		t.Errorf("expected 5 restaurants on page 2, got %d", len(resp.Restaurants))
	}
}

func TestNFCDeviceStatus_DisabledDeviceRejectsCheckin(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	restaurant, device := seedCheckinFixture(t)
	userToken, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodPatch, fmt.Sprintf("/api/nfc-devices/%d/status", device.ID), adminToken, gin.H{"status": "disabled"})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 disabling device, got %d: %s", w.Code, w.Body.String())
	}

	w = doRequest(t, router, http.MethodPost, "/api/checkins/verify", userToken, verifyCheckinRequest{
		TagID:        device.TagID,
		Signature:    computeSignature(device.TagID, device.Salt),
		LocationLat:  restaurant.LocationLat,
		LocationLong: restaurant.LocationLong,
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected disabled device to reject checkin with 400, got %d: %s", w.Code, w.Body.String())
	}
	var resp verifyCheckinResponse
	decodeJSON(t, w, &resp)
	if resp.Verified {
		t.Error("expected verified=false for a disabled device")
	}
}
