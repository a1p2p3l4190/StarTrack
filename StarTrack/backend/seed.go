package main

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

// seedData mirrors backend/db/schema.sql's seed section so `go run main.go`
// against a brand-new database (without ever running the SQL script) still
// boots with usable demo data. Both paths are safe to use together since
// everything here is guarded by "only insert if missing" checks.
//
// Every seeder here is idempotent per-row (keyed off a name/email/user
// rather than a whole-table count), so re-running against a database that
// already has the original demo data still tops it up with the newer
// restaurants/community/activity below instead of silently no-op'ing.
func seedData() {
	seedRestaurantsAndDevices()
	seedBadges()
	seedDemoUsers()
	seedCitiesAndCuisines()
	seedDemoActivity()
	seedCommunityUsersAndActivity()
	seedFollowGraph()
	seedDemoWishlistAndNotifications()
	seedDemoAnomalies()
	seedCommunityAnomalies()
}

// seedRestaurantDef is the seed-time shape for a restaurant plus its NFC tag
// and weekly hours, so the whole "one Michelin venue" bundle can live in a
// single literal below instead of three parallel slices.
type seedRestaurantDef struct {
	Name, Country, City, Address, Cuisine string
	Stars, YearAwarded, PriceTier         int
	Lat, Long                             float64
	TagID, Salt                           string
	// OpenTime/CloseTime default to 11:00/22:00 when left empty.
	OpenTime, CloseTime string
	// ClosedDays uses JS's Date.getDay() convention (0=Sunday..6=Saturday),
	// matching RestaurantHours.DayOfWeek.
	ClosedDays []int
}

