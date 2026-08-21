package main

import (
	"encoding/csv"
	"fmt"
	"io"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// hourTimePattern matches a 24-hour "HH:MM" string, e.g. "09:00" or "22:30".
var hourTimePattern = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)

// nextReleaseDate finds the next occurrence of dayOfMonth on/after `from`,
// clamped to the last real day of any month shorter than dayOfMonth (e.g.
// day 31 in February lands on the 28th/29th). Returns nil when there's no
// known recurring release schedule.
func nextReleaseDate(dayOfMonth int, from time.Time) *time.Time {
	if dayOfMonth <= 0 {
		return nil
	}

	clamp := func(year int, month time.Month) time.Time {
		lastOfMonth := time.Date(year, month+1, 0, 0, 0, 0, 0, from.Location()).Day()
		day := dayOfMonth
		if day > lastOfMonth {
			day = lastOfMonth
		}
		return time.Date(year, month, day, 0, 0, 0, 0, from.Location())
	}

	today := time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, from.Location())
	candidate := clamp(from.Year(), from.Month())
	if candidate.Before(today) {
		candidate = clamp(from.Year(), from.Month()+1)
	}
	return &candidate
}

// hydrateNextRelease sets NextReservationRelease on each restaurant from its
// ReservationReleaseDay — always computed at read time (see nextReleaseDate)
// rather than persisted, so it can never go stale.
func hydrateNextRelease(restaurants []Restaurant) {
	now := time.Now()
	for i := range restaurants {
		restaurants[i].NextReservationRelease = nextReleaseDate(restaurants[i].ReservationReleaseDay, now)
	}
}

type restaurantRatingRow struct {
	RestaurantID uint
	AvgRating    float64
	Count        int
}

// currentRestaurantStars returns the stars from a restaurant's newest
// RestaurantStarHistory entry, or 0 if it has none (shouldn't normally
// happen — every restaurant gets a history row the moment its first Stars
// value is set, via createRestaurantHandler/updateRestaurantHandler/
// importRestaurantsHandler).
func currentRestaurantStars(restaurantID uint) int {
	var latest RestaurantStarHistory
	if err := db.Where("restaurant_id = ?", restaurantID).Order("year desc, id desc").First(&latest).Error; err == nil {
		return latest.Stars
	}
	return 0
}

// currentRestaurantAward returns (year, stars) from a restaurant's newest
// RestaurantStarHistory entry, or (0, 0) if it has none.
func currentRestaurantAward(restaurantID uint) (year int, stars int) {
	var latest RestaurantStarHistory
	if err := db.Where("restaurant_id = ?", restaurantID).Order("year desc, id desc").First(&latest).Error; err == nil {
		return latest.Year, latest.Stars
	}
	return 0, 0
}

// hydrateCurrentStarSnapshots projects each restaurant's newest history row
// onto its Stars/YearAwarded fields for the API response — those fields are
// gorm:"-" (never stored), so every read path needs this to populate them.
func hydrateCurrentStarSnapshots(restaurants []Restaurant) {
	if len(restaurants) == 0 {
		return
	}
	ids := make([]uint, len(restaurants))
	for i, restaurant := range restaurants {
		ids[i] = restaurant.ID
	}
	var history []RestaurantStarHistory
	db.Where("restaurant_id IN ?", ids).Order("year desc, id desc").Find(&history)
	latest := make(map[uint]RestaurantStarHistory, len(ids))
	for _, entry := range history {
		if _, exists := latest[entry.RestaurantID]; !exists {
			latest[entry.RestaurantID] = entry
		}
	}
	for i := range restaurants {
		if entry, ok := latest[restaurants[i].ID]; ok {
			restaurants[i].Stars = entry.Stars
			restaurants[i].YearAwarded = entry.Year
		}
	}
}

