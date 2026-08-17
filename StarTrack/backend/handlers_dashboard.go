package main

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type topRestaurantStat struct {
	ID            uint   `json:"id"`
	Name          string `json:"name"`
	VerifiedCount int64  `json:"verified_checkins"`
}

type dailyCheckinStat struct {
	Date     string `json:"date"`
	Total    int    `json:"total"`
	Verified int    `json:"verified"`
}

type cityCheckinStat struct {
	City  string `json:"city"`
	Count int64  `json:"count"`
}

// adminStatsHandler backs the admin portal's Dashboard tab: system-wide
// totals, the top 5 restaurants by verified checkin volume, a 7-day daily
// checkin trend, and a per-city breakdown of verified checkins.
func adminStatsHandler(c *gin.Context) {
	var totalCheckins int64
	db.Model(&CheckIn{}).Count(&totalCheckins)

	var verifiedCheckins int64
	db.Model(&CheckIn{}).Where("verified = ?", true).Count(&verifiedCheckins)

	var totalUsers int64
	db.Model(&User{}).Where("role = ?", "user").Count(&totalUsers)

	var activeUsers int64
	db.Model(&CheckIn{}).Distinct("user_id").Count(&activeUsers)

	var openAnomalies int64
	db.Model(&Anomaly{}).Where("status = ?", "open").Count(&openAnomalies)

	anomalyRate := 0.0
	if totalCheckins > 0 {
		anomalyRate = float64(openAnomalies) / float64(totalCheckins) * 100
	}

	var top []topRestaurantStat
	db.Table("checkins").
		Select("restaurants.id as id, restaurants.name as name, COUNT(*) as verified_count").
		Joins("JOIN restaurants ON restaurants.id = checkins.restaurant_id").
		Where("checkins.verified = ?", true).
		Group("restaurants.id, restaurants.name").
		Order("verified_count DESC").
		Limit(5).
		Scan(&top)

	RespondSuccess(c, http.StatusOK, map[string]interface{}{
		"total_checkins":    totalCheckins,
		"verified_checkins": verifiedCheckins,
		"total_users":       totalUsers,
		"active_users":      activeUsers,
		"open_anomalies":    openAnomalies,
		"anomaly_rate":      anomalyRate,
		"top_restaurants":   top,
		"daily_trend":       dailyCheckinTrend(),
		"city_breakdown":    cityCheckinBreakdown(),
	})
}

// dailyCheckinTrend buckets the last 7 days (including today) of checkins
// in Go rather than SQL date-truncation, since that syntax isn't portable
// between Postgres (production) and SQLite (tests). Everything is bucketed
// by UTC calendar date — CreatedAt comes back from the DB normalized to
// UTC, so the cutoff and bucket keys have to be computed in UTC too, or
// the two calendars silently disagree near local midnight.
func dailyCheckinTrend() []dailyCheckinStat {
	since := time.Now().UTC().AddDate(0, 0, -6).Truncate(24 * time.Hour)

	var recent []CheckIn
	db.Where("created_at >= ?", since).Find(&recent)

	buckets := make(map[string]*dailyCheckinStat, 7)
	order := make([]string, 0, 7)
	for i := 0; i < 7; i++ {
		day := since.AddDate(0, 0, i).Format("2006-01-02")
		buckets[day] = &dailyCheckinStat{Date: day}
		order = append(order, day)
	}
	for _, ci := range recent {
		bucket, ok := buckets[ci.CreatedAt.UTC().Format("2006-01-02")]
		if !ok {
			continue
		}
		bucket.Total++
		if ci.Verified {
			bucket.Verified++
		}
	}

	trend := make([]dailyCheckinStat, 0, len(order))
	for _, day := range order {
		trend = append(trend, *buckets[day])
	}
	return trend
}

func cityCheckinBreakdown() []cityCheckinStat {
	var rows []cityCheckinStat
	db.Table("checkins").
		Select("restaurants.city as city, COUNT(*) as count").
		Joins("JOIN restaurants ON restaurants.id = checkins.restaurant_id").
		Where("checkins.verified = ?", true).
		Group("restaurants.city").
		Order("count DESC").
		Scan(&rows)
	return rows
}