func seedRestaurantDefs() []seedRestaurantDef {
	return []seedRestaurantDef{
		{Name: "Aurum Table", Country: "USA", City: "Chicago", Address: "900 N Michigan Ave", Cuisine: "Contemporary", Stars: 3, YearAwarded: 2026, PriceTier: 2, Lat: 41.8984, Long: -87.6242, TagID: "TAG-STAR-001", Salt: "golden-salt-2026"},
		{Name: "Celeste Bistro", Country: "USA", City: "New York", Address: "120 W 57th St", Cuisine: "French", Stars: 2, YearAwarded: 2025, PriceTier: 3, Lat: 40.7649, Long: -73.9793, TagID: "TAG-STAR-002", Salt: "ruby-salt-2025"},
		{Name: "Miroir Lounge", Country: "USA", City: "San Francisco", Address: "420 Market St", Cuisine: "Modern Asian", Stars: 1, YearAwarded: 2026, PriceTier: 2, Lat: 37.7936, Long: -122.3965, TagID: "TAG-STAR-003", Salt: "onyx-salt-2026"},
		{Name: "L'Atelier d'Or", Country: "France", City: "Paris", Address: "5 Avenue Montaigne", Cuisine: "French", Stars: 3, YearAwarded: 2026, PriceTier: 3, Lat: 48.8656, Long: 2.3036, TagID: "TAG-STAR-004", Salt: "platinum-salt-2026"},
		{Name: "Den Tokyo", Country: "Japan", City: "Tokyo", Address: "1-1 Marunouchi", Cuisine: "Modern Asian", Stars: 2, YearAwarded: 2025, PriceTier: 2, Lat: 35.6812, Long: 139.7671, TagID: "TAG-STAR-005", Salt: "jade-salt-2025"},

		{Name: "Ember & Oak", Country: "USA", City: "Los Angeles", Address: "8500 Sunset Blvd", Cuisine: "Contemporary", Stars: 2, YearAwarded: 2025, PriceTier: 2, Lat: 34.0900, Long: -118.3856, TagID: "TAG-STAR-006", Salt: "sunset-salt-2025", OpenTime: "11:30", CloseTime: "22:00", ClosedDays: []int{1}},
		{Name: "Thistle & Thorn", Country: "UK", City: "London", Address: "14 Berkeley Square", Cuisine: "Modern British", Stars: 1, YearAwarded: 2026, PriceTier: 3, Lat: 51.5090, Long: -0.1470, TagID: "TAG-STAR-007", Salt: "thorn-salt-2026", OpenTime: "18:00", CloseTime: "23:00", ClosedDays: []int{0, 1}},
		{Name: "Jade Pavilion", Country: "Hong Kong", City: "Hong Kong", Address: "8 Finance St, Central", Cuisine: "Cantonese", Stars: 2, YearAwarded: 2025, PriceTier: 3, Lat: 22.2830, Long: 114.1580, TagID: "TAG-STAR-008", Salt: "emerald-salt-2025", OpenTime: "11:00", CloseTime: "22:30"},
		{Name: "Kelapa Rooms", Country: "Singapore", City: "Singapore", Address: "1 Fullerton Rd", Cuisine: "Peranakan", Stars: 1, YearAwarded: 2026, PriceTier: 2, Lat: 1.2860, Long: 103.8530, TagID: "TAG-STAR-009", Salt: "orchid-salt-2026", OpenTime: "11:00", CloseTime: "21:30", ClosedDays: []int{1}},
		{Name: "Nordisk Havn", Country: "Denmark", City: "Copenhagen", Address: "Nyhavn 15", Cuisine: "New Nordic", Stars: 2, YearAwarded: 2025, PriceTier: 3, Lat: 55.6800, Long: 12.5900, TagID: "TAG-STAR-010", Salt: "harbor-salt-2025", OpenTime: "17:30", CloseTime: "22:00", ClosedDays: []int{0}},
		{Name: "Casa Bramido", Country: "Spain", City: "Barcelona", Address: "Passeig de Gràcia 92", Cuisine: "Catalan", Stars: 1, YearAwarded: 2026, PriceTier: 2, Lat: 41.3980, Long: 2.1620, TagID: "TAG-STAR-011", Salt: "garnet-salt-2026", OpenTime: "13:00", CloseTime: "23:00"},
		{Name: "Hanok Gyeol", Country: "South Korea", City: "Seoul", Address: "Bukchon-ro 37", Cuisine: "Korean Fine Dining", Stars: 2, YearAwarded: 2025, PriceTier: 2, Lat: 37.5820, Long: 126.9850, TagID: "TAG-STAR-012", Salt: "hanbok-salt-2025", OpenTime: "11:30", CloseTime: "21:00", ClosedDays: []int{1}},
		{Name: "Opal Harbour", Country: "Australia", City: "Sydney", Address: "1 Circular Quay", Cuisine: "Modern Australian", Stars: 1, YearAwarded: 2026, PriceTier: 2, Lat: -33.8590, Long: 151.2100, TagID: "TAG-STAR-013", Salt: "coral-salt-2026", OpenTime: "12:00", CloseTime: "22:00"},
		{Name: "Kiln & Cedar", Country: "Japan", City: "Kyoto", Address: "Gion Shijo", Cuisine: "Kaiseki", Stars: 3, YearAwarded: 2026, PriceTier: 3, Lat: 35.0038, Long: 135.7780, TagID: "TAG-STAR-014", Salt: "cedarwood-salt-2026", OpenTime: "17:00", CloseTime: "21:30", ClosedDays: []int{3}},
		{Name: "Osteria Aurelia", Country: "Italy", City: "Rome", Address: "Via Veneto 42", Cuisine: "Italian", Stars: 1, YearAwarded: 2025, PriceTier: 2, Lat: 41.9060, Long: 12.4880, TagID: "TAG-STAR-015", Salt: "aurelia-salt-2025", OpenTime: "12:30", CloseTime: "22:30", ClosedDays: []int{0}},
	}
}