// migrateRestaurantStarHistory is a one-time backfill for databases created
// before Stars/YearAwarded moved off the restaurants table: it reads
// whatever was left in those now-unmanaged columns and turns each into a
// RestaurantStarHistory row, for any restaurant that doesn't already have
// history. Safe to run on every startup — a fresh schema (tests, or a
// database that's already been migrated) never had the legacy columns, so
// HasColumn short-circuits it to a no-op.
func migrateRestaurantStarHistory() error {
	if !db.Migrator().HasColumn(&Restaurant{}, "stars") {
		return nil
	}

	type legacyRestaurantStars struct {
		ID          uint
		Stars       int
		YearAwarded int
	}
	var legacy []legacyRestaurantStars
	if err := db.Raw("SELECT id, stars, year_awarded FROM restaurants").Scan(&legacy).Error; err != nil {
		return err
	}

	for _, r := range legacy {
		if r.Stars <= 0 {
			continue
		}
		var count int64
		if err := db.Model(&RestaurantStarHistory{}).Where("restaurant_id = ?", r.ID).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		year := r.YearAwarded
		if year <= 0 {
			year = time.Now().Year()
		}
		if err := db.Create(&RestaurantStarHistory{RestaurantID: r.ID, Year: year, Stars: r.Stars}).Error; err != nil {
			return err
		}
	}
	return nil
}

// hydrateRatings computes each restaurant's average review rating and review
// count fresh from the Reviews table — mirrors hydrateNextRelease's
// "never store a derived value" approach so ratings can't go stale as
// reviews are added, edited, or deleted. Restaurants with no reviews are
// left with a nil AverageRating rather than a misleading 0.
func hydrateRatings(restaurants []Restaurant) {
	if len(restaurants) == 0 {
		return
	}
	ids := make([]uint, len(restaurants))
	for i, r := range restaurants {
		ids[i] = r.ID
	}

	var rows []restaurantRatingRow
	db.Model(&Review{}).
		Select("restaurant_id, AVG(rating) as avg_rating, COUNT(*) as count").
		Where("restaurant_id IN ?", ids).
		Group("restaurant_id").
		Scan(&rows)

	byID := make(map[uint]restaurantRatingRow, len(rows))
	for _, row := range rows {
		byID[row.RestaurantID] = row
	}

	for i := range restaurants {
		if row, ok := byID[restaurants[i].ID]; ok {
			rounded := math.Round(row.AvgRating*10) / 10
			restaurants[i].AverageRating = &rounded
			restaurants[i].ReviewCount = row.Count
		}
	}
}

// hourMinutes converts an "HH:MM" string to minutes since midnight. Callers
// must only pass strings that already matched hourTimePattern.
func hourMinutes(t string) int {
	h, _ := strconv.Atoi(t[0:2])
	m, _ := strconv.Atoi(t[3:5])
	return h*60 + m
}

// hydrateIsOpen computes each restaurant's IsOpen fresh from its Hours for
// today's day-of-week — mirrors hydrateRatings/hydrateNextRelease's "never
// store a derived value" approach. Only today's row is queried (not the
// full week) so this stays cheap on the list endpoint.
func hydrateIsOpen(restaurants []Restaurant) {
	if len(restaurants) == 0 {
		return
	}
	ids := make([]uint, len(restaurants))
	for i, r := range restaurants {
		ids[i] = r.ID
	}

	today := int(time.Now().Weekday())
	var todayHours []RestaurantHours
	db.Where("restaurant_id IN ? AND day_of_week = ?", ids, today).Find(&todayHours)

	byRestaurant := make(map[uint]RestaurantHours, len(todayHours))
	for _, h := range todayHours {
		byRestaurant[h.RestaurantID] = h
	}

	now := hourMinutes(time.Now().Format("15:04"))
	for i := range restaurants {
		entry, ok := byRestaurant[restaurants[i].ID]
		open := false
		if ok && !entry.IsClosed && hourTimePattern.MatchString(entry.OpenTime) && hourTimePattern.MatchString(entry.CloseTime) {
			start := hourMinutes(entry.OpenTime)
			end := hourMinutes(entry.CloseTime)
			if end < start {
				open = now >= start || now <= end
			} else {
				open = now >= start && now <= end
			}
		}
		restaurants[i].IsOpen = &open
	}
}

