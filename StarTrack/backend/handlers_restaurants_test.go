package main

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestNextReleaseDate(t *testing.T) {
	from := time.Date(2026, time.March, 15, 12, 0, 0, 0, time.UTC)

	if got := nextReleaseDate(0, from); got != nil {
		t.Errorf("expected nil for day=0 (no schedule), got %v", got)
	}

	// Release day later this month — stays in March.
	got := nextReleaseDate(20, from)
	if got == nil || got.Month() != time.March || got.Day() != 20 {
		t.Errorf("expected March 20, got %v", got)
	}

	// Release day already passed this month — rolls to April.
	got = nextReleaseDate(10, from)
	if got == nil || got.Month() != time.April || got.Day() != 10 {
		t.Errorf("expected April 10 (rolled over), got %v", got)
	}

	// Day 31 in a 30-day April clamps to the 30th, not July.
	aprilFrom := time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC)
	got = nextReleaseDate(31, aprilFrom)
	if got == nil || got.Month() != time.April || got.Day() != 30 {
		t.Errorf("expected April 30 (clamped), got %v", got)
	}
}

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

func TestRestaurant_NextReservationReleaseComputedOnRead(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	create := doRequest(t, router, http.MethodPost, "/api/restaurants", adminToken, Restaurant{
		Name: "Aurum Table", Stars: 3, City: "Chicago", ReservationReleaseDay: 1,
	})
	if create.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", create.Code, create.Body.String())
	}
	var created Restaurant
	decodeJSON(t, create, &created)
	if created.NextReservationRelease == nil {
		t.Fatalf("expected next_reservation_release to be computed on create response")
	}
	if created.NextReservationRelease.Day() != 1 {
		t.Errorf("expected next release on the 1st, got %v", created.NextReservationRelease)
	}

	get := doRequest(t, router, http.MethodGet, fmt.Sprintf("/api/restaurants/%d", created.ID), "", nil)
	var fetched Restaurant
	decodeJSON(t, get, &fetched)
	if fetched.NextReservationRelease == nil || fetched.NextReservationRelease.Day() != 1 {
		t.Errorf("expected GET by id to also compute next_reservation_release, got %+v", fetched.NextReservationRelease)
	}

	list := doRequest(t, router, http.MethodGet, "/api/restaurants", "", nil)
	var listResp struct {
		Restaurants []Restaurant `json:"restaurants"`
	}
	decodeJSON(t, list, &listResp)
	if len(listResp.Restaurants) != 1 || listResp.Restaurants[0].NextReservationRelease == nil {
		t.Errorf("expected list endpoint to also compute next_reservation_release, got %+v", listResp.Restaurants)
	}

	// Restaurants with no recurring schedule shouldn't get a fabricated date.
	noSchedule := doRequest(t, router, http.MethodPost, "/api/restaurants", adminToken, Restaurant{
		Name: "No Schedule Bistro", Stars: 1, City: "Austin",
	})
	var noScheduleRestaurant Restaurant
	decodeJSON(t, noSchedule, &noScheduleRestaurant)
	if noScheduleRestaurant.NextReservationRelease != nil {
		t.Errorf("expected nil next_reservation_release with no release day set, got %v", noScheduleRestaurant.NextReservationRelease)
	}
}

func TestCreateRestaurant_RejectsOutOfRangeReleaseDay(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	for _, day := range []int{-1, 32, 999} {
		w := doRequest(t, router, http.MethodPost, "/api/restaurants", adminToken, Restaurant{
			Name: "Bad Release Day", Stars: 1, City: "Austin", ReservationReleaseDay: day,
		})
		if w.Code != http.StatusBadRequest {
			t.Errorf("release day=%d: expected 400, got %d: %s", day, w.Code, w.Body.String())
		}
	}
}

