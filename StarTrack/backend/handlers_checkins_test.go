package main

import (
	"net/http"
	"testing"
)

type verifyCheckinResponse struct {
	Verified   bool    `json:"verified"`
	Message    string  `json:"message"`
	Restaurant string  `json:"restaurant"`
	Badge      string  `json:"badge"`
	NewBadges  []Badge `json:"new_badges"`
}

func seedCheckinFixture(t *testing.T) (Restaurant, NFCDevice) {
	t.Helper()
	restaurant := seedRestaurant(t, Restaurant{
		Name: "Aurum Table", Stars: 3, City: "Chicago", Cuisine: "Contemporary",
		YearAwarded: 2026, LocationLat: 41.8984, LocationLong: -87.6242,
	})
	device := seedNFCDevice(t, NFCDevice{TagID: "TAG-STAR-001", RestaurantID: restaurant.ID, Salt: "golden-salt-2026"})
	return restaurant, device
}

func TestVerifyCheckin_SucceedsWithCorrectSignatureAndLocation(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant, device := seedCheckinFixture(t)
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
		TagID:        device.TagID,
		Signature:    computeSignature(device.TagID, device.Salt),
		LocationLat:  restaurant.LocationLat,
		LocationLong: restaurant.LocationLong,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp verifyCheckinResponse
	decodeJSON(t, w, &resp)
	if !resp.Verified {
		t.Errorf("expected checkin to be verified, message: %s", resp.Message)
	}
}

func TestVerifyCheckin_WrongSignatureRejected(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant, device := seedCheckinFixture(t)
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
		TagID:        device.TagID,
		Signature:    "not-the-right-signature",
		LocationLat:  restaurant.LocationLat,
		LocationLong: restaurant.LocationLong,
	})
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for bad signature, got %d: %s", w.Code, w.Body.String())
	}
}

func TestVerifyCheckin_OutsideGeofenceNotVerified(t *testing.T) {
	router, _ := newTestApp(t)
	_, device := seedCheckinFixture(t)
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
		TagID:        device.TagID,
		Signature:    computeSignature(device.TagID, device.Salt),
		LocationLat:  40.7649, // New York — nowhere near the Chicago restaurant
		LocationLong: -73.9793,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 (signature was valid, just outside geofence), got %d: %s", w.Code, w.Body.String())
	}
	var resp verifyCheckinResponse
	decodeJSON(t, w, &resp)
	if resp.Verified {
		t.Error("expected checkin NOT to be verified when far outside the restaurant's geofence")
	}
}

func TestVerifyCheckin_UnknownTagRejected(t *testing.T) {
	router, _ := newTestApp(t)
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
		TagID: "TAG-DOES-NOT-EXIST", Signature: "whatever",
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for unknown tag, got %d: %s", w.Code, w.Body.String())
	}
}

func TestVerifyCheckin_RequiresAuth(t *testing.T) {
	router, _ := newTestApp(t)
	_, device := seedCheckinFixture(t)

	w := doRequest(t, router, http.MethodPost, "/api/checkins/verify", "", verifyCheckinRequest{
		TagID: device.TagID, Signature: computeSignature(device.TagID, device.Salt),
	})
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 without a token, got %d", w.Code)
	}
}

func TestVerifyCheckin_UnlocksNFCPioneerBadge(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant, device := seedCheckinFixture(t)
	seedBadges() // populate the badge catalog the same way seedData() does in production
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
		TagID:        device.TagID,
		Signature:    computeSignature(device.TagID, device.Salt),
		LocationLat:  restaurant.LocationLat,
		LocationLong: restaurant.LocationLong,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	badgesResp := doRequest(t, router, http.MethodGet, "/api/badges", token, nil)
	var body struct {
		Badges []struct {
			ID       string `json:"id"`
			Unlocked bool   `json:"unlocked"`
		} `json:"badges"`
	}
	decodeJSON(t, badgesResp, &body)

	found := false
	for _, b := range body.Badges {
		if b.ID == "b3" {
			found = true
			if !b.Unlocked {
				t.Error("expected NFC Pioneer (b3) to be unlocked after the first verified checkin")
			}
		}
	}
	if !found {
		t.Fatal("expected badge b3 to be present in the catalog")
	}
}

// Regression test: badgeRules b1/b2/b5/b6/b7/b9 all go through
// verifiedCheckinExists/distinctVerifiedRestaurantCount, which once queried
// a "checkins" table that doesn't exist (GORM names it "check_ins" for the
// CheckIn model) — those rules always silently evaluated false. b1 exercises
// that same code path.
func TestVerifyCheckin_Unlocks3StarConnoisseurBadge(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant, device := seedCheckinFixture(t) // Aurum Table is a 3-star restaurant
	seedBadges()
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
		TagID:        device.TagID,
		Signature:    computeSignature(device.TagID, device.Salt),
		LocationLat:  restaurant.LocationLat,
		LocationLong: restaurant.LocationLong,
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	badgesResp := doRequest(t, router, http.MethodGet, "/api/badges", token, nil)
	var body struct {
		Badges []struct {
			ID       string `json:"id"`
			Unlocked bool   `json:"unlocked"`
		} `json:"badges"`
	}
	decodeJSON(t, badgesResp, &body)

	for _, b := range body.Badges {
		if b.ID == "b1" && !b.Unlocked {
			t.Fatal("expected 3-Star Connoisseur (b1) to be unlocked after checking in at a 3-star restaurant")
		}
	}
}

// TestVerifyCheckin_CooldownRejectsImmediateRetry guards against a real
// incident: a network hiccup can make a checkin that actually succeeded look
// like it failed on the client, and the user retries — this must not
// double-award score/badges for what was one visit.
func TestVerifyCheckin_CooldownRejectsImmediateRetry(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant, device := seedCheckinFixture(t)
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	req := verifyCheckinRequest{
		TagID:        device.TagID,
		Signature:    computeSignature(device.TagID, device.Salt),
		LocationLat:  restaurant.LocationLat,
		LocationLong: restaurant.LocationLong,
	}

	first := doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, req)
	if first.Code != http.StatusOK {
		t.Fatalf("expected first checkin to succeed, got %d: %s", first.Code, first.Body.String())
	}

	retry := doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, req)
	if retry.Code != http.StatusConflict {
		t.Fatalf("expected 409 retrying right after a verified checkin, got %d: %s", retry.Code, retry.Body.String())
	}

	var user User
	db.Where("email = ?", "laura@example.com").First(&user)
	if user.Score != restaurant.Stars*10 {
		t.Errorf("expected score to be awarded only once (%d), got %d", restaurant.Stars*10, user.Score)
	}
}

func TestPassport_ReflectsVerifiedCheckin(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant, device := seedCheckinFixture(t)
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
		TagID:        device.TagID,
		Signature:    computeSignature(device.TagID, device.Salt),
		LocationLat:  restaurant.LocationLat,
		LocationLong: restaurant.LocationLong,
	})

	w := doRequest(t, router, http.MethodGet, "/api/checkins/me/passport", token, nil)
	var resp struct {
		VerifiedDays map[string]string `json:"verified_days"`
	}
	decodeJSON(t, w, &resp)
	if resp.VerifiedDays["1"] != "AT" {
		t.Errorf("expected slot 1 to be stamped 'AT' for Aurum Table, got %+v", resp.VerifiedDays)
	}
}
