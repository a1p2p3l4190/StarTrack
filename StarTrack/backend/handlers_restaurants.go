package main

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// caseInsensitiveContains builds a `LOWER(column) LIKE LOWER(?)`-style clause
// instead of Postgres-only ILIKE, so the same query works unchanged against
// SQLite in tests.
func caseInsensitiveContains(column, value string) (string, string) {
	return "LOWER(" + column + ") LIKE ?", "%" + strings.ToLower(value) + "%"
}

func listRestaurantsHandler(c *gin.Context) {
	var restaurants []Restaurant
	query := db.Order("stars desc, year_awarded desc")

	if year := c.Query("year"); year != "" {
		if num, err := strconv.Atoi(year); err == nil {
			query = query.Where("year_awarded = ?", num)
		}
	}
	if tier := c.Query("stars"); tier != "" {
		if num, err := strconv.Atoi(tier); err == nil {
			query = query.Where("stars = ?", num)
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
		c.JSON(http.StatusOK, gin.H{"restaurants": restaurants})
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

	c.JSON(http.StatusOK, gin.H{"restaurants": restaurants, "total": total, "page": page, "limit": limit})
}

func getRestaurantHandler(c *gin.Context) {
	var restaurant Restaurant
	if err := db.First(&restaurant, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "restaurant not found"})
		return
	}
	c.JSON(http.StatusOK, restaurant)
}

// validStars rejects anything outside the Michelin 1-3 star scale. The
// frontend's <input min/max> is a UX nicety, not a security boundary —
// this is the actual enforcement, since any HTTP client can bypass the
// browser entirely.
func validStars(stars int) bool {
	return stars >= 1 && stars <= 3
}

func createRestaurantHandler(c *gin.Context) {
	var payload Restaurant
	if err := c.BindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !validStars(payload.Stars) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "stars must be between 1 and 3"})
		return
	}
	if err := db.Create(&payload).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, payload)
}

func updateRestaurantHandler(c *gin.Context) {
	var restaurant Restaurant
	id := c.Param("id")
	if err := db.First(&restaurant, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "restaurant not found"})
		return
	}
	if err := c.BindJSON(&restaurant); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !validStars(restaurant.Stars) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "stars must be between 1 and 3"})
		return
	}
	db.Save(&restaurant)
	c.JSON(http.StatusOK, restaurant)
}

func deleteRestaurantHandler(c *gin.Context) {
	id := c.Param("id")
	if err := db.Delete(&Restaurant{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	logAuditEvent(c, "DELETE_RESTAURANT", "restaurant", targetIDFromParam(id), "")
	c.JSON(http.StatusOK, gin.H{"deleted": id})
}

func listNFCDevicesHandler(c *gin.Context) {
	var devices []NFCDevice
	db.Order("created_at desc").Find(&devices)
	c.JSON(http.StatusOK, gin.H{"devices": devices})
}

func createNFCDeviceHandler(c *gin.Context) {
	var payload NFCDevice
	if err := c.BindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := db.Create(&payload).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, payload)
}

func updateNFCDeviceHandler(c *gin.Context) {
	var device NFCDevice
	id := c.Param("id")
	if err := db.First(&device, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
		return
	}
	if err := c.BindJSON(&device); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	db.Save(&device)
	c.JSON(http.StatusOK, device)
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
		c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
		return
	}
	var req nfcStatusRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	device.Status = req.Status
	db.Save(&device)
	logAuditEvent(c, "NFC_DEVICE_STATUS", "nfc_device", &device.ID, "status="+req.Status+" tag_id="+device.TagID)
	c.JSON(http.StatusOK, device)
}

func deleteNFCDeviceHandler(c *gin.Context) {
	id := c.Param("id")
	if err := db.Delete(&NFCDevice{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	logAuditEvent(c, "DELETE_NFC_DEVICE", "nfc_device", targetIDFromParam(id), "")
	c.JSON(http.StatusOK, gin.H{"deleted": id})
}
