package main

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// Cities and cuisines are simple shared picklists that back the admin
// portal's typeable dropdowns (Restaurant Engine, NFC Inventory filters).
// Reads/writes are admin-only since nothing outside the admin portal
// consumes them yet.

func listCitiesHandler(c *gin.Context) {
	var cities []City
	db.Order("name asc").Find(&cities)
	c.JSON(http.StatusOK, gin.H{"cities": cities})
}

func createCityHandler(c *gin.Context) {
	var payload City
	if err := c.BindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	var existing City
	if err := db.Where("LOWER(name) = LOWER(?)", payload.Name).First(&existing).Error; err == nil {
		c.JSON(http.StatusOK, existing)
		return
	}
	if err := db.Create(&payload).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, payload)
}

func listCuisinesHandler(c *gin.Context) {
	var cuisines []Cuisine
	db.Order("name asc").Find(&cuisines)
	c.JSON(http.StatusOK, gin.H{"cuisines": cuisines})
}

func createCuisineHandler(c *gin.Context) {
	var payload Cuisine
	if err := c.BindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	var existing Cuisine
	if err := db.Where("LOWER(name) = LOWER(?)", payload.Name).First(&existing).Error; err == nil {
		c.JSON(http.StatusOK, existing)
		return
	}
	if err := db.Create(&payload).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, payload)
}
