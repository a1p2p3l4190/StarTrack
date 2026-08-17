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
		&User{}, &Follow{}, &Restaurant{}, &RestaurantStarHistory{}, &RestaurantHours{}, &NFCDevice{}, &CheckIn{},
		&Review{}, &ReviewPhoto{}, &ReviewReport{}, &Badge{}, &UserBadge{}, &WishlistItem{}, &Notification{}, &Anomaly{},
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
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	router.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "StarTrack backend is running"})
	})
	router.Static("/uploads", "./uploads")

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
		api.PUT("/auth/me", auth, updateMeHandler)
		api.POST("/auth/change-password", auth, changePasswordHandler(cfg))
		api.POST("/auth/forgot-password", forgotPasswordHandler(cfg))
		api.POST("/auth/reset-password", resetPasswordHandler)
		api.POST("/auth/send-verification-email", auth, sendVerificationEmailHandler(cfg))
		api.POST("/auth/verify-email", verifyEmailHandler)
		api.DELETE("/auth/me", auth, deleteAccountHandler(cfg))

		// Restaurants — public reads, admin-only writes
		api.GET("/restaurants", listRestaurantsHandler)
		api.GET("/restaurants/:id", getRestaurantHandler)
		api.POST("/restaurants", auth, admin, createRestaurantHandler)
		api.PUT("/restaurants/:id", auth, admin, updateRestaurantHandler)
		api.DELETE("/restaurants/:id", auth, admin, deleteRestaurantHandler)
		api.PUT("/restaurants/:id/star-history", auth, admin, updateRestaurantStarHistoryHandler)
		api.PUT("/restaurants/:id/hours", auth, admin, updateRestaurantHoursHandler)
		api.POST("/uploads/photo", auth, admin, uploadRestaurantPhotoHandler)

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
		api.GET("/reports", auth, admin, listReviewReportsHandler)
		api.PATCH("/reports/:id/resolve", auth, admin, resolveReviewReportHandler)
		api.POST("/reviews/:id/report", auth, reportReviewHandler)
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

		// Social
		api.GET("/social/users/:id/stats", auth, userSocialStatsHandler)
		api.POST("/social/users/:id/follow", auth, toggleFollowHandler)
		api.GET("/social/users/:id/badge-wall", auth, userBadgeWallHandler)

		// Notifications / reminders
		api.GET("/notifications", auth, listNotificationsHandler)
		api.POST("/notifications/:id/read", auth, markNotificationReadHandler)
		api.POST("/notifications/read-all", auth, markAllNotificationsReadHandler)

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

func listNotificationsHandler(c *gin.Context) {
	userID := currentUserID(c)
	var notifications []Notification
	if err := db.Where("user_id = ?", userID).Order("created_at desc").Find(&notifications).Error; err != nil {
		RespondInternalError(c, err.Error())
		return
	}

	unreadCount := 0
	for i := range notifications {
		if notifications[i].ReadAt == nil {
			unreadCount++
		}
	}

	RespondSuccess(c, http.StatusOK, map[string]interface{}{"notifications": notifications, "unread_count": unreadCount})
}

func markNotificationReadHandler(c *gin.Context) {
	userID := currentUserID(c)
	var notification Notification
	if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&notification).Error; err != nil {
		RespondNotFound(c, "Notification not found")
		return
	}
	if notification.ReadAt == nil {
		now := time.Now()
		notification.ReadAt = &now
		if err := db.Save(&notification).Error; err != nil {
			RespondInternalError(c, err.Error())
			return
		}
	}
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"notification": notification})
}

func markAllNotificationsReadHandler(c *gin.Context) {
	userID := currentUserID(c)
	now := time.Now()
	if err := db.Model(&Notification{}).Where("user_id = ? AND read_at IS NULL", userID).Update("read_at", now).Error; err != nil {
		RespondInternalError(c, err.Error())
		return
	}
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"updated": true})
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