func seedRestaurantsAndDevices() {
	var existing []Restaurant
	db.Find(&existing)
	byName := make(map[string]bool, len(existing))
	for _, r := range existing {
		byName[r.Name] = true
	}

	for _, def := range seedRestaurantDefs() {
		if byName[def.Name] {
			continue
		}

		r := Restaurant{
			Name: def.Name, Country: def.Country, City: def.City, Address: def.Address,
			Cuisine: def.Cuisine, PriceTier: def.PriceTier, LocationLat: def.Lat, LocationLong: def.Long,
		}
		db.Create(&r)

		// Stars/YearAwarded aren't stored on Restaurant — each seeded
		// restaurant needs its own RestaurantStarHistory row to show a rating.
		db.Create(&RestaurantStarHistory{RestaurantID: r.ID, Year: def.YearAwarded, Stars: def.Stars})
		db.Create(&NFCDevice{TagID: def.TagID, RestaurantID: r.ID, Salt: def.Salt})

		openTime, closeTime := def.OpenTime, def.CloseTime
		if openTime == "" {
			openTime = "11:00"
		}
		if closeTime == "" {
			closeTime = "22:00"
		}
		closedDays := make(map[int]bool, len(def.ClosedDays))
		for _, d := range def.ClosedDays {
			closedDays[d] = true
		}

		var hours []RestaurantHours
		for day := 0; day <= 6; day++ {
			h := RestaurantHours{RestaurantID: r.ID, DayOfWeek: day, OpenTime: openTime, CloseTime: closeTime}
			if closedDays[day] {
				h.IsClosed = true
				h.OpenTime = ""
				h.CloseTime = ""
			}
			hours = append(hours, h)
		}
		db.Create(&hours)
	}
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
	cities := []string{
		"Chicago", "New York", "San Francisco", "Paris", "Tokyo",
		"Los Angeles", "London", "Hong Kong", "Singapore", "Copenhagen",
		"Barcelona", "Seoul", "Sydney", "Kyoto", "Rome",
	}
	for _, name := range cities {
		db.Where(City{Name: name}).FirstOrCreate(&City{Name: name})
	}

	cuisines := []string{
		"Contemporary", "French", "Modern Asian",
		"Modern British", "Cantonese", "Peranakan", "New Nordic",
		"Catalan", "Korean Fine Dining", "Modern Australian", "Kaiseki", "Italian",
	}
	for _, name := range cuisines {
		db.Where(Cuisine{Name: name}).FirstOrCreate(&Cuisine{Name: name})
	}
}

// ensureUser looks up a user by email, creating it (with the shared demo
// password) only if missing. Shared by the admin/demo accounts and the
// wider community roster below so every seeded login works the same way.
func ensureUser(email, displayName, role, region string) User {
	var u User
	if err := db.Where("email = ?", email).First(&u).Error; err == nil {
		return u
	}

	hash, err := hashPassword("StarTrack123!")
	if err != nil {
		panic(err)
	}
	u = User{Email: email, PasswordHash: hash, DisplayName: displayName, Role: role, Region: region}
	db.Create(&u)
	return u
}

// seedDemoUsers creates an admin login for the Admin portal and a regular
// demo login for the mobile app, both with password "StarTrack123!". These
// match the accounts seeded by db/schema.sql's pgcrypto insert so either
// bootstrap path leaves you with the same credentials.
func seedDemoUsers() {
	ensureUser("admin@startrack.app", "StarTrack Admin", "admin", "Chicago")
	ensureUser("demo@startrack.app", "Laura Liu", "user", "Chicago")
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
		totalScoreGain += currentRestaurantStars(r.ID) * 10

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

	evaluateBadgesForUser(demoUser.ID)
}

// communityVisit is one seeded checkin (optionally reviewed) for a
// community user, keyed by restaurant name rather than index so it stays
// correct regardless of insertion order.
type communityVisit struct {
	RestaurantName string
	DaysAgo        int
	Rating         int // 0 = leave unreviewed, same convention as seedDemoActivity
	Comment        string
}

type communityUserDef struct {
	Email       string
	DisplayName string
	Region      string
	Visits      []communityVisit
}

