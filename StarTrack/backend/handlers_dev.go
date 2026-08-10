package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// simulateNfcScanHandler stands in for a physical NFC reader. A real tag is
// etched with {tag_id, signature} once at provisioning time (see the admin
// NFC Inventory panel) and a phone reads that pair off the tag on tap. The
// mobile app in this scaffold has no NFC hardware access, so it asks the
// backend for the same pair instead of reading it off a tag — the actual
// verification in verifyCheckinHandler is unaffected either way.
func simulateNfcScanHandler(c *gin.Context) {
	var device NFCDevice
	if err := db.Where("restaurant_id = ?", c.Param("id")).First(&device).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no NFC device registered for this restaurant"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"tag_id":    device.TagID,
		"signature": computeSignature(device.TagID, device.Salt),
	})
}