// caseInsensitiveContains builds a `LOWER(column) LIKE LOWER(?)`-style clause
// instead of Postgres-only ILIKE, so the same query works unchanged against
// SQLite in tests.
func caseInsensitiveContains(column, value string) (string, string) {
	return "LOWER(" + column + ") LIKE ?", "%" + strings.ToLower(value) + "%"
}

// currentStarHistoryJoin is the portable (SQLite + Postgres) SQL fragment
// that left-joins each restaurant to its newest RestaurantStarHistory row,
// aliased as current_star(restaurant_id, stars, year). Stars/YearAwarded
// aren't real restaurant columns anymore, so filtering/sorting by them has
// to go through this instead of a plain WHERE/ORDER BY on the table.
const currentStarHistoryJoin = `LEFT JOIN (
	SELECT h1.restaurant_id, h1.stars, h1.year
	FROM restaurant_star_histories h1
	WHERE h1.year = (
		SELECT MAX(h2.year) FROM restaurant_star_histories h2 WHERE h2.restaurant_id = h1.restaurant_id
	)
) AS current_star ON current_star.restaurant_id = restaurants.id`

// restaurantSortColumns whitelists which columns the admin portal's
// Restaurant Engine table may sort by — never interpolate c.Query("sort")
// directly into SQL. Public callers (mobile/web) never pass "sort", so they
// keep the default stars/year ordering below unaffected.
var restaurantSortColumns = map[string]string{
	"name":         "restaurants.name",
	"stars":        "current_star.stars",
	"price_tier":   "restaurants.price_tier",
	"city":         "restaurants.city",
	"cuisine":      "restaurants.cuisine",
	"year_awarded": "current_star.year",
}

func listRestaurantsHandler(c *gin.Context) {
	var restaurants []Restaurant
	var query *gorm.DB
	if column, ok := restaurantSortColumns[c.Query("sort")]; ok {
		direction := "desc"
		if c.Query("order") == "asc" {
			direction = "asc"
		}
		query = db.Joins(currentStarHistoryJoin).Order(column + " " + direction)
	} else {
		query = db.Joins(currentStarHistoryJoin).Order("current_star.stars desc, current_star.year desc")
	}

	if year := c.Query("year"); year != "" {
		if num, err := strconv.Atoi(year); err == nil {
			query = query.Where("current_star.year = ?", num)
		}
	}
	if tier := c.Query("stars"); tier != "" {
		if num, err := strconv.Atoi(tier); err == nil {
			query = query.Where("current_star.stars = ?", num)
		}
	}
	if cuisine := c.Query("cuisine"); cuisine != "" {
		clause, arg := caseInsensitiveContains("cuisine", cuisine)
		query = query.Where(clause, arg)
	}
	if city := c.Query("city"); city != "" {
		clause, arg := caseInsensitiveContains("city", city)
		query = query.Where(clause, arg)
	}
	if country := c.Query("country"); country != "" {
		clause, arg := caseInsensitiveContains("country", country)
		query = query.Where(clause, arg)
	}
	if q := c.Query("q"); q != "" {
		clause, arg := caseInsensitiveContains("name", q)
		query = query.Where(clause, arg)
	}

	limitStr := c.Query("limit")
	if limitStr == "" {
		query.Find(&restaurants)
		hydrateCurrentStarSnapshots(restaurants)
		hydrateNextRelease(restaurants)
		hydrateRatings(restaurants)
		hydrateIsOpen(restaurants)
		RespondSuccess(c, http.StatusOK, map[string]interface{}{"restaurants": restaurants})
		return
	}

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 20
	}
	page, err := strconv.Atoi(c.Query("page"))
	if err != nil || page <= 0 {
		page = 1
	}

	var total int64
	query.Model(&Restaurant{}).Count(&total)
	query.Offset((page - 1) * limit).Limit(limit).Find(&restaurants)
	hydrateCurrentStarSnapshots(restaurants)
	hydrateNextRelease(restaurants)
	hydrateRatings(restaurants)
	hydrateIsOpen(restaurants)

	meta := &Metadata{Pagination: &PaginationMeta{Page: page, Limit: limit, Total: int(total)}}
	RespondSuccessWithMeta(c, http.StatusOK, map[string]interface{}{"restaurants": restaurants}, meta)
}

