package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var db *gorm.DB

func main() {
	cfg, err := loadConfig()
	if err != nil {
		panic(err)
	}

	db, err = gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
	if err != nil {
		panic(fmt.Errorf("failed to connect database: %w", err))
	}

	if err := db.AutoMigrate(
		&User{}, &Restaurant{}, &NFCDevice{}, &CheckIn{},
		&Review{}, &Badge{}, &UserBadge{}, &WishlistItem{}, &Anomaly{},
		&City{}, &Cuisine{}, &AdminAuditLog{},
	); err != nil {
		panic(err)
	}

	seedData()

	router := setupRouter(cfg)
	router.Run(":" + cfg.Port)
}

// setupRouter wires every route. Pulled out of main() so tests can build the
// exact same router against a throwaway database instead of duplicating the
// route table.
func setupRouter(cfg *Config) *gin.Engine {
	router := gin.Default()
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	router.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "StarTrack backend is running"})
	})

	auth := authRequired(cfg)
	admin := adminRequired()

	// Brute-force/DoS guards on the two endpoints an attacker would script
	// first: credential stuffing against login, and hammering the NFC
	// verify endpoint. Per-IP token bucket, not applied globally so normal
	// browsing traffic never sees it.
	loginLimiter := rateLimitMiddleware(5, 5)
	checkinLimiter := rateLimitMiddleware(10, 20)

	api := router.Group("/api")
	{
		api.GET("/health", healthHandler)

		// Auth
		api.POST("/auth/register", registerHandler(cfg))
		api.POST("/auth/login", loginLimiter, loginHandler(cfg))
		api.GET("/auth/me", auth, meHandler)

		// Restaurants — public reads, admin-only writes
		api.GET("/restaurants", listRestaurantsHandler)
		api.GET("/restaurants/:id", getRestaurantHandler)
		api.POST("/restaurants", auth, admin, createRestaurantHandler)
		api.PUT("/restaurants/:id", auth, admin, updateRestaurantHandler)
		api.DELETE("/restaurants/:id", auth, admin, deleteRestaurantHandler)

		// NFC devices — admin only
		api.GET("/nfc-devices", auth, admin, listNFCDevicesHandler)
		api.POST("/nfc-devices", auth, admin, createNFCDeviceHandler)
		api.PUT("/nfc-devices/:id", auth, admin, updateNFCDeviceHandler)
		api.PATCH("/nfc-devices/:id/status", auth, admin, updateNFCDeviceStatusHandler)
		api.DELETE("/nfc-devices/:id", auth, admin, deleteNFCDeviceHandler)

		// Reviews — public reads, verified-checkin-gated writes. One review
		// per checkin: create is nested under the restaurant, edit/delete
		// address the review directly since it's already checkin-scoped.
		api.GET("/restaurants/:id/reviews", listReviewsHandler)
		api.GET("/restaurants/:id/review-eligibility", auth, reviewEligibilityHandler)
		api.POST("/restaurants/:id/reviews", auth, createReviewHandler)
		api.PUT("/reviews/:id", auth, updateReviewHandler)
		api.DELETE("/reviews/:id", auth, deleteReviewHandler)

		// Checkins — mobile, requires login
		api.GET("/restaurants/:id/simulate-nfc-scan", simulateNfcScanHandler)
		api.POST("/checkins/verify", checkinLimiter, auth, verifyCheckinHandler)
		api.GET("/checkins/me/history", auth, historyHandler)
		api.GET("/checkins/me/passport", auth, passportHandler)

		// Badges
		api.GET("/badges", auth, listBadgesHandler)

		// Leaderboard
		api.GET("/leaderboard", leaderboardHandler)

		// Wishlist
		api.GET("/wishlist", auth, listWishlistHandler)
		api.POST("/wishlist", auth, createWishlistHandler)
		api.DELETE("/wishlist/:id", auth, deleteWishlistHandler)

		// Security dashboard — admin only
		api.GET("/anomalies", auth, admin, listAnomaliesHandler)
		api.PATCH("/anomalies/:id/resolve", auth, admin, resolveAnomalyHandler)
		api.POST("/anomalies/:id/revoke-checkin", auth, admin, revokeAnomalyCheckinHandler)
		api.POST("/anomalies/:id/disable-device", auth, admin, disableAnomalyDeviceHandler)
		api.POST("/anomalies/:id/ban-user", auth, admin, banAnomalyUserHandler)

		// Users — admin only
		api.GET("/users", auth, admin, listUsersHandler)
		api.GET("/users/:id/history", auth, admin, getUserHistoryHandler)
		api.POST("/users/:id/ban", auth, admin, banUserHandler)
		api.POST("/users/:id/unban", auth, admin, unbanUserHandler)
		api.POST("/checkins/manual-verify", auth, admin, manualVerifyCheckinHandler)

		// Admin dashboard
		api.GET("/admin/stats", auth, admin, adminStatsHandler)

		// Audit log — every sensitive admin action, admin-only
		api.GET("/audit-logs", auth, admin, listAuditLogsHandler)

		// Option lists — admin portal's typeable city/cuisine dropdowns
		api.GET("/cities", auth, admin, listCitiesHandler)
		api.POST("/cities", auth, admin, createCityHandler)
		api.GET("/cuisines", auth, admin, listCuisinesHandler)
		api.POST("/cuisines", auth, admin, createCuisineHandler)
	}

	return router
}

func healthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"healthy": true})
}

func computeSignature(tagID, salt string) string {
	hash := sha256.Sum256([]byte(tagID + ":" + salt))
	return hex.EncodeToString(hash[:])
}

func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const r = 6371
	dLat := degreesToRadians(lat2 - lat1)
	dLon := degreesToRadians(lon2 - lon1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(degreesToRadians(lat1))*math.Cos(degreesToRadians(lat2))*math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return r * c
}

func degreesToRadians(deg float64) float64 {
	return deg * math.Pi / 180
}

func ordinal(value int) string {
	switch value {
	case 1:
		return "1st"
	case 2:
		return "2nd"
	case 3:
		return "3rd"
	default:
		return fmt.Sprintf("%dth", value)
	}
}
