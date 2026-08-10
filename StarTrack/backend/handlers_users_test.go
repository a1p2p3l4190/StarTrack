package main

import (
	"fmt"
	"net/http"
	"testing"
)

func TestListUsers_SearchByEmailOrName(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")
	registerUser(t, router, "bob@example.com", "hunter22", "Bob Jones")

	w := doRequest(t, router, http.MethodGet, "/api/users?search=laura", adminToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Users []User `json:"users"`
	}
	decodeJSON(t, w, &resp)
	if len(resp.Users) != 1 || resp.Users[0].Email != "laura@example.com" {
		t.Errorf("expected only laura@example.com, got %+v", resp.Users)
	}
}

func TestListUsers_RequiresAdmin(t *testing.T) {
	router, _ := newTestApp(t)
	userToken, _ := registerUser(t, router, "user@example.com", "hunter22", "Regular User")

	w := doRequest(t, router, http.MethodGet, "/api/users", userToken, nil)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for non-admin, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGetUserHistory_ReturnsCheckins(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	restaurant, device := seedCheckinFixture(t)
	userToken, userID := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	doRequest(t, router, http.MethodPost, "/api/checkins/verify", userToken, verifyCheckinRequest{
		TagID: device.TagID, Signature: computeSignature(device.TagID, device.Salt),
		LocationLat: restaurant.LocationLat, LocationLong: restaurant.LocationLong,
	})

	w := doRequest(t, router, http.MethodGet, fmt.Sprintf("/api/users/%d/history", userID), adminToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		User     User      `json:"user"`
		Checkins []CheckIn `json:"checkins"`
	}
	decodeJSON(t, w, &resp)
	if len(resp.Checkins) != 1 {
		t.Fatalf("expected 1 checkin in history, got %d", len(resp.Checkins))
	}
	if !resp.Checkins[0].Verified {
		t.Error("expected the checkin to be verified")
	}
}

func TestBanUser_PreventsSubsequentLogin(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	_, userID := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodPost, fmt.Sprintf("/api/users/%d/ban", userID), adminToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 banning user, got %d: %s", w.Code, w.Body.String())
	}

	w = doRequest(t, router, http.MethodPost, "/api/auth/login", "", loginRequest{Email: "laura@example.com", Password: "hunter22"})
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 login for banned user, got %d: %s", w.Code, w.Body.String())
	}

	var logs []AdminAuditLog
	db.Where("action = ? AND target_id = ?", "BAN_USER", userID).Find(&logs)
	if len(logs) != 1 {
		t.Errorf("expected exactly one BAN_USER audit entry, got %d", len(logs))
	}

	w = doRequest(t, router, http.MethodPost, fmt.Sprintf("/api/users/%d/unban", userID), adminToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 unbanning user, got %d: %s", w.Code, w.Body.String())
	}
	w = doRequest(t, router, http.MethodPost, "/api/auth/login", "", loginRequest{Email: "laura@example.com", Password: "hunter22"})
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 login after unban, got %d: %s", w.Code, w.Body.String())
	}
}

func TestManualVerifyCheckin_AwardsScoreAndBadges(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	seedBadges()
	restaurant := seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago"})
	_, userID := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodPost, "/api/checkins/manual-verify", adminToken, manualVerifyRequest{
		UserID: userID, RestaurantID: restaurant.ID, Note: "receipt #1234",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Checkin   CheckIn `json:"checkin"`
		NewBadges []Badge `json:"new_badges"`
	}
	decodeJSON(t, w, &resp)
	if !resp.Checkin.Verified {
		t.Error("expected manually-verified checkin to be marked verified")
	}

	var user User
	db.First(&user, userID)
	if user.Score != restaurant.Stars*10 {
		t.Errorf("expected score %d, got %d", restaurant.Stars*10, user.Score)
	}

	foundBadge := false
	for _, b := range resp.NewBadges {
		if b.Code == "b1" {
			foundBadge = true
		}
	}
	if !foundBadge {
		t.Error("expected 3-Star Connoisseur (b1) to unlock from a manually-verified 3-star checkin")
	}

	var logs []AdminAuditLog
	db.Where("action = ?", "MANUAL_VERIFY_CHECKIN").Find(&logs)
	if len(logs) != 1 {
		t.Errorf("expected exactly one MANUAL_VERIFY_CHECKIN audit entry, got %d", len(logs))
	}
}

func TestManualVerifyCheckin_RequiresAdmin(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant := seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago"})
	userToken, userID := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodPost, "/api/checkins/manual-verify", userToken, manualVerifyRequest{
		UserID: userID, RestaurantID: restaurant.ID,
	})
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for non-admin manual verify, got %d: %s", w.Code, w.Body.String())
	}
}