func getRestaurantHandler(c *gin.Context) {
	var restaurant Restaurant
	if err := db.Preload("StarHistory", func(db *gorm.DB) *gorm.DB {
		return db.Order("year desc")
	}).Preload("Hours", func(db *gorm.DB) *gorm.DB {
		return db.Order("day_of_week")
	}).First(&restaurant, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "Restaurant not found")
		return
	}
	restaurant.NextReservationRelease = nextReleaseDate(restaurant.ReservationReleaseDay, time.Now())
	single := []Restaurant{restaurant}
	hydrateCurrentStarSnapshots(single)
	hydrateRatings(single)
	hydrateIsOpen(single)
	RespondSuccess(c, http.StatusOK, single[0])
}

// validStars rejects anything outside the Michelin 1-3 star scale. The
// frontend's <input min/max> is a UX nicety, not a security boundary —
// this is the actual enforcement, since any HTTP client can bypass the
// browser entirely.
func validStars(stars int) bool {
	return stars >= 1 && stars <= 3
}

// validReleaseDay allows 0 (no known recurring release schedule) or a real
// day-of-month.
func validReleaseDay(day int) bool {
	return day >= 0 && day <= 31
}

// validPriceTier allows 0 (unset/unknown) or a real 1-3 tier — same shape as
// validReleaseDay, since not every seeded restaurant has pricing data yet.
func validPriceTier(tier int) bool {
	return tier >= 0 && tier <= 3
}

// validReservationPlatform allows an empty string (no known booking link) or
// one of the platforms the mobile app knows how to show an icon for.
func validReservationPlatform(platform string) bool {
	switch platform {
	case "", "opentable", "resy", "website":
		return true
	default:
		return false
	}
}

// validDayOfWeek allows 0 (Sunday) through 6 (Saturday), matching JS's
// Date.getDay() convention used by RestaurantHours.DayOfWeek.
func validDayOfWeek(day int) bool {
	return day >= 0 && day <= 6
}

// validHourTime requires a 24-hour "HH:MM" string, e.g. "09:00" or "22:30".
func validHourTime(t string) bool {
	return hourTimePattern.MatchString(t)
}

type starHistoryEntryInput struct {
	Year  int `json:"year" binding:"required"`
	Stars int `json:"stars" binding:"required"`
}

type updateStarHistoryRequest struct {
	History []starHistoryEntryInput `json:"history"`
}

type restaurantHoursEntryInput struct {
	DayOfWeek int    `json:"day_of_week"`
	IsClosed  bool   `json:"is_closed"`
	OpenTime  string `json:"open_time"`
	CloseTime string `json:"close_time"`
}

type updateRestaurantHoursRequest struct {
	Hours []restaurantHoursEntryInput `json:"hours"`
}

func createRestaurantHandler(c *gin.Context) {
	var payload Restaurant
	if err := c.BindJSON(&payload); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}
	if !validStars(payload.Stars) {
		RespondValidationError(c, "Stars must be between 1 and 3", nil)
		return
	}
	if !validReleaseDay(payload.ReservationReleaseDay) {
		RespondValidationError(c, "Reservation release day must be between 0 and 31", nil)
		return
	}
	if !validPriceTier(payload.PriceTier) {
		RespondValidationError(c, "Price tier must be between 0 and 3", nil)
		return
	}
	if !validReservationPlatform(payload.ReservationPlatform) {
		RespondValidationError(c, "Unknown reservation platform", nil)
		return
	}
	// YearAwarded has no validation of its own (0 used to mean "unknown"),
	// but now that RestaurantStarHistory is the only place Stars lives,
	// every restaurant needs a real year to attach its first entry to —
	// default to the current guide year rather than silently dropping the
	// Stars the admin just set.
	if payload.YearAwarded <= 0 {
		payload.YearAwarded = time.Now().Year()
	}
	if err := db.Create(&payload).Error; err != nil {
		RespondInternalError(c, "Failed to create restaurant")
		return
	}
	// Seed one star-history row from the current tier/year so a freshly
	// created restaurant already has a starting point — admins can still add
	// earlier years afterward via the star-history endpoint.
	if err := db.Create(&RestaurantStarHistory{RestaurantID: payload.ID, Year: payload.YearAwarded, Stars: payload.Stars}).Error; err != nil {
		RespondInternalError(c, "Failed to create restaurant star history")
		return
	}
	payload.NextReservationRelease = nextReleaseDate(payload.ReservationReleaseDay, time.Now())
	RespondSuccess(c, http.StatusCreated, payload)
}

