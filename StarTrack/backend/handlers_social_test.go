package main

import (
	"fmt"
	"net/http"
	"testing"
)

func TestWishlist_AddListAndRemove(t *testing.T) {
	router, _ := newTestApp(t)
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	create := doRequest(t, router, http.MethodPost, "/api/wishlist", token, createWishlistRequest{
		RestaurantName: "Noir Atelier", Note: "Next release: 1 May",
	})
	if create.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating wishlist item, got %d: %s", create.Code, create.Body.String())
	}
	var created WishlistItem
	decodeJSON(t, create, &created)

	list := doRequest(t, router, http.MethodGet, "/api/wishlist", token, nil)
	var listResp struct {
		Wishlist []WishlistItem `json:"wishlist"`
	}
	decodeJSON(t, list, &listResp)
	if len(listResp.Wishlist) != 1 || listResp.Wishlist[0].RestaurantName != "Noir Atelier" {
		t.Fatalf("expected one wishlist item, got %+v", listResp.Wishlist)
	}

	del := doRequest(t, router, http.MethodDelete, fmt.Sprintf("/api/wishlist/%d", created.ID), token, nil)
	if del.Code != http.StatusOK {
		t.Fatalf("expected 200 deleting own wishlist item, got %d: %s", del.Code, del.Body.String())
	}

	list = doRequest(t, router, http.MethodGet, "/api/wishlist", token, nil)
	decodeJSON(t, list, &listResp)
	if len(listResp.Wishlist) != 0 {
		t.Errorf("expected wishlist to be empty after deletion, got %+v", listResp.Wishlist)
	}
}

func TestWishlist_CannotDeleteAnotherUsersItem(t *testing.T) {
	router, _ := newTestApp(t)
	tokenA, _ := registerUser(t, router, "a@example.com", "hunter22", "User A")
	tokenB, _ := registerUser(t, router, "b@example.com", "hunter22", "User B")

	create := doRequest(t, router, http.MethodPost, "/api/wishlist", tokenA, createWishlistRequest{RestaurantName: "Noir Atelier"})
	var created WishlistItem
	decodeJSON(t, create, &created)

	del := doRequest(t, router, http.MethodDelete, fmt.Sprintf("/api/wishlist/%d", created.ID), tokenB, nil)
	if del.Code != http.StatusNotFound {
		t.Errorf("expected 404 when deleting someone else's wishlist item, got %d: %s", del.Code, del.Body.String())
	}
}

func TestLeaderboard_OrdersByScoreDescending(t *testing.T) {
	router, _ := newTestApp(t)
	_, lowID := registerUser(t, router, "low@example.com", "hunter22", "Low Scorer")
	_, highID := registerUser(t, router, "high@example.com", "hunter22", "High Scorer")

	db.Model(&User{}).Where("id = ?", lowID).Update("score", 10)
	db.Model(&User{}).Where("id = ?", highID).Update("score", 500)

	w := doRequest(t, router, http.MethodGet, "/api/leaderboard", "", nil)
	var resp struct {
		Leaderboard []struct {
			Name  string `json:"name"`
			Score int    `json:"score"`
		} `json:"leaderboard"`
	}
	decodeJSON(t, w, &resp)
	if len(resp.Leaderboard) < 2 {
		t.Fatalf("expected at least 2 leaderboard entries, got %+v", resp.Leaderboard)
	}
	if resp.Leaderboard[0].Name != "High Scorer" {
		t.Errorf("expected High Scorer to rank first, got %+v", resp.Leaderboard)
	}
}

func TestAnomalies_RequiresAdmin(t *testing.T) {
	router, _ := newTestApp(t)
	userToken, _ := registerUser(t, router, "user@example.com", "hunter22", "Regular User")

	w := doRequest(t, router, http.MethodGet, "/api/anomalies", userToken, nil)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for non-admin, got %d: %s", w.Code, w.Body.String())
	}

	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	w = doRequest(t, router, http.MethodGet, "/api/anomalies", adminToken, nil)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 for admin, got %d: %s", w.Code, w.Body.String())
	}
}

func TestVerifyCheckin_VelocityAnomalyFlagged(t *testing.T) {
	router, _ := newTestApp(t)
	chicago := seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago", LocationLat: 41.8984, LocationLong: -87.6242})
	newYork := seedRestaurant(t, Restaurant{Name: "Celeste Bistro", Stars: 2, City: "New York", LocationLat: 40.7649, LocationLong: -73.9793})
	chicagoDevice := seedNFCDevice(t, NFCDevice{TagID: "TAG-STAR-001", RestaurantID: chicago.ID, Salt: "golden-salt-2026"})
	nyDevice := seedNFCDevice(t, NFCDevice{TagID: "TAG-STAR-002", RestaurantID: newYork.ID, Salt: "ruby-salt-2025"})

	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
		TagID: chicagoDevice.TagID, Signature: computeSignature(chicagoDevice.TagID, chicagoDevice.Salt),
		LocationLat: chicago.LocationLat, LocationLong: chicago.LocationLong,
	})
	doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
		TagID: nyDevice.TagID, Signature: computeSignature(nyDevice.TagID, nyDevice.Salt),
		LocationLat: newYork.LocationLat, LocationLong: newYork.LocationLong,
	})

	w := doRequest(t, router, http.MethodGet, "/api/anomalies", adminToken, nil)
	var resp struct {
		Anomalies []Anomaly `json:"anomalies"`
	}
	decodeJSON(t, w, &resp)

	found := false
	for _, a := range resp.Anomalies {
		if a.Severity == "high" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected a high-severity velocity anomaly for two verified checkins 1100km apart within minutes, got %+v", resp.Anomalies)
	}
}

