package main

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

// seedData mirrors backend/db/schema.sql's seed section so `go run main.go`
// against a brand-new database (without ever running the SQL script) still
// boots with usable demo data. Both paths are safe to use together since
// everything here is guarded by "only insert if the table is empty".
func seedData() {
	seedRestaurantsAndDevices()
	seedBadges()
	seedDemoUsers()
	seedCitiesAndCuisines()
	seedDemoActivity()
	seedDemoAnomalies()
}

func seedRestaurantsAndDevices() {
	var count int64
	db.Model(&Restaurant{}).Count(&count)
	if count > 0 {
		return
	}

	restaurants := []Restaurant{
		{Name: "Aurum Table", Stars: 3, Country: "USA", City: "Chicago", Address: "900 N Michigan Ave", Cuisine: "Contemporary", YearAwarded: 2026, PriceTier: 2, LocationLat: 41.8984, LocationLong: -87.6242},
		{Name: "Celeste Bistro", Stars: 2, Country: "USA", City: "New York", Address: "120 W 57th St", Cuisine: "French", YearAwarded: 2025, PriceTier: 3, LocationLat: 40.7649, LocationLong: -73.9793},
		{Name: "Miroir Lounge", Stars: 1, Country: "USA", City: "San Francisco", Address: "420 Market St", Cuisine: "Modern Asian", YearAwarded: 2026, PriceTier: 2, LocationLat: 37.7936, LocationLong: -122.3965},
		{Name: "L'Atelier d'Or", Stars: 3, Country: "France", City: "Paris", Address: "5 Avenue Montaigne", Cuisine: "French", YearAwarded: 2026, PriceTier: 3, LocationLat: 48.8656, LocationLong: 2.3036},
		{Name: "Den Tokyo", Stars: 2, Country: "Japan", City: "Tokyo", Address: "1-1 Marunouchi", Cuisine: "Modern Asian", YearAwarded: 2025, PriceTier: 2, LocationLat: 35.6812, LocationLong: 139.7671},
	}
	db.Create(&restaurants)

	devices := []NFCDevice{
		{TagID: "TAG-STAR-001", RestaurantID: restaurants[0].ID, Salt: "golden-salt-2026"},
		{TagID: "TAG-STAR-002", RestaurantID: restaurants[1].ID, Salt: "ruby-salt-2025"},
		{TagID: "TAG-STAR-003", RestaurantID: restaurants[2].ID, Salt: "onyx-salt-2026"},
		{TagID: "TAG-STAR-004", RestaurantID: restaurants[3].ID, Salt: "platinum-salt-2026"},
		{TagID: "TAG-STAR-005", RestaurantID: restaurants[4].ID, Salt: "jade-salt-2025"},
	}
	db.Create(&devices)

	// Default weekly hours (daily 11:00-22:00) for every seeded restaurant.
	var hours []RestaurantHours
	for _, r := range restaurants {
		for day := 0; day <= 6; day++ {
			hours = append(hours, RestaurantHours{RestaurantID: r.ID, DayOfWeek: day, OpenTime: "11:00", CloseTime: "22:00"})
		}
	}
	db.Create(&hours)
}

func seedBadges() {
	var count int64
	db.Model(&Badge{}).Count(&count)
	if count > 0 {
		return
	}

	badges := []Badge{
		{Code: "b1", Title: "3-Star Connoisseur", Category: "Michelin", Description: "Dined at a 3-star Michelin venue.", Icon: "\U0001F451"},
		{Code: "b2", Title: "Chicago Elite", Category: "Regional", Description: "Verified 3 restaurants in Chicago.", Icon: "\U0001F3D9️"},
		{Code: "b3", Title: "NFC Pioneer", Category: "Social", Description: "First time using NFC proof-of-dining.", Icon: "⚡"},
		{Code: "b4", Title: "Gourmet Master", Category: "Social", Description: "Reached top 3 on the leaderboard.", Icon: "\U0001F3C6"},
		{Code: "b5", Title: "French Critic", Category: "Michelin", Description: "Tried 5 different French contemporary menus.", Icon: "\U0001F956"},
		{Code: "b6", Title: "NY Jetsetter", Category: "Regional", Description: "Unlocked a premium New York dining badge.", Icon: "\U0001F5FD"},
		{Code: "b7", Title: "Star Collector", Category: "Michelin", Description: "Accumulated over 10 Michelin stars.", Icon: "✨"},
		{Code: "b8", Title: "First Class Lounge", Category: "Social", Description: "Shared your badge wall with 10 friends.", Icon: "\U0001F942"},
		{Code: "b9", Title: "SF Explorer", Category: "Regional", Description: "Verified at a San Francisco establishment.", Icon: "\U0001F309"},
	}
	db.Create(&badges)
}

