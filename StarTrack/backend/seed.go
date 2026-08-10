package main

// seedData mirrors backend/db/schema.sql's seed section so `go run main.go`
// against a brand-new database (without ever running the SQL script) still
// boots with usable demo data. Both paths are safe to use together since
// everything here is guarded by "only insert if the table is empty".
func seedData() {
	seedRestaurantsAndDevices()
	seedBadges()
	seedDemoUsers()
	seedCitiesAndCuisines()
}

func seedRestaurantsAndDevices() {
	var count int64
	db.Model(&Restaurant{}).Count(&count)
	if count > 0 {
		return
	}

	restaurants := []Restaurant{
		{Name: "Aurum Table", Stars: 3, Country: "USA", City: "Chicago", Address: "900 N Michigan Ave", Cuisine: "Contemporary", YearAwarded: 2026, LocationLat: 41.8984, LocationLong: -87.6242},
		{Name: "Celeste Bistro", Stars: 2, Country: "USA", City: "New York", Address: "120 W 57th St", Cuisine: "French", YearAwarded: 2025, LocationLat: 40.7649, LocationLong: -73.9793},
		{Name: "Miroir Lounge", Stars: 1, Country: "USA", City: "San Francisco", Address: "420 Market St", Cuisine: "Modern Asian", YearAwarded: 2026, LocationLat: 37.7936, LocationLong: -122.3965},
		{Name: "L'Atelier d'Or", Stars: 3, Country: "France", City: "Paris", Address: "5 Avenue Montaigne", Cuisine: "French", YearAwarded: 2026, LocationLat: 48.8656, LocationLong: 2.3036},
		{Name: "Den Tokyo", Stars: 2, Country: "Japan", City: "Tokyo", Address: "1-1 Marunouchi", Cuisine: "Modern Asian", YearAwarded: 2025, LocationLat: 35.6812, LocationLong: 139.7671},
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