// importRowResult reports what happened to one CSV row — used for all three
// buckets (created/skipped/failed) so the admin portal can render one table.
type importRowResult struct {
	Row    int    `json:"row"`
	Name   string `json:"name"`
	ID     uint   `json:"id,omitempty"`
	Reason string `json:"reason,omitempty"`
}

var requiredRestaurantImportColumns = []string{"name", "city", "cuisine", "stars"}

// importRestaurantsHandler bulk-creates restaurants from an uploaded CSV —
// built for the annual Michelin Guide release, where dozens of restaurants
// land at once and filling out the single-restaurant form that many times
// isn't realistic. Each row is validated and inserted independently (one bad
// row shouldn't block the other 49), and duplicates (same name+city as an
// existing restaurant, matching the single-create form's own duplicate
// check) are skipped rather than erroring.
func importRestaurantsHandler(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		RespondValidationError(c, "CSV file is required", nil)
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		RespondInternalError(c, "Failed to read uploaded CSV")
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1 // tolerate short/ragged rows rather than erroring the whole file
	header, err := reader.Read()
	if err != nil {
		RespondValidationError(c, "Could not read CSV header row", map[string]string{"error": err.Error()})
		return
	}
	colIndex := map[string]int{}
	for i, h := range header {
		colIndex[strings.ToLower(strings.TrimSpace(h))] = i
	}
	for _, col := range requiredRestaurantImportColumns {
		if _, ok := colIndex[col]; !ok {
			RespondValidationError(c, fmt.Sprintf("CSV is missing required column %q", col), nil)
			return
		}
	}
	get := func(row []string, col string) string {
		idx, ok := colIndex[col]
		if !ok || idx >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[idx])
	}

	dedupeKey := func(name, city string) string {
		return strings.ToLower(name) + "|" + strings.ToLower(city)
	}
	var existing []Restaurant
	db.Find(&existing)
	seen := make(map[string]bool, len(existing))
	for _, r := range existing {
		seen[dedupeKey(r.Name, r.City)] = true
	}

	var created, skipped, failed []importRowResult
	rowNum := 1 // header is row 1, so the first data row is 2 — matches what a spreadsheet shows
	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		rowNum++
		if err != nil {
			failed = append(failed, importRowResult{Row: rowNum, Reason: "could not parse row: " + err.Error()})
			continue
		}

		name := get(row, "name")
		city := get(row, "city")
		cuisine := get(row, "cuisine")
		starsStr := get(row, "stars")
		if name == "" || city == "" || cuisine == "" || starsStr == "" {
			failed = append(failed, importRowResult{Row: rowNum, Name: name, Reason: "name, city, cuisine, and stars are required"})
			continue
		}
		stars, err := strconv.Atoi(starsStr)
		if err != nil || !validStars(stars) {
			failed = append(failed, importRowResult{Row: rowNum, Name: name, Reason: "stars must be a number between 1 and 3"})
			continue
		}

		key := dedupeKey(name, city)
		if seen[key] {
			skipped = append(skipped, importRowResult{Row: rowNum, Name: name, Reason: fmt.Sprintf("a restaurant named %q already exists in %q", name, city)})
			continue
		}

		priceTier := 0
		if v := get(row, "price_tier"); v != "" {
			priceTier, err = strconv.Atoi(v)
			if err != nil || !validPriceTier(priceTier) {
				failed = append(failed, importRowResult{Row: rowNum, Name: name, Reason: "price tier must be a number between 0 and 3"})
				continue
			}
		}
		releaseDay := 0
		if v := get(row, "reservation_release_day"); v != "" {
			releaseDay, err = strconv.Atoi(v)
			if err != nil || !validReleaseDay(releaseDay) {
				failed = append(failed, importRowResult{Row: rowNum, Name: name, Reason: "reservation release day must be a number between 0 and 31"})
				continue
			}
		}
		platform := get(row, "reservation_platform")
		if !validReservationPlatform(platform) {
			failed = append(failed, importRowResult{Row: rowNum, Name: name, Reason: "reservation platform must be blank, opentable, resy, or website"})
			continue
		}
		yearAwarded, _ := strconv.Atoi(get(row, "year_awarded"))
		if yearAwarded <= 0 {
			// year_awarded is an optional CSV column, but every restaurant
			// needs a real year to attach its first star-history entry to —
			// default to the current guide year rather than silently
			// dropping the stars this row just set.
			yearAwarded = time.Now().Year()
		}
		country := get(row, "country")
		if country == "" {
			country = "USA"
		}

		restaurant := Restaurant{
			Name:                  name,
			City:                  city,
			Cuisine:               cuisine,
			Stars:                 stars,
			Country:               country,
			Address:               get(row, "address"),
			YearAwarded:           yearAwarded,
			PriceTier:             priceTier,
			ReservationReleaseDay: releaseDay,
			ReservationPlatform:   platform,
			ReservationURL:        get(row, "reservation_url"),
			PhotoURL:              get(row, "photo_url"),
		}
		if err := db.Create(&restaurant).Error; err != nil {
			failed = append(failed, importRowResult{Row: rowNum, Name: name, Reason: "database error: " + err.Error()})
			continue
		}
		if err := db.Create(&RestaurantStarHistory{RestaurantID: restaurant.ID, Year: restaurant.YearAwarded, Stars: restaurant.Stars}).Error; err != nil {
			failed = append(failed, importRowResult{Row: rowNum, Name: name, Reason: "failed to create star history: " + err.Error()})
			continue
		}
		seen[key] = true
		created = append(created, importRowResult{Row: rowNum, Name: name, ID: restaurant.ID})
	}

	logAuditEvent(c, "BULK_IMPORT_RESTAURANTS", "restaurant", nil, fmt.Sprintf("created=%d skipped=%d failed=%d", len(created), len(skipped), len(failed)))

	RespondSuccess(c, http.StatusOK, map[string]interface{}{
		"created": created,
		"skipped": skipped,
		"failed":  failed,
	})
}