// seedCitiesAndCuisines pre-populates the admin portal's typeable dropdowns
// with the values already used by the seeded restaurants, so the pickers
// aren't empty on first run.
func seedCitiesAndCuisines() {
	var cityCount int64
	db.Model(&City{}).Count(&cityCount)
	if cityCount == 0 {
		cities := []City{{Name: "Chicago"}, {Name: "New York"}, {Name: "San Francisco"}, {Name: "Paris"}, {Name: "Tokyo"}}
		db.Create(&cities)
	}

	var cuisineCount int64
	db.Model(&Cuisine{}).Count(&cuisineCount)
	if cuisineCount == 0 {
		cuisines := []Cuisine{{Name: "Contemporary"}, {Name: "French"}, {Name: "Modern Asian"}}
		db.Create(&cuisines)
	}
}

// seedDemoUsers creates an admin login for the Admin portal and a regular
// demo login for the mobile app, both with password "StarTrack123!". These
// match the accounts seeded by db/schema.sql's pgcrypto insert so either
// bootstrap path leaves you with the same credentials.
func seedDemoUsers() {
	var count int64
	db.Model(&User{}).Count(&count)
	if count > 0 {
		return
	}

	adminHash, err := hashPassword("StarTrack123!")
	if err != nil {
		panic(err)
	}
	demoHash, err := hashPassword("StarTrack123!")
	if err != nil {
		panic(err)
	}

	users := []User{
		{Email: "admin@startrack.app", PasswordHash: adminHash, DisplayName: "StarTrack Admin", Role: "admin", Region: "Chicago"},
		{Email: "demo@startrack.app", PasswordHash: demoHash, DisplayName: "Laura Liu", Role: "user", Region: "Chicago"},
	}
	db.Create(&users)
}

// seedDemoActivity gives the demo login (demo@startrack.app) a few verified
// checkins — some already reviewed so the passport/profile isn't empty on
// first login, and a couple left unreviewed so a live demo can walk through
// actually writing a review. Score is bumped by the same amounts
// verifyCheckinHandler/createReviewHandler award in the real flow, so the
// leaderboard and badge math stay consistent with organically earned points.
func seedDemoActivity() {
	var demoUser User
	if err := db.Where("email = ?", "demo@startrack.app").First(&demoUser).Error; err != nil {
		return
	}

	var count int64
	db.Model(&CheckIn{}).Where("user_id = ?", demoUser.ID).Count(&count)
	if count > 0 {
		return
	}

	var restaurants []Restaurant
	db.Order("id asc").Find(&restaurants)
	if len(restaurants) == 0 {
		return
	}

	var devices []NFCDevice
	db.Find(&devices)
	deviceByRestaurant := make(map[uint]uint, len(devices))
	for _, d := range devices {
		deviceByRestaurant[d.RestaurantID] = d.ID
	}

	type seedVisit struct {
		restaurantIdx int
		daysAgo       int
		reviewRating  int // 0 = leave unreviewed for a live demo review
		reviewComment string
	}
	visits := []seedVisit{
		{0, 12, 5, "The tasting menu at Aurum Table was worth every star — impeccable service and the wagyu course stole the show."},
		{1, 7, 4, "Celeste Bistro nailed the classic French flavors; ambiance was a little loud for the price point."},
		{2, 3, 0, ""},
		{3, 1, 0, ""},
	}

	now := time.Now()
	totalScoreGain := 0
	for _, v := range visits {
		if v.restaurantIdx >= len(restaurants) {
			continue
		}
		r := restaurants[v.restaurantIdx]

		var devicePtr *uint
		if deviceID, ok := deviceByRestaurant[r.ID]; ok {
			devicePtr = &deviceID
		}

		visitedAt := now.AddDate(0, 0, -v.daysAgo)
		checkin := CheckIn{
			UserID:       demoUser.ID,
			RestaurantID: r.ID,
			DeviceID:     devicePtr,
			NFCSignature: fmt.Sprintf("seed-signature-%d-%d", demoUser.ID, r.ID),
			Verified:     true,
			VerifiedAt:   &visitedAt,
			LocationLat:  r.LocationLat,
			LocationLong: r.LocationLong,
			CreatedAt:    visitedAt,
		}
		db.Create(&checkin)
		totalScoreGain += r.Stars * 10

		if v.reviewRating > 0 {
			review := Review{
				RestaurantID: r.ID,
				UserID:       demoUser.ID,
				CheckInID:    &checkin.ID,
				Rating:       v.reviewRating,
				Comment:      v.reviewComment,
				CreatedAt:    visitedAt.Add(2 * time.Hour),
			}
			db.Create(&review)
			totalScoreGain += 5
		}
	}

	if totalScoreGain > 0 {
		db.Model(&User{}).Where("id = ?", demoUser.ID).UpdateColumn("score", gorm.Expr("score + ?", totalScoreGain))
	}
}