func TestCreateRestaurant_RejectsOutOfRangePriceTier(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	for _, tier := range []int{-1, 4, 999} {
		w := doRequest(t, router, http.MethodPost, "/api/restaurants", adminToken, Restaurant{
			Name: "Bad Price Tier", Stars: 1, City: "Austin", PriceTier: tier,
		})
		if w.Code != http.StatusBadRequest {
			t.Errorf("price tier=%d: expected 400, got %d: %s", tier, w.Code, w.Body.String())
		}
	}

	// 0 (unset/unknown) is explicitly allowed, same as ReservationReleaseDay.
	w := doRequest(t, router, http.MethodPost, "/api/restaurants", adminToken, Restaurant{
		Name: "No Price Yet", Stars: 1, City: "Austin", PriceTier: 0,
	})
	if w.Code != http.StatusCreated {
		t.Errorf("expected 201 with price_tier=0, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateRestaurant_SupportsReservationPlatformLink(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	w := doRequest(t, router, http.MethodPost, "/api/restaurants", adminToken, Restaurant{
		Name: "New Spot", Stars: 2, City: "Austin",
		ReservationPlatform: "opentable", ReservationURL: "https://www.opentable.com/r/new-spot",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp Restaurant
	decodeJSON(t, w, &resp)
	if resp.ReservationPlatform != "opentable" || resp.ReservationURL != "https://www.opentable.com/r/new-spot" {
		t.Fatalf("expected reservation platform link populated, got %+v", resp)
	}
}

func TestCreateRestaurant_RejectsUnknownReservationPlatform(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	w := doRequest(t, router, http.MethodPost, "/api/restaurants", adminToken, Restaurant{
		Name: "Bad Platform", Stars: 1, City: "Austin", ReservationPlatform: "carrier-pigeon",
	})
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for an unknown reservation platform, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateRestaurant_SupportsPhotoAndPrice(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	w := doRequest(t, router, http.MethodPost, "/api/restaurants", adminToken, Restaurant{
		Name:        "New Spot",
		Stars:       2,
		City:        "Austin",
		Cuisine:     "Tex-Mex",
		YearAwarded: 2026,
		PhotoURL:    "https://cdn.example.com/spot.jpg",
		PriceTier:   2,
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 for metadata-rich restaurant, got %d: %s", w.Code, w.Body.String())
	}
	var resp Restaurant
	decodeJSON(t, w, &resp)
	if resp.PhotoURL == "" || resp.PriceTier != 2 {
		t.Fatalf("expected metadata fields populated, got %+v", resp)
	}
}

func TestUpdateRestaurantHours_ReplacesWeek(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	restaurant := seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago"})

	w := doRequest(t, router, http.MethodPut, fmt.Sprintf("/api/restaurants/%d/hours", restaurant.ID), adminToken, updateRestaurantHoursRequest{
		Hours: []restaurantHoursEntryInput{
			{DayOfWeek: 1, OpenTime: "11:00", CloseTime: "22:00"},
			{DayOfWeek: 0, IsClosed: true},
		},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	get := doRequest(t, router, http.MethodGet, fmt.Sprintf("/api/restaurants/%d", restaurant.ID), "", nil)
	var resp Restaurant
	decodeJSON(t, get, &resp)
	if len(resp.Hours) != 2 {
		t.Fatalf("expected 2 hours entries, got %+v", resp.Hours)
	}
	if resp.Hours[0].DayOfWeek != 0 || !resp.Hours[0].IsClosed {
		t.Errorf("expected Sunday first and closed, got %+v", resp.Hours[0])
	}
	if resp.Hours[1].DayOfWeek != 1 || resp.Hours[1].OpenTime != "11:00" || resp.Hours[1].CloseTime != "22:00" {
		t.Errorf("expected Monday 11:00-22:00, got %+v", resp.Hours[1])
	}

	// Replacing again should drop the previous set entirely, not merge.
	w2 := doRequest(t, router, http.MethodPut, fmt.Sprintf("/api/restaurants/%d/hours", restaurant.ID), adminToken, updateRestaurantHoursRequest{
		Hours: []restaurantHoursEntryInput{{DayOfWeek: 2, OpenTime: "09:00", CloseTime: "17:00"}},
	})
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w2.Code, w2.Body.String())
	}
	get2 := doRequest(t, router, http.MethodGet, fmt.Sprintf("/api/restaurants/%d", restaurant.ID), "", nil)
	var resp2 Restaurant
	decodeJSON(t, get2, &resp2)
	if len(resp2.Hours) != 1 || resp2.Hours[0].DayOfWeek != 2 {
		t.Fatalf("expected the old entries replaced, got %+v", resp2.Hours)
	}
}

func TestUpdateRestaurantHours_RejectsInvalidEntries(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	restaurant := seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago"})

	cases := []updateRestaurantHoursRequest{
		{Hours: []restaurantHoursEntryInput{{DayOfWeek: -1, OpenTime: "11:00", CloseTime: "22:00"}}},
		{Hours: []restaurantHoursEntryInput{{DayOfWeek: 7, OpenTime: "11:00", CloseTime: "22:00"}}},
		{Hours: []restaurantHoursEntryInput{{DayOfWeek: 1, OpenTime: "not-a-time", CloseTime: "22:00"}}},
		{Hours: []restaurantHoursEntryInput{
			{DayOfWeek: 1, OpenTime: "11:00", CloseTime: "22:00"},
			{DayOfWeek: 1, OpenTime: "09:00", CloseTime: "17:00"},
		}},
	}
	for i, body := range cases {
		w := doRequest(t, router, http.MethodPut, fmt.Sprintf("/api/restaurants/%d/hours", restaurant.ID), adminToken, body)
		if w.Code != http.StatusBadRequest {
			t.Errorf("case %d: expected 400, got %d: %s", i, w.Code, w.Body.String())
		}
	}
}

func TestRestaurant_IsOpenReflectsCurrentTime(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	openAllDay := seedRestaurant(t, Restaurant{Name: "Always Open", Stars: 1, City: "Austin"})
	closedToday := seedRestaurant(t, Restaurant{Name: "Always Closed", Stars: 1, City: "Austin"})

	today := int(time.Now().Weekday())
	doRequest(t, router, http.MethodPut, fmt.Sprintf("/api/restaurants/%d/hours", openAllDay.ID), adminToken, updateRestaurantHoursRequest{
		Hours: []restaurantHoursEntryInput{{DayOfWeek: today, OpenTime: "00:00", CloseTime: "23:59"}},
	})
	doRequest(t, router, http.MethodPut, fmt.Sprintf("/api/restaurants/%d/hours", closedToday.ID), adminToken, updateRestaurantHoursRequest{
		Hours: []restaurantHoursEntryInput{{DayOfWeek: today, IsClosed: true}},
	})

	w := doRequest(t, router, http.MethodGet, "/api/restaurants", "", nil)
	var listResp struct {
		Restaurants []Restaurant `json:"restaurants"`
	}
	decodeJSON(t, w, &listResp)

	var openResult, closedResult *bool
	for _, r := range listResp.Restaurants {
		if r.ID == openAllDay.ID {
			openResult = r.IsOpen
		}
		if r.ID == closedToday.ID {
			closedResult = r.IsOpen
		}
	}
	if openResult == nil || !*openResult {
		t.Errorf("expected is_open=true for the always-open restaurant, got %v", openResult)
	}
	if closedResult == nil || *closedResult {
		t.Errorf("expected is_open=false for the closed-today restaurant, got %v", closedResult)
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

func TestRestaurant_AverageRatingComputedFromReviews(t *testing.T) {
	router, _ := newTestApp(t)
	restaurant, device := seedCheckinFixture(t)

	// A restaurant with no reviews yet reports no average, not a fabricated 0.
	fresh := doRequest(t, router, http.MethodGet, fmt.Sprintf("/api/restaurants/%d", restaurant.ID), "", nil)
	var freshResp Restaurant
	decodeJSON(t, fresh, &freshResp)
	if freshResp.AverageRating != nil || freshResp.ReviewCount != 0 {
		t.Fatalf("expected nil average and 0 count with no reviews, got %+v / %d", freshResp.AverageRating, freshResp.ReviewCount)
	}

	ratings := []int{5, 3, 4}
	for i, rating := range ratings {
		token, _ := registerUser(t, router, fmt.Sprintf("reviewer%d@example.com", i), "hunter22", fmt.Sprintf("Reviewer %d", i))
		verify := doRequest(t, router, http.MethodPost, "/api/checkins/verify", token, verifyCheckinRequest{
			TagID: device.TagID, Signature: computeSignature(device.TagID, device.Salt),
			LocationLat: restaurant.LocationLat, LocationLong: restaurant.LocationLong,
		})
		if verify.Code != http.StatusOK {
			t.Fatalf("fixture checkin failed: %d %s", verify.Code, verify.Body.String())
		}
		var eligResp struct {
			ReviewableVisits []reviewableVisit `json:"reviewable_visits"`
		}
		decodeJSON(t, doRequest(t, router, http.MethodGet, restaurantPath(restaurant, "/review-eligibility"), token, nil), &eligResp)
		checkinID := eligResp.ReviewableVisits[0].CheckinID

		create := doRequest(t, router, http.MethodPost, restaurantPath(restaurant, "/reviews"), token, createReviewRequest{
			CheckinID: checkinID, Rating: rating, Comment: "Test review.",
		})
		if create.Code != http.StatusCreated {
			t.Fatalf("expected 201 creating review, got %d: %s", create.Code, create.Body.String())
		}
	}

	// Average of 5, 3, 4 is 4.0.
	get := doRequest(t, router, http.MethodGet, fmt.Sprintf("/api/restaurants/%d", restaurant.ID), "", nil)
	var getResp Restaurant
	decodeJSON(t, get, &getResp)
	if getResp.AverageRating == nil || *getResp.AverageRating != 4.0 {
		t.Errorf("expected average_rating 4.0, got %+v", getResp.AverageRating)
	}
	if getResp.ReviewCount != 3 {
		t.Errorf("expected review_count 3, got %d", getResp.ReviewCount)
	}

	list := doRequest(t, router, http.MethodGet, "/api/restaurants", "", nil)
	var listResp struct {
		Restaurants []Restaurant `json:"restaurants"`
	}
	decodeJSON(t, list, &listResp)
	if len(listResp.Restaurants) != 1 || listResp.Restaurants[0].AverageRating == nil || *listResp.Restaurants[0].AverageRating != 4.0 {
		t.Errorf("expected list endpoint to also report average_rating 4.0, got %+v", listResp.Restaurants)
	}
}

func TestRestaurant_StarHistorySeededOnCreateAndSyncedOnUpdate(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	create := doRequest(t, router, http.MethodPost, "/api/restaurants", adminToken, Restaurant{
		Name: "Aurum Table", Stars: 2, City: "Chicago", YearAwarded: 2025,
	})
	if create.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", create.Code, create.Body.String())
	}
	var created Restaurant
	decodeJSON(t, create, &created)

	// Creating auto-seeds one history row from the current year/tier.
	get := doRequest(t, router, http.MethodGet, fmt.Sprintf("/api/restaurants/%d", created.ID), "", nil)
	var fetched Restaurant
	decodeJSON(t, get, &fetched)
	if len(fetched.StarHistory) != 1 || fetched.StarHistory[0].Year != 2025 || fetched.StarHistory[0].Stars != 2 {
		t.Fatalf("expected star history seeded with {2025: 2}, got %+v", fetched.StarHistory)
	}

	// Editing the restaurant's current-year tier updates that year's row in
	// place instead of leaving a stale duplicate.
	update := doRequest(t, router, http.MethodPut, fmt.Sprintf("/api/restaurants/%d", created.ID), adminToken, Restaurant{
		Name: "Aurum Table", Stars: 3, City: "Chicago", YearAwarded: 2025,
	})
	if update.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", update.Code, update.Body.String())
	}

	get2 := doRequest(t, router, http.MethodGet, fmt.Sprintf("/api/restaurants/%d", created.ID), "", nil)
	var fetched2 Restaurant
	decodeJSON(t, get2, &fetched2)
	if len(fetched2.StarHistory) != 1 || fetched2.StarHistory[0].Stars != 3 {
		t.Fatalf("expected 2025's history row updated to 3 stars in place, got %+v", fetched2.StarHistory)
	}
}

func TestUpdateRestaurantStarHistory_ReplacesFullSetAndOrdersDescending(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	restaurant := seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago", YearAwarded: 2026})

	w := doRequest(t, router, http.MethodPut, fmt.Sprintf("/api/restaurants/%d/star-history", restaurant.ID), adminToken, updateStarHistoryRequest{
		History: []starHistoryEntryInput{
			{Year: 2024, Stars: 2},
			{Year: 2025, Stars: 2},
			{Year: 2026, Stars: 3},
		},
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	get := doRequest(t, router, http.MethodGet, fmt.Sprintf("/api/restaurants/%d", restaurant.ID), "", nil)
	var fetched Restaurant
	decodeJSON(t, get, &fetched)
	if len(fetched.StarHistory) != 3 {
		t.Fatalf("expected 3 history entries, got %+v", fetched.StarHistory)
	}
	years := []int{fetched.StarHistory[0].Year, fetched.StarHistory[1].Year, fetched.StarHistory[2].Year}
	if years[0] != 2026 || years[1] != 2025 || years[2] != 2024 {
		t.Errorf("expected history ordered newest-first, got years %+v", years)
	}

	// A second call fully replaces the set rather than appending to it.
	replace := doRequest(t, router, http.MethodPut, fmt.Sprintf("/api/restaurants/%d/star-history", restaurant.ID), adminToken, updateStarHistoryRequest{
		History: []starHistoryEntryInput{{Year: 2026, Stars: 3}},
	})
	if replace.Code != http.StatusOK {
		t.Fatalf("expected 200 replacing history, got %d: %s", replace.Code, replace.Body.String())
	}
	get2 := doRequest(t, router, http.MethodGet, fmt.Sprintf("/api/restaurants/%d", restaurant.ID), "", nil)
	var fetched2 Restaurant
	decodeJSON(t, get2, &fetched2)
	if len(fetched2.StarHistory) != 1 {
		t.Errorf("expected replace to drop the old entries, got %+v", fetched2.StarHistory)
	}
}

func TestUpdateRestaurantStarHistory_RejectsOutOfRangeStarsAndRequiresAdmin(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	userToken, _ := registerUser(t, router, "user@example.com", "hunter22", "Regular User")
	restaurant := seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago"})

	forbidden := doRequest(t, router, http.MethodPut, fmt.Sprintf("/api/restaurants/%d/star-history", restaurant.ID), userToken, updateStarHistoryRequest{
		History: []starHistoryEntryInput{{Year: 2025, Stars: 3}},
	})
	if forbidden.Code != http.StatusForbidden {
		t.Errorf("expected 403 for non-admin, got %d: %s", forbidden.Code, forbidden.Body.String())
	}

	badStars := doRequest(t, router, http.MethodPut, fmt.Sprintf("/api/restaurants/%d/star-history", restaurant.ID), adminToken, updateStarHistoryRequest{
		History: []starHistoryEntryInput{{Year: 2025, Stars: 7}},
	})
	if badStars.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for out-of-range stars, got %d: %s", badStars.Code, badStars.Body.String())
	}
}

// A duplicate-year submission must be rejected up front, before any delete
// happens — the handler applies its replace as delete-then-insert inside a
// transaction, but validating first avoids ever attempting (and having to
// roll back) a doomed insert, and existing history must survive intact.
func TestUpdateRestaurantStarHistory_RejectsDuplicateYearWithoutLosingExistingHistory(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	restaurant := seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 3, City: "Chicago"})

	seed := doRequest(t, router, http.MethodPut, fmt.Sprintf("/api/restaurants/%d/star-history", restaurant.ID), adminToken, updateStarHistoryRequest{
		History: []starHistoryEntryInput{{Year: 2025, Stars: 2}},
	})
	if seed.Code != http.StatusOK {
		t.Fatalf("expected 200 seeding history, got %d: %s", seed.Code, seed.Body.String())
	}

	dupe := doRequest(t, router, http.MethodPut, fmt.Sprintf("/api/restaurants/%d/star-history", restaurant.ID), adminToken, updateStarHistoryRequest{
		History: []starHistoryEntryInput{{Year: 2026, Stars: 3}, {Year: 2026, Stars: 3}},
	})
	if dupe.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for duplicate year, got %d: %s", dupe.Code, dupe.Body.String())
	}

	var history []RestaurantStarHistory
	db.Where("restaurant_id = ?", restaurant.ID).Find(&history)
	if len(history) != 1 || history[0].Year != 2025 {
		t.Errorf("expected the original 2025 history to survive the rejected update, got %+v", history)
	}
}

// A JSON-marshaled Go struct always includes "id" (Restaurant.ID has no
// omitempty), so any PUT body built the normal way carries id:0. Without
// pinning restaurant.ID back to the URL's :id after BindJSON, that zero
// value would redirect Save() into creating a brand-new row instead of
// updating the restaurant the URL actually names.
func TestUpdateRestaurant_IgnoresBodySuppliedID(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	restaurant := seedRestaurant(t, Restaurant{Name: "Aurum Table", Stars: 2, City: "Chicago"})

	countBefore := int64(0)
	db.Model(&Restaurant{}).Count(&countBefore)

	w := doRequest(t, router, http.MethodPut, fmt.Sprintf("/api/restaurants/%d", restaurant.ID), adminToken, Restaurant{
		Name: "Aurum Table", Stars: 3, City: "Chicago",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	countAfter := int64(0)
	db.Model(&Restaurant{}).Count(&countAfter)
	if countAfter != countBefore {
		t.Fatalf("expected update to modify the existing row, not create a new one — count went from %d to %d", countBefore, countAfter)
	}

	var reloaded Restaurant
	db.First(&reloaded, restaurant.ID)
	if reloaded.Stars != 3 {
		t.Errorf("expected restaurant %d updated to 3 stars in place, got %d", restaurant.ID, reloaded.Stars)
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