func seedCommunityUserDefs() []communityUserDef {
	return []communityUserDef{
		{Email: "mei.tanaka@startrack.app", DisplayName: "Mei Tanaka", Region: "Tokyo", Visits: []communityVisit{
			{RestaurantName: "Den Tokyo", DaysAgo: 45, Rating: 5, Comment: "Den's omakase counter is Tokyo at its most refined — the anago course alone justified the wait for a reservation."},
			{RestaurantName: "Kiln & Cedar", DaysAgo: 20, Rating: 5, Comment: "Kiln & Cedar's kaiseki felt like eating through a Kyoto autumn, course by course. Worth the trip from Tokyo."},
			{RestaurantName: "Miroir Lounge", DaysAgo: 70, Rating: 4, Comment: "Miroir's modern Asian plating impressed me, though a couple of dishes leaned too sweet for my taste."},
		}},
		{Email: "julien.moreau@startrack.app", DisplayName: "Julien Moreau", Region: "Paris", Visits: []communityVisit{
			{RestaurantName: "L'Atelier d'Or", DaysAgo: 30, Rating: 5, Comment: "Still the benchmark for Parisian fine dining — the pigeon course this season is extraordinary."},
			{RestaurantName: "Casa Bramido", DaysAgo: 15, Rating: 4, Comment: "Casa Bramido's take on Catalan classics is bold; the suckling pig rivaled anything back home."},
			{RestaurantName: "Thistle & Thorn", DaysAgo: 55, Rating: 4, Comment: "Thistle & Thorn surprised me — modern British cooking has come a long way, and the service was flawless."},
		}},
		{Email: "sofia.almeida@startrack.app", DisplayName: "Sofia Almeida", Region: "Barcelona", Visits: []communityVisit{
			{RestaurantName: "Casa Bramido", DaysAgo: 25, Rating: 4, Comment: "Our neighborhood gem holding its star with pride — the seafood rice is unmatched in Barcelona."},
			{RestaurantName: "Osteria Aurelia", DaysAgo: 10, Rating: 5, Comment: "Osteria Aurelia's cacio e pepe reinvention was the best plate of pasta I've had all year."},
			{RestaurantName: "L'Atelier d'Or", DaysAgo: 80, Rating: 0},
		}},
		{Email: "daniel.osei@startrack.app", DisplayName: "Daniel Osei", Region: "London", Visits: []communityVisit{
			{RestaurantName: "Thistle & Thorn", DaysAgo: 18, Rating: 4, Comment: "Proud to have this one in London — the tasting menu keeps evolving without losing its identity."},
			{RestaurantName: "Nordisk Havn", DaysAgo: 40, Rating: 5, Comment: "Nordisk Havn's foraged tasting menu is New Nordic done right; the harbor view didn't hurt either."},
			{RestaurantName: "Celeste Bistro", DaysAgo: 65, Rating: 4, Comment: "Celeste Bistro brought me right back to a Parisian bistro, just with a Manhattan skyline."},
		}},
		{Email: "priya.nair@startrack.app", DisplayName: "Priya Nair", Region: "Singapore", Visits: []communityVisit{
			{RestaurantName: "Kelapa Rooms", DaysAgo: 22, Rating: 5, Comment: "Kelapa Rooms elevates Peranakan flavors I grew up with into something genuinely fine-dining."},
			{RestaurantName: "Jade Pavilion", DaysAgo: 12, Rating: 4, Comment: "Jade Pavilion's dim sum tasting was meticulous — the har gow alone is worth the flight to Hong Kong."},
			{RestaurantName: "Hanok Gyeol", DaysAgo: 50, Rating: 4, Comment: "Hanok Gyeol's hanjeongsik course was beautifully composed, though portions ran small for the price."},
		}},
		{Email: "marcus.chen@startrack.app", DisplayName: "Marcus Chen", Region: "Hong Kong", Visits: []communityVisit{
			{RestaurantName: "Jade Pavilion", DaysAgo: 28, Rating: 5, Comment: "Our city's finest Cantonese kitchen — the roast goose is still the best in Hong Kong."},
			{RestaurantName: "Kelapa Rooms", DaysAgo: 8, Rating: 4, Comment: "Kelapa Rooms' laksa reinterpretation is clever, though I missed the punch of the street-side version."},
			{RestaurantName: "Den Tokyo", DaysAgo: 60, Rating: 0},
		}},
		{Email: "isabella.rossi@startrack.app", DisplayName: "Isabella Rossi", Region: "Rome", Visits: []communityVisit{
			{RestaurantName: "Osteria Aurelia", DaysAgo: 20, Rating: 4, Comment: "Osteria Aurelia keeps Roman cuisine honest while adding just enough polish to earn the star."},
			{RestaurantName: "Casa Bramido", DaysAgo: 45, Rating: 4, Comment: "Casa Bramido's seafood was as fresh as anything on the Amalfi coast — a real find in Barcelona."},
			{RestaurantName: "Thistle & Thorn", DaysAgo: 75, Rating: 3, Comment: "Thistle & Thorn was solid but the pacing between courses dragged on a busy Friday night."},
		}},
		{Email: "noah.becker@startrack.app", DisplayName: "Noah Becker", Region: "Copenhagen", Visits: []communityVisit{
			{RestaurantName: "Nordisk Havn", DaysAgo: 14, Rating: 5, Comment: "Nordisk Havn continues to define New Nordic dining — every plate tells a story about the harbor."},
			{RestaurantName: "Thistle & Thorn", DaysAgo: 35, Rating: 4, Comment: "Thistle & Thorn's game course was a standout; London's fine dining scene keeps getting better."},
			{RestaurantName: "Aurum Table", DaysAgo: 90, Rating: 4, Comment: "Aurum Table's tasting menu is ambitious and mostly delivers — Chicago should be proud."},
		}},
		{Email: "hana.kim@startrack.app", DisplayName: "Hana Kim", Region: "Seoul", Visits: []communityVisit{
			{RestaurantName: "Hanok Gyeol", DaysAgo: 16, Rating: 5, Comment: "Hanok Gyeol turns traditional Korean court cuisine into something transcendent — my favorite table in Seoul."},
			{RestaurantName: "Den Tokyo", DaysAgo: 42, Rating: 5, Comment: "Den Tokyo's sushi counter is worth every minute of the wait; the toro was extraordinary."},
			{RestaurantName: "Kelapa Rooms", DaysAgo: 68, Rating: 0},
		}},
		{Email: "ethan.walker@startrack.app", DisplayName: "Ethan Walker", Region: "Los Angeles", Visits: []communityVisit{
			{RestaurantName: "Ember & Oak", DaysAgo: 24, Rating: 4, Comment: "Ember & Oak's wood-fired everything captures LA's produce-forward style perfectly."},
			{RestaurantName: "Miroir Lounge", DaysAgo: 9, Rating: 4, Comment: "Miroir Lounge's cocktail pairings elevated an already strong modern Asian menu."},
			{RestaurantName: "Opal Harbour", DaysAgo: 58, Rating: 5, Comment: "Opal Harbour's harbor-view tasting menu might be the most memorable meal I've had this year."},
		}},
		{Email: "grace.thompson@startrack.app", DisplayName: "Grace Thompson", Region: "Sydney", Visits: []communityVisit{
			{RestaurantName: "Opal Harbour", DaysAgo: 19, Rating: 4, Comment: "Opal Harbour keeps raising the bar for modern Australian cooking with that harbor backdrop."},
			{RestaurantName: "Ember & Oak", DaysAgo: 47, Rating: 3, Comment: "Ember & Oak was good but felt overhyped — the mains didn't match the excitement around the starters."},
			{RestaurantName: "Kiln & Cedar", DaysAgo: 85, Rating: 0},
		}},
		{Email: "oliver.smith@startrack.app", DisplayName: "Oliver Smith", Region: "New York", Visits: []communityVisit{
			{RestaurantName: "Celeste Bistro", DaysAgo: 11, Rating: 5, Comment: "Celeste Bistro remains my go-to for a special occasion — the duck confit is unbeatable."},
			{RestaurantName: "Aurum Table", DaysAgo: 33, Rating: 4, Comment: "Aurum Table's tasting menu impressed a Chicago skeptic — the wagyu course was the highlight."},
			{RestaurantName: "L'Atelier d'Or", DaysAgo: 77, Rating: 5, Comment: "L'Atelier d'Or lived up to every bit of its reputation — dinner in Paris I won't forget."},
		}},
	}
}

