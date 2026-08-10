package main

import (
	"net/http"
	"testing"
)

func TestAdminStats_TotalsAndTopRestaurants(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	restaurant, device := seedCheckinFixture(t)
	userToken, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	doRequest(t, router, http.MethodPost, "/api/checkins/verify", userToken, verifyCheckinRequest{
		TagID: device.TagID, Signature: computeSignature(device.TagID, device.Salt),
		LocationLat: restaurant.LocationLat, LocationLong: restaurant.LocationLong,
	})

	w := doRequest(t, router, http.MethodGet, "/api/admin/stats", adminToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		TotalCheckins    int64               `json:"total_checkins"`
		VerifiedCheckins int64               `json:"verified_checkins"`
		TopRestaurants   []topRestaurantStat `json:"top_restaurants"`
		DailyTrend       []dailyCheckinStat  `json:"daily_trend"`
		CityBreakdown    []cityCheckinStat   `json:"city_breakdown"`
	}
	decodeJSON(t, w, &resp)

	if resp.TotalCheckins != 1 || resp.VerifiedCheckins != 1 {
		t.Errorf("expected 1 total and 1 verified checkin, got total=%d verified=%d", resp.TotalCheckins, resp.VerifiedCheckins)
	}
	if len(resp.TopRestaurants) != 1 || resp.TopRestaurants[0].Name != restaurant.Name {
		t.Errorf("expected top restaurant %q, got %+v", restaurant.Name, resp.TopRestaurants)
	}
	if len(resp.DailyTrend) != 7 {
		t.Errorf("expected 7 days of daily trend data, got %d", len(resp.DailyTrend))
	}
	totalFromTrend := 0
	for _, d := range resp.DailyTrend {
		totalFromTrend += d.Total
	}
	if totalFromTrend != 1 {
		t.Errorf("expected daily trend to sum to 1 checkin, got %d", totalFromTrend)
	}
	if len(resp.CityBreakdown) != 1 || resp.CityBreakdown[0].City != restaurant.City || resp.CityBreakdown[0].Count != 1 {
		t.Errorf("expected city breakdown for %q with count 1, got %+v", restaurant.City, resp.CityBreakdown)
	}
}

func TestAdminStats_RequiresAdmin(t *testing.T) {
	router, _ := newTestApp(t)
	userToken, _ := registerUser(t, router, "user@example.com", "hunter22", "Regular User")

	w := doRequest(t, router, http.MethodGet, "/api/admin/stats", userToken, nil)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for non-admin, got %d: %s", w.Code, w.Body.String())
	}
}
