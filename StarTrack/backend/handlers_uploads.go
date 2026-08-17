package main

import (
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

const maxPhotoUploadBytes = 5 << 20 // 5 MB

// photoExtensionByContentType whitelists exactly the image types the mobile
// app and admin portal know how to render. Deliberately excludes
// image/svg+xml — an SVG can carry a <script>, which would execute in this
// backend's own origin if ever opened directly from /uploads.
var photoExtensionByContentType = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/gif":  ".gif",
	"image/webp": ".webp",
}

// uploadRestaurantPhotoHandler saves an admin-uploaded image to local disk
// and returns its URL for use as a Restaurant.PhotoURL. There's no working
// cloud storage configured in this project (S3Bucket/S3Region in config.go
// are unused placeholders), so local disk + static serving is the simplest
// thing that actually works.
func uploadRestaurantPhotoHandler(c *gin.Context) {
	fileHeader, err := c.FormFile("photo")
	if err != nil {
		RespondValidationError(c, "Missing photo file", nil)
		return
	}
	if fileHeader.Size > maxPhotoUploadBytes {
		RespondValidationError(c, "Photo must be 5MB or smaller", nil)
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		RespondInternalError(c, "Failed to read uploaded photo")
		return
	}
	defer file.Close()

	// Never trust the client-declared Content-Type or filename extension —
	// sniff the real content from the bytes themselves.
	sniffBuf := make([]byte, 512)
	n, err := file.Read(sniffBuf)
	if err != nil && err != io.EOF {
		RespondInternalError(c, "Failed to read uploaded photo")
		return
	}
	contentType := http.DetectContentType(sniffBuf[:n])
	ext, ok := photoExtensionByContentType[contentType]
	if !ok {
		RespondValidationError(c, "Photo must be a JPEG, PNG, GIF, or WebP image", nil)
		return
	}

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		RespondInternalError(c, "Failed to read uploaded photo")
		return
	}

	if err := os.MkdirAll("uploads", 0755); err != nil {
		RespondInternalError(c, "Failed to save photo")
		return
	}

	// Filename is always server-generated, never derived from the client's
	// filename — no path-traversal surface.
	filename := generateSecureToken() + ext
	dest, err := os.Create(filepath.Join("uploads", filename))
	if err != nil {
		RespondInternalError(c, "Failed to save photo")
		return
	}
	defer dest.Close()

	if _, err := io.Copy(dest, file); err != nil {
		RespondInternalError(c, "Failed to save photo")
		return
	}

	scheme := "http"
	if c.Request.TLS != nil {
		scheme = "https"
	}
	url := scheme + "://" + c.Request.Host + "/uploads/" + filename
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"photo_url": url})
}