// seedDemoAnomalies gives the admin Security Dashboard something to show on
// first login: a mix of severities and statuses (open/dismissed/confirmed)
// wired to the checkins and devices seedDemoActivity/seedRestaurantsAndDevices
// already created, rather than isolated rows with no drill-through target.
func seedDemoAnomalies() {
	var count int64
	db.Model(&Anomaly{}).Count(&count)
	if count > 0 {
		return
	}

	var demoUser User
	if err := db.Where("email = ?", "demo@startrack.app").First(&demoUser).Error; err != nil {
		return
	}

	var checkins []CheckIn
	db.Preload("Restaurant").Where("user_id = ?", demoUser.ID).Order("created_at asc").Find(&checkins)
	if len(checkins) < 3 {
		return
	}

	var devices []NFCDevice
	db.Order("id asc").Find(&devices)
	if len(devices) == 0 {
		return
	}
	deviceByRestaurant := make(map[uint]NFCDevice, len(devices))
	for _, d := range devices {
		deviceByRestaurant[d.RestaurantID] = d
	}

	uid := demoUser.ID
	now := time.Now()
	anomalies := []Anomaly{}

	// High/open: velocity anomaly between two checkins that are geographically
	// far apart but close in the seeded timeline, mirroring detectVelocityAnomaly.
	prior, current := checkins[0], checkins[1]
	rid := current.RestaurantID
	cid := current.ID
	distance := haversineDistance(current.Restaurant.LocationLat, current.Restaurant.LocationLong, prior.Restaurant.LocationLat, prior.Restaurant.LocationLong)
	anomalies = append(anomalies, Anomaly{
		UserID: &uid, RestaurantID: &rid, CheckInID: &cid,
		Description: fmt.Sprintf("Rapid check-ins %.0f km apart within %d minutes: %q then %q", distance, int(velocityWindow.Minutes()), prior.Restaurant.Name, current.Restaurant.Name),
		Severity:  "high",
		Status:    "open",
		CreatedAt: now.Add(-6 * time.Hour),
	})

	// Medium/open: repeated failed signatures against one NFC tag, tied to a
	// later checkin at the same restaurant so "revoke checkin" has a target.
	failCheckin := checkins[2]
	failCid := failCheckin.ID
	anomaly := Anomaly{
		UserID: &uid, CheckInID: &failCid,
		Description: fmt.Sprintf("Repeated failed check-in signatures from one device (%d attempts in the last hour)", failureThreshold+1),
		Severity:    "medium",
		Status:      "open",
		CreatedAt:   now.Add(-26 * time.Hour),
	}
	if failDevice, ok := deviceByRestaurant[failCheckin.RestaurantID]; ok {
		anomaly.DeviceID = &failDevice.ID
	}
	anomalies = append(anomalies, anomaly)

	// Low/dismissed: a minor geofence miss that was reviewed and cleared.
	geoCheckin := checkins[0]
	geoRid := geoCheckin.RestaurantID
	geoCid := geoCheckin.ID
	anomalies = append(anomalies, Anomaly{
		UserID: &uid, RestaurantID: &geoRid, CheckInID: &geoCid,
		Description: "Check-in location ~340m outside registered geofence",
		Severity:    "low",
		Status:      "dismissed",
		CreatedAt:   now.Add(-5 * 24 * time.Hour),
	})

	// High/confirmed: a tag flagged for cloning and already disabled.
	tamperedDevice := devices[len(devices)-1]
	anomalies = append(anomalies, Anomaly{
		DeviceID:    &tamperedDevice.ID,
		Description: fmt.Sprintf("NFC tag %s reported signature mismatches consistent with a cloned tag", tamperedDevice.TagID),
		Severity:    "high",
		Status:      "confirmed",
		CreatedAt:   now.Add(-9 * 24 * time.Hour),
	})

	db.Create(&anomalies)
}