func updateRestaurantHandler(c *gin.Context) {
	var restaurant Restaurant
	id := c.Param("id")
	if err := db.First(&restaurant, id).Error; err != nil {
		RespondNotFound(c, "Restaurant not found")
		return
	}
	originalID := restaurant.ID
	if err := c.BindJSON(&restaurant); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}
	// Never trust an `id` in the request body — without this, a client that
	// omits it (Go/JS both send the zero value since the field has no
	// omitempty) would silently redirect Save() into creating a duplicate
	// row instead of updating the restaurant named by the URL's :id.
	restaurant.ID = originalID
	if !validStars(restaurant.Stars) {
		RespondValidationError(c, "Stars must be between 1 and 3", nil)
		return
	}
	if !validReleaseDay(restaurant.ReservationReleaseDay) {
		RespondValidationError(c, "Reservation release day must be between 0 and 31", nil)
		return
	}
	if !validPriceTier(restaurant.PriceTier) {
		RespondValidationError(c, "Price tier must be between 0 and 3", nil)
		return
	}
	if !validReservationPlatform(restaurant.ReservationPlatform) {
		RespondValidationError(c, "Unknown reservation platform", nil)
		return
	}
	// See createRestaurantHandler — every restaurant needs a real year to
	// attach its star-history entry to, so a blank YearAwarded defaults to
	// the current guide year rather than silently dropping the new Stars.
	if restaurant.YearAwarded <= 0 {
		restaurant.YearAwarded = time.Now().Year()
	}
	db.Save(&restaurant)
	// Keep the current year's star-history entry in sync with the fields
	// that just got saved — editing this year's tier shouldn't leave a
	// stale duplicate sitting in the history table.
	var existing RestaurantStarHistory
	err := db.Where("restaurant_id = ? AND year = ?", restaurant.ID, restaurant.YearAwarded).First(&existing).Error
	if err != nil {
		db.Create(&RestaurantStarHistory{RestaurantID: restaurant.ID, Year: restaurant.YearAwarded, Stars: restaurant.Stars})
	} else if existing.Stars != restaurant.Stars {
		db.Model(&existing).Update("stars", restaurant.Stars)
	}
	restaurant.NextReservationRelease = nextReleaseDate(restaurant.ReservationReleaseDay, time.Now())
	RespondSuccess(c, http.StatusOK, restaurant)
}