// seedCommunityUsersAndActivity populates a wider cast of fictional diners
// (beyond the single demo login) so the leaderboard, restaurant review
// counts, and follow graph feel like a real community instead of one
// person's account. Guarded per-user (like seedDemoActivity), so it tops up
// any users/visits that weren't there yet on a re-run.
func seedCommunityUsersAndActivity() {
	var restaurants []Restaurant
	db.Find(&restaurants)
	restaurantByName := make(map[string]Restaurant, len(restaurants))
	for _, r := range restaurants {
		restaurantByName[r.Name] = r
	}

	var devices []NFCDevice
	db.Find(&devices)
	deviceByRestaurant := make(map[uint]uint, len(devices))
	for _, d := range devices {
		deviceByRestaurant[d.RestaurantID] = d.ID
	}

	now := time.Now()
	for _, cu := range seedCommunityUserDefs() {
		user := ensureUser(cu.Email, cu.DisplayName, "user", cu.Region)

		var count int64
		db.Model(&CheckIn{}).Where("user_id = ?", user.ID).Count(&count)
		if count > 0 {
			continue
		}

		totalScoreGain := 0
		for _, v := range cu.Visits {
			r, ok := restaurantByName[v.RestaurantName]
			if !ok {
				continue
			}

			var devicePtr *uint
			if deviceID, ok := deviceByRestaurant[r.ID]; ok {
				devicePtr = &deviceID
			}

			visitedAt := now.AddDate(0, 0, -v.DaysAgo)
			checkin := CheckIn{
				UserID:       user.ID,
				RestaurantID: r.ID,
				DeviceID:     devicePtr,
				NFCSignature: fmt.Sprintf("seed-signature-%d-%d", user.ID, r.ID),
				Verified:     true,
				VerifiedAt:   &visitedAt,
				LocationLat:  r.LocationLat,
				LocationLong: r.LocationLong,
				CreatedAt:    visitedAt,
			}
			db.Create(&checkin)
			totalScoreGain += currentRestaurantStars(r.ID) * 10

			if v.Rating > 0 {
				review := Review{
					RestaurantID: r.ID,
					UserID:       user.ID,
					CheckInID:    &checkin.ID,
					Rating:       v.Rating,
					Comment:      v.Comment,
					CreatedAt:    visitedAt.Add(90 * time.Minute),
				}
				db.Create(&review)
				totalScoreGain += 5
			}
		}

		if totalScoreGain > 0 {
			db.Model(&User{}).Where("id = ?", user.ID).UpdateColumn("score", gorm.Expr("score + ?", totalScoreGain))
		}
		evaluateBadgesForUser(user.ID)
	}
}