// seedOpenAnomaly creates a velocity-style anomaly wired to a real checkin,
// device, and user — enough state for every resolution action to have
// something concrete to act on.
func seedOpenAnomaly(t *testing.T, userID uint, restaurant Restaurant, device NFCDevice, checkin CheckIn) Anomaly {
	t.Helper()
	anomaly := Anomaly{
		UserID: &userID, RestaurantID: &restaurant.ID, DeviceID: &device.ID, CheckInID: &checkin.ID,
		Description: "test anomaly", Severity: "high", Status: "open",
	}
	if err := db.Create(&anomaly).Error; err != nil {
		t.Fatalf("failed to seed anomaly: %v", err)
	}
	return anomaly
}

func TestResolveAnomaly_DismissAndConfirm(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, adminID := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	restaurant, device := seedCheckinFixture(t)
	_, userID := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")
	checkin := CheckIn{UserID: userID, RestaurantID: restaurant.ID, Verified: true}
	db.Create(&checkin)
	anomaly := seedOpenAnomaly(t, userID, restaurant, device, checkin)

	w := doRequest(t, router, http.MethodPatch, fmt.Sprintf("/api/anomalies/%d/resolve", anomaly.ID), adminToken, resolveAnomalyRequest{Action: "dismiss"})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var updated Anomaly
	db.First(&updated, anomaly.ID)
	if updated.Status != "dismissed" {
		t.Errorf("expected status=dismissed, got %q", updated.Status)
	}

	var logs []AdminAuditLog
	db.Where("action = ? AND admin_id = ?", "RESOLVE_ANOMALY", adminID).Find(&logs)
	if len(logs) != 1 {
		t.Errorf("expected exactly one RESOLVE_ANOMALY audit entry, got %d", len(logs))
	}
}

func TestRevokeAnomalyCheckin_ClawsBackScore(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	restaurant, device := seedCheckinFixture(t) // 3 stars
	_, userID := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")
	db.Model(&User{}).Where("id = ?", userID).Update("score", 30)
	checkin := CheckIn{UserID: userID, RestaurantID: restaurant.ID, Verified: true}
	db.Create(&checkin)
	anomaly := seedOpenAnomaly(t, userID, restaurant, device, checkin)

	w := doRequest(t, router, http.MethodPost, fmt.Sprintf("/api/anomalies/%d/revoke-checkin", anomaly.ID), adminToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var updatedCheckin CheckIn
	db.First(&updatedCheckin, checkin.ID)
	if !updatedCheckin.Revoked || updatedCheckin.Verified {
		t.Errorf("expected checkin to be revoked and unverified, got revoked=%v verified=%v", updatedCheckin.Revoked, updatedCheckin.Verified)
	}

	var user User
	db.First(&user, userID)
	if user.Score != 0 {
		t.Errorf("expected score clawed back to 0 (30 - 3*10), got %d", user.Score)
	}

	var updatedAnomaly Anomaly
	db.First(&updatedAnomaly, anomaly.ID)
	if updatedAnomaly.Status != "confirmed" {
		t.Errorf("expected anomaly status=confirmed, got %q", updatedAnomaly.Status)
	}
}

func TestDisableAnomalyDevice_BlocksFutureCheckins(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	restaurant, device := seedCheckinFixture(t)
	userToken, userID := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")
	checkin := CheckIn{UserID: userID, RestaurantID: restaurant.ID, Verified: true}
	db.Create(&checkin)
	anomaly := seedOpenAnomaly(t, userID, restaurant, device, checkin)

	w := doRequest(t, router, http.MethodPost, fmt.Sprintf("/api/anomalies/%d/disable-device", anomaly.ID), adminToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	w = doRequest(t, router, http.MethodPost, "/api/checkins/verify", userToken, verifyCheckinRequest{
		TagID: device.TagID, Signature: computeSignature(device.TagID, device.Salt),
		LocationLat: restaurant.LocationLat, LocationLong: restaurant.LocationLong,
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected checkin against a disabled device to be rejected, got %d: %s", w.Code, w.Body.String())
	}
}

func TestBanAnomalyUser_PreventsLogin(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	restaurant, device := seedCheckinFixture(t)
	_, userID := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")
	checkin := CheckIn{UserID: userID, RestaurantID: restaurant.ID, Verified: true}
	db.Create(&checkin)
	anomaly := seedOpenAnomaly(t, userID, restaurant, device, checkin)

	w := doRequest(t, router, http.MethodPost, fmt.Sprintf("/api/anomalies/%d/ban-user", anomaly.ID), adminToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	w = doRequest(t, router, http.MethodPost, "/api/auth/login", "", loginRequest{Email: "laura@example.com", Password: "hunter22"})
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 login for banned user, got %d: %s", w.Code, w.Body.String())
	}
}

func TestAnomalyActions_MissingAssociationRejected(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	anomaly := Anomaly{Description: "no associations", Severity: "low", Status: "open"}
	db.Create(&anomaly)

	for _, path := range []string{"revoke-checkin", "disable-device", "ban-user"} {
		w := doRequest(t, router, http.MethodPost, fmt.Sprintf("/api/anomalies/%d/%s", anomaly.ID, path), adminToken, nil)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400 for anomaly with no association, got %d: %s", path, w.Code, w.Body.String())
		}
	}
}