// updateRestaurantStarHistoryHandler replaces a restaurant's entire star
// history in one call — simplest correct way to support admins adding,
// editing, and removing years without diffing old vs new entries.
func updateRestaurantStarHistoryHandler(c *gin.Context) {
	var restaurant Restaurant
	if err := db.First(&restaurant, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "Restaurant not found")
		return
	}

	var req updateStarHistoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}
	seenYears := make(map[int]bool, len(req.History))
	for _, entry := range req.History {
		if !validStars(entry.Stars) {
			RespondValidationError(c, fmt.Sprintf("Stars for year %d must be between 1 and 3", entry.Year), nil)
			return
		}
		if seenYears[entry.Year] {
			RespondValidationError(c, fmt.Sprintf("Duplicate entry for year %d", entry.Year), nil)
			return
		}
		seenYears[entry.Year] = true
	}

	rows := make([]RestaurantStarHistory, 0, len(req.History))
	for _, entry := range req.History {
		rows = append(rows, RestaurantStarHistory{RestaurantID: restaurant.ID, Year: entry.Year, Stars: entry.Stars})
	}

	// Delete-then-insert in one transaction — without it, a failure on the
	// insert (e.g. an unexpected DB-level constraint hit) would leave the
	// restaurant's history permanently wiped instead of rolled back.
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("restaurant_id = ?", restaurant.ID).Delete(&RestaurantStarHistory{}).Error; err != nil {
			return err
		}
		if len(rows) > 0 {
			if err := tx.Create(&rows).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		RespondInternalError(c, "Failed to save star history")
		return
	}

	var history []RestaurantStarHistory
	db.Where("restaurant_id = ?", restaurant.ID).Order("year desc").Find(&history)
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"star_history": history})
}

// updateRestaurantHoursHandler replaces a restaurant's entire weekly
// schedule in one call — same delete-then-insert approach as
// updateRestaurantStarHistoryHandler, for the same reason (simplest correct
// way to support admins adding, editing, and removing days without diffing
// old vs new entries).
func updateRestaurantHoursHandler(c *gin.Context) {
	var restaurant Restaurant
	if err := db.First(&restaurant, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "Restaurant not found")
		return
	}

	var req updateRestaurantHoursRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}
	seenDays := make(map[int]bool, len(req.Hours))
	for _, entry := range req.Hours {
		if !validDayOfWeek(entry.DayOfWeek) {
			RespondValidationError(c, fmt.Sprintf("day_of_week must be between 0 and 6, got %d", entry.DayOfWeek), nil)
			return
		}
		if seenDays[entry.DayOfWeek] {
			RespondValidationError(c, fmt.Sprintf("Duplicate entry for day_of_week %d", entry.DayOfWeek), nil)
			return
		}
		seenDays[entry.DayOfWeek] = true
		if !entry.IsClosed && (!validHourTime(entry.OpenTime) || !validHourTime(entry.CloseTime)) {
			RespondValidationError(c, fmt.Sprintf("open_time/close_time for day_of_week %d must be HH:MM", entry.DayOfWeek), nil)
			return
		}
	}

	rows := make([]RestaurantHours, 0, len(req.Hours))
	for _, entry := range req.Hours {
		rows = append(rows, RestaurantHours{
			RestaurantID: restaurant.ID,
			DayOfWeek:    entry.DayOfWeek,
			IsClosed:     entry.IsClosed,
			OpenTime:     entry.OpenTime,
			CloseTime:    entry.CloseTime,
		})
	}

	// Delete-then-insert in one transaction — without it, a failure on the
	// insert would leave the restaurant's hours permanently wiped instead of
	// rolled back.
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("restaurant_id = ?", restaurant.ID).Delete(&RestaurantHours{}).Error; err != nil {
			return err
		}
		if len(rows) > 0 {
			if err := tx.Create(&rows).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		RespondInternalError(c, "Failed to save hours")
		return
	}

	var hours []RestaurantHours
	db.Where("restaurant_id = ?", restaurant.ID).Order("day_of_week").Find(&hours)
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"hours": hours})
}