// seedFollowGraph wires up a small social graph between the demo user and
// the community roster (plus some cross-follows among the community users
// themselves) so the follower/following counts and feed don't read as a
// ghost town. Guarded on the whole table since nothing else writes Follow
// rows at seed time.
func seedFollowGraph() {
	var count int64
	db.Model(&Follow{}).Count(&count)
	if count > 0 {
		return
	}

	var users []User
	db.Find(&users)
	byEmail := make(map[string]User, len(users))
	for _, u := range users {
		byEmail[u.Email] = u
	}

	// {follower, followee}
	pairs := [][2]string{
		{"demo@startrack.app", "mei.tanaka@startrack.app"},
		{"demo@startrack.app", "julien.moreau@startrack.app"},
		{"demo@startrack.app", "isabella.rossi@startrack.app"},
		{"demo@startrack.app", "oliver.smith@startrack.app"},
		{"demo@startrack.app", "grace.thompson@startrack.app"},

		{"oliver.smith@startrack.app", "demo@startrack.app"},
		{"sofia.almeida@startrack.app", "demo@startrack.app"},
		{"daniel.osei@startrack.app", "demo@startrack.app"},
		{"marcus.chen@startrack.app", "demo@startrack.app"},

		{"julien.moreau@startrack.app", "sofia.almeida@startrack.app"},
		{"sofia.almeida@startrack.app", "isabella.rossi@startrack.app"},
		{"isabella.rossi@startrack.app", "sofia.almeida@startrack.app"},
		{"julien.moreau@startrack.app", "isabella.rossi@startrack.app"},
		{"mei.tanaka@startrack.app", "hana.kim@startrack.app"},
		{"mei.tanaka@startrack.app", "marcus.chen@startrack.app"},
		{"priya.nair@startrack.app", "marcus.chen@startrack.app"},
		{"priya.nair@startrack.app", "hana.kim@startrack.app"},
		{"noah.becker@startrack.app", "daniel.osei@startrack.app"},
		{"daniel.osei@startrack.app", "noah.becker@startrack.app"},
		{"ethan.walker@startrack.app", "grace.thompson@startrack.app"},
		{"grace.thompson@startrack.app", "ethan.walker@startrack.app"},
		{"oliver.smith@startrack.app", "julien.moreau@startrack.app"},
	}

	now := time.Now()
	var follows []Follow
	for i, p := range pairs {
		follower, ok1 := byEmail[p[0]]
		followee, ok2 := byEmail[p[1]]
		if !ok1 || !ok2 || follower.ID == followee.ID {
			continue
		}
		follows = append(follows, Follow{
			UserID:          follower.ID,
			FollowingUserID: followee.ID,
			CreatedAt:       now.AddDate(0, 0, -(i%30 + 1)),
		})
	}
	if len(follows) > 0 {
		db.Create(&follows)
	}
}

