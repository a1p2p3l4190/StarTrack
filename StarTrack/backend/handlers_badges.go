package main

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func listBadgesHandler(c *gin.Context) {
	userID := currentUserID(c)

	var badges []Badge
	db.Order("id asc").Find(&badges)

	var userBadges []UserBadge
	db.Where("user_id = ?", userID).Find(&userBadges)
	unlockedAt := map[uint]time.Time{}
	for _, ub := range userBadges {
		unlockedAt[ub.BadgeID] = ub.UnlockedAt
	}

	out := make([]gin.H, 0, len(badges))
	for _, b := range badges {
		var total int64
		db.Model(&UserBadge{}).Where("badge_id = ?", b.ID).Count(&total)

		var userRank interface{}
		if at, ok := unlockedAt[b.ID]; ok {
			var rank int64
			db.Model(&UserBadge{}).Where("badge_id = ? AND unlocked_at <= ?", b.ID, at).Count(&rank)
			userRank = rank
		}

		out = append(out, gin.H{
			"id":             b.Code,
			"title":          b.Title,
			"category":       b.Category,
			"description":    b.Description,
			"icon":           b.Icon,
			"unlocked":       userRank != nil,
			"total_achieved": total,
			"user_rank":      userRank,
		})
	}
	c.JSON(http.StatusOK, gin.H{"badges": out})
}

// badgeRules maps a badge code to a predicate evaluated against the
// current DB state for a user. Adding a new automatically-earnable badge
// means adding a row here plus one in db/schema.sql's badges seed.
var badgeRules = map[string]func(userID uint) bool{
	"b1": func(userID uint) bool {
		return verifiedCheckinExists(userID, "restaurants.stars = ?", 3)
	},
	"b2": func(userID uint) bool {
		return distinctVerifiedRestaurantCount(userID, "restaurants.city = ?", "Chicago") >= 3
	},
	"b3": func(userID uint) bool {
		var count int64
		db.Model(&CheckIn{}).Where("user_id = ? AND verified = ?", userID, true).Count(&count)
		return count >= 1
	},
	"b4": func(userID uint) bool {
		var user User
		if db.First(&user, userID).Error != nil {
			return false
		}
		var higherScored int64
		db.Model(&User{}).Where("score > ?", user.Score).Count(&higherScored)
		return higherScored < 3
	},
	"b5": func(userID uint) bool {
		return distinctVerifiedRestaurantCount(userID, "LOWER(restaurants.cuisine) LIKE ?", "%french%") >= 5
	},
	"b6": func(userID uint) bool {
		return verifiedCheckinExists(userID, "restaurants.city = ?", "New York")
	},
	"b7": func(userID uint) bool {
		var total int64
		db.Raw(`
			SELECT COALESCE(SUM(stars), 0) FROM (
				SELECT DISTINCT restaurants.id, restaurants.stars
				FROM checkins JOIN restaurants ON restaurants.id = checkins.restaurant_id
				WHERE checkins.user_id = ? AND checkins.verified = true
			) AS distinct_restaurants
		`, userID).Scan(&total)
		return total >= 10
	},
	"b9": func(userID uint) bool {
		return verifiedCheckinExists(userID, "restaurants.city = ?", "San Francisco")
	},
}

func verifiedCheckinExists(userID uint, condition string, args ...interface{}) bool {
	var count int64
	query := db.Table("checkins").
		Joins("JOIN restaurants ON restaurants.id = checkins.restaurant_id").
		Where("checkins.user_id = ? AND checkins.verified = ?", userID, true).
		Where(condition, args...)
	query.Count(&count)
	return count > 0
}

func distinctVerifiedRestaurantCount(userID uint, condition string, args ...interface{}) int64 {
	var count int64
	db.Table("checkins").
		Joins("JOIN restaurants ON restaurants.id = checkins.restaurant_id").
		Where("checkins.user_id = ? AND checkins.verified = ?", userID, true).
		Where(condition, args...).
		Distinct("checkins.restaurant_id").
		Count(&count)
	return count
}

// evaluateBadgesForUser runs every known rule against the user's current
// state and unlocks (persists) any newly-earned badges. Called after a
// successful checkin or a new review. Returns the badges unlocked just now.
func evaluateBadgesForUser(userID uint) []Badge {
	var badges []Badge
	db.Find(&badges)

	var already []UserBadge
	db.Where("user_id = ?", userID).Find(&already)
	unlocked := map[uint]bool{}
	for _, ub := range already {
		unlocked[ub.BadgeID] = true
	}

	newlyUnlocked := []Badge{}
	for _, b := range badges {
		if unlocked[b.ID] {
			continue
		}
		rule, ok := badgeRules[b.Code]
		if !ok || !rule(userID) {
			continue
		}
		record := UserBadge{UserID: userID, BadgeID: b.ID, UnlockedAt: time.Now()}
		if err := db.Create(&record).Error; err == nil {
			newlyUnlocked = append(newlyUnlocked, b)
		}
	}
	return newlyUnlocked
}
