package main

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"path/filepath"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
)

const maxPhotoUploadBytes = 5 << 20 // 5 MB

var photoExtensionByContentType = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/gif":  ".gif",
	"image/webp": ".webp",
}

func uploadRestaurantPhotoHandler(c *gin.Context) {
	cfg, ok := c.MustGet("config").(*Config)
	if !ok {
		RespondInternalError(c, "Server configuration error")
		return
	}

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

	// Sniff real content type — never trust client-declared type
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

	// Read full file into memory
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		RespondInternalError(c, "Failed to read uploaded photo")
		return
	}
	fileBytes, err := io.ReadAll(file)
	if err != nil {
		RespondInternalError(c, "Failed to read uploaded photo")
		return
	}

	// Upload to S3
	filename := "restaurants/" + generateSecureToken() + ext

	awsCfg, err := config.LoadDefaultConfig(context.TODO(),
		config.WithRegion(cfg.S3Region),
	)
	if err != nil {
		RespondInternalError(c, "Failed to connect to storage")
		return
	}

	client := s3.NewFromConfig(awsCfg)
	_, err = client.PutObject(context.TODO(), &s3.PutObjectInput{
		Bucket:      aws.String(cfg.S3Bucket),
		Key:         aws.String(filename),
		Body:        bytes.NewReader(fileBytes),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		RespondInternalError(c, "Failed to upload photo")
		return
	}

	// Return public S3 URL
	photoURL := "https://" + cfg.S3Bucket + ".s3." + cfg.S3Region + ".amazonaws.com/" + filepath.ToSlash(filename)
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"photo_url": photoURL})
}