// seedDemoWishlistAndNotifications gives the demo login a couple of
// wishlist entries and notifications so the Tools and Notification Center
// screens aren't empty on first login. Guarded per-user, independent of
// seedDemoActivity so it still runs if that already ran in an older DB.
func seedDemoWishlistAndNotifications() {
	var demoUser User
	if err := db.Where("email = ?", "demo@startrack.app").First(&demoUser).Error; err != nil {
		return
	}

	var wishCount int64
	db.Model(&WishlistItem{}).Where("user_id = ?", demoUser.ID).Count(&wishCount)
	if wishCount == 0 {
		var kiln, nordisk Restaurant
		db.Where("name = ?", "Kiln & Cedar").First(&kiln)
		db.Where("name = ?", "Nordisk Havn").First(&nordisk)

		var items []WishlistItem
		if kiln.ID != 0 {
			id := kiln.ID
			items = append(items, WishlistItem{
				UserID: demoUser.ID, RestaurantID: &id, RestaurantName: kiln.Name,
				PriceTier: 3, OpeningHours: "17:00–21:30 (closed Wed)",
				Note: "Save up for the omakase counter — reservations open two months out.",
			})
		}
		if nordisk.ID != 0 {
			id := nordisk.ID
			items = append(items, WishlistItem{
				UserID: demoUser.ID, RestaurantID: &id, RestaurantName: nordisk.Name,
				PriceTier: 3, OpeningHours: "17:30–22:00 (closed Sun)",
				Note: "Chase the New Nordic tasting menu next time I'm in Copenhagen.",
			})
		}
		items = append(items, WishlistItem{
			UserID: demoUser.ID, RestaurantName: "Sable & Ash",
			Note: "Friend's recommendation — new opening downtown, check when reservations go live.",
		})
		db.Create(&items)
	}

	var notifCount int64
	db.Model(&Notification{}).Where("user_id = ?", demoUser.ID).Count(&notifCount)
	if notifCount == 0 {
		now := time.Now()
		welcomeAt := now.AddDate(0, 0, -20)
		notifications := []Notification{
			{UserID: demoUser.ID, Kind: "system", Title: "Welcome to StarTrack", Message: "Track every Michelin visit, collect badges, and climb the leaderboard.", CreatedAt: welcomeAt, ReadAt: &welcomeAt},
			{UserID: demoUser.ID, Kind: "follow", Title: "New follower", Message: "Sofia Almeida started following you.", CreatedAt: now.AddDate(0, 0, -6)},
			{UserID: demoUser.ID, Kind: "follow", Title: "New follower", Message: "Oliver Smith started following you.", CreatedAt: now.AddDate(0, 0, -4)},
			{UserID: demoUser.ID, Kind: "reservation", Title: "Reservation window opening soon", Message: "L'Atelier d'Or typically releases new tables on the 1st of the month.", CreatedAt: now.AddDate(0, 0, -1)},
		}
		db.Create(&notifications)
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
		Severity:    "high",
		Status:      "open",
		CreatedAt:   now.Add(-6 * time.Hour),
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

// seedCommunityAnomalies adds a few more anomalies tied to the community
// roster's checkins/devices, so the Security Dashboard reflects more than
// just the single demo account. Guarded on the Kelapa Rooms device already
// having an anomaly, since that's unique to this function's rows.
func seedCommunityAnomalies() {
	var kelapa Restaurant
	if err := db.Where("name = ?", "Kelapa Rooms").First(&kelapa).Error; err != nil {
		return
	}
	var kelapaDevice NFCDevice
	if err := db.Where("restaurant_id = ?", kelapa.ID).First(&kelapaDevice).Error; err != nil {
		return
	}

	var already int64
	db.Model(&Anomaly{}).Where("device_id = ?", kelapaDevice.ID).Count(&already)
	if already > 0 {
		return
	}

	var opal Restaurant
	db.Where("name = ?", "Opal Harbour").First(&opal)

	var marcus, priya, grace User
	db.Where("email = ?", "marcus.chen@startrack.app").First(&marcus)
	db.Where("email = ?", "priya.nair@startrack.app").First(&priya)
	db.Where("email = ?", "grace.thompson@startrack.app").First(&grace)
	if marcus.ID == 0 || priya.ID == 0 || grace.ID == 0 {
		return
	}

	findCheckIn := func(userID, restaurantID uint) *CheckIn {
		var ci CheckIn
		if err := db.Where("user_id = ? AND restaurant_id = ?", userID, restaurantID).First(&ci).Error; err != nil {
			return nil
		}
		return &ci
	}

	now := time.Now()
	anomalies := []Anomaly{}

	// High/open: same "too far, too fast" velocity pattern as the demo
	// user's anomaly, this time between Marcus Chen's Hong Kong and
	// Singapore visits.
	if marcusHK := findCheckIn(marcus.ID, func() uint { var r Restaurant; db.Where("name = ?", "Jade Pavilion").First(&r); return r.ID }()); marcusHK != nil {
		if marcusSG := findCheckIn(marcus.ID, kelapa.ID); marcusSG != nil {
			distance := haversineDistance(kelapa.LocationLat, kelapa.LocationLong, marcusHK.LocationLat, marcusHK.LocationLong)
			rid := kelapa.ID
			cid := marcusSG.ID
			uid := marcus.ID
			anomalies = append(anomalies, Anomaly{
				UserID: &uid, RestaurantID: &rid, CheckInID: &cid,
				Description: fmt.Sprintf("Rapid check-ins %.0f km apart within %d minutes: %q then %q", distance, int(velocityWindow.Minutes()), "Jade Pavilion", "Kelapa Rooms"),
				Severity:    "high",
				Status:      "open",
				CreatedAt:   now.Add(-3 * time.Hour),
			})
		}
	}

	// Medium/open: repeated failed signatures on the Kelapa Rooms tag,
	// tied to Priya Nair's checkin there.
	if priyaCheckin := findCheckIn(priya.ID, kelapa.ID); priyaCheckin != nil {
		uid := priya.ID
		cid := priyaCheckin.ID
		did := kelapaDevice.ID
		anomalies = append(anomalies, Anomaly{
			UserID: &uid, DeviceID: &did, CheckInID: &cid,
			Description: fmt.Sprintf("Repeated failed check-in signatures from one device (%d attempts in the last hour)", failureThreshold+1),
			Severity:    "medium",
			Status:      "open",
			CreatedAt:   now.Add(-15 * time.Hour),
		})
	}

	// Low/open: a minor geofence miss still awaiting review, at Opal Harbour.
	if opal.ID != 0 {
		if graceCheckin := findCheckIn(grace.ID, opal.ID); graceCheckin != nil {
			uid := grace.ID
			rid := opal.ID
			cid := graceCheckin.ID
			anomalies = append(anomalies, Anomaly{
				UserID: &uid, RestaurantID: &rid, CheckInID: &cid,
				Description: "Check-in location ~180m outside registered geofence",
				Severity:    "low",
				Status:      "open",
				CreatedAt:   now.Add(-2 * time.Hour),
			})
		}
	}

	if len(anomalies) > 0 {
		db.Create(&anomalies)
	}
}