func deleteRestaurantHandler(c *gin.Context) {
	id := c.Param("id")
	// RestaurantStarHistory and RestaurantHours both carry a real FK back to
	// restaurants — deleting the restaurant first (or not at all, on
	// failure) would violate it, so clear them in the same transaction.
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("restaurant_id = ?", id).Delete(&RestaurantStarHistory{}).Error; err != nil {
			return err
		}
		if err := tx.Where("restaurant_id = ?", id).Delete(&RestaurantHours{}).Error; err != nil {
			return err
		}
		return tx.Delete(&Restaurant{}, id).Error
	})
	if err != nil {
		RespondInternalError(c, "Failed to delete restaurant")
		return
	}
	logAuditEvent(c, "DELETE_RESTAURANT", "restaurant", targetIDFromParam(id), "")
	RespondSuccess(c, http.StatusOK, map[string]string{"deleted": id})
}

func listNFCDevicesHandler(c *gin.Context) {
	var devices []NFCDevice
	db.Order("created_at desc").Find(&devices)
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"devices": devices})
}

func createNFCDeviceHandler(c *gin.Context) {
	var payload NFCDevice
	if err := c.BindJSON(&payload); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}
	if err := db.Create(&payload).Error; err != nil {
		RespondInternalError(c, "Failed to create NFC device")
		return
	}
	RespondSuccess(c, http.StatusCreated, payload)
}

func updateNFCDeviceHandler(c *gin.Context) {
	var device NFCDevice
	id := c.Param("id")
	if err := db.First(&device, id).Error; err != nil {
		RespondNotFound(c, "NFC device not found")
		return
	}
	originalID := device.ID
	if err := c.BindJSON(&device); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}
	// Same fix as updateRestaurantHandler — don't let a body-supplied id
	// (or its zero-value default) redirect Save() away from the :id record.
	device.ID = originalID
	db.Save(&device)
	RespondSuccess(c, http.StatusOK, device)
}

type nfcStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=active disabled"`
}

// updateNFCDeviceStatusHandler flips a device between active/disabled
// without requiring a full edit form — used when a physical tag is
// reported broken or stolen.
func updateNFCDeviceStatusHandler(c *gin.Context) {
	var device NFCDevice
	if err := db.First(&device, c.Param("id")).Error; err != nil {
		RespondNotFound(c, "NFC device not found")
		return
	}
	var req nfcStatusRequest
	if err := c.BindJSON(&req); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}
	device.Status = req.Status
	db.Save(&device)
	logAuditEvent(c, "NFC_DEVICE_STATUS", "nfc_device", &device.ID, "status="+req.Status+" tag_id="+device.TagID)
	RespondSuccess(c, http.StatusOK, device)
}

func deleteNFCDeviceHandler(c *gin.Context) {
	id := c.Param("id")
	if err := db.Delete(&NFCDevice{}, id).Error; err != nil {
		RespondInternalError(c, "Failed to delete NFC device")
		return
	}
	logAuditEvent(c, "DELETE_NFC_DEVICE", "nfc_device", targetIDFromParam(id), "")
	RespondSuccess(c, http.StatusOK, map[string]string{"deleted": id})
}
