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
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"cities": cities})
}

func createCityHandler(c *gin.Context) {
	var payload City
	if err := c.BindJSON(&payload); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Name == "" {
		RespondValidationError(c, "Name is required", nil)
		return
	}
	var existing City
	if err := db.Where("LOWER(name) = LOWER(?)", payload.Name).First(&existing).Error; err == nil {
		RespondSuccess(c, http.StatusOK, existing)
		return
	}
	if err := db.Create(&payload).Error; err != nil {
		RespondInternalError(c, "Failed to create city")
		return
	}
	RespondSuccess(c, http.StatusCreated, payload)
}

func listCuisinesHandler(c *gin.Context) {
	var cuisines []Cuisine
	db.Order("name asc").Find(&cuisines)
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"cuisines": cuisines})
}

func createCuisineHandler(c *gin.Context) {
	var payload Cuisine
	if err := c.BindJSON(&payload); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Name == "" {
		RespondValidationError(c, "Name is required", nil)
		return
	}
	var existing Cuisine
	if err := db.Where("LOWER(name) = LOWER(?)", payload.Name).First(&existing).Error; err == nil {
		RespondSuccess(c, http.StatusOK, existing)
		return
	}
	if err := db.Create(&payload).Error; err != nil {
		RespondInternalError(c, "Failed to create cuisine")
		return
	}
	RespondSuccess(c, http.StatusCreated, payload)
}
