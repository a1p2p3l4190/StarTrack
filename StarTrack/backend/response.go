package main

import (
	"encoding/json"
	"net/http"
	"reflect"
	"strings"

	"github.com/gin-gonic/gin"
)

// StandardResponse is the unified response format for all API endpoints
type StandardResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   *ErrorInfo  `json:"error,omitempty"`
	Meta    *Metadata   `json:"meta,omitempty"`
}

// MarshalJSON keeps the standardized wrapper while exposing the original
// top-level payload keys as a backward-compatible layer for older client code
// and the existing Go tests that still decode the legacy response shapes.
func (r StandardResponse) MarshalJSON() ([]byte, error) {
	payload := map[string]interface{}{
		"success": r.Success,
	}

	if r.Meta != nil && r.Meta.Pagination != nil {
		payload["page"] = r.Meta.Pagination.Page
		payload["limit"] = r.Meta.Pagination.Limit
		payload["total"] = r.Meta.Pagination.Total
	}

	if r.Data != nil {
		payload["data"] = r.Data
		switch v := r.Data.(type) {
		case map[string]interface{}:
			for key, value := range v {
				payload[key] = value
			}
		case map[string]string:
			for key, value := range v {
				payload[key] = value
			}
		default:
			flat := flattenJSONValue(r.Data)
			for key, value := range flat {
				payload[key] = value
			}
		}
	}
	if r.Error != nil {
		payload["error"] = r.Error
	}
	if r.Meta != nil {
		payload["meta"] = r.Meta
	}
	return json.Marshal(payload)
}

func flattenJSONValue(value interface{}) map[string]interface{} {
	if value == nil {
		return map[string]interface{}{}
	}
	v := reflect.ValueOf(value)
	if v.Kind() == reflect.Ptr {
		if v.IsNil() {
			return map[string]interface{}{}
		}
		v = v.Elem()
	}
	if v.Kind() != reflect.Struct {
		return map[string]interface{}{}
	}
	out := make(map[string]interface{}, v.NumField())
	t := v.Type()
	for i := 0; i < v.NumField(); i++ {
		field := t.Field(i)
		if field.PkgPath != "" {
			continue
		}
		jsonTag := field.Tag.Get("json")
		// json:"-" means "never serialize this field" — PasswordHash,
		// PasswordResetToken, and EmailVerificationToken all rely on this to
		// stay out of API responses. Only skipping the *rename* here (the
		// old behavior) still added them under their raw Go field name.
		if jsonTag == "-" {
			continue
		}
		name := field.Name
		if jsonTag != "" {
			parts := strings.Split(jsonTag, ",")
			if parts[0] != "" {
				name = parts[0]
			}
		}
		out[name] = v.Field(i).Interface()
	}
	return out
}

// ErrorInfo contains detailed error information
type ErrorInfo struct {
	Code       string      `json:"code"`
	Message    string      `json:"message"`
	Details    interface{} `json:"details,omitempty"`
	RetryAfter int         `json:"retry_after,omitempty"` // seconds until retry is allowed
}

// Metadata contains response metadata like pagination
type Metadata struct {
	Pagination *PaginationMeta `json:"pagination,omitempty"`
}

// PaginationMeta contains pagination details
type PaginationMeta struct {
	Page  int `json:"page"`
	Limit int `json:"limit"`
	Total int `json:"total"`
}

// RespondSuccess sends a successful response with data
func RespondSuccess(c *gin.Context, statusCode int, data interface{}) {
	c.JSON(statusCode, StandardResponse{
		Success: true,
		Data:    data,
	})
}

// RespondSuccessWithMeta sends a successful response with data and metadata
func RespondSuccessWithMeta(c *gin.Context, statusCode int, data interface{}, meta *Metadata) {
	c.JSON(statusCode, StandardResponse{
		Success: true,
		Data:    data,
		Meta:    meta,
	})
}

// RespondError sends an error response with structured error info
func RespondError(c *gin.Context, statusCode int, code string, message string, details interface{}) {
	c.JSON(statusCode, StandardResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:    code,
			Message: message,
			Details: details,
		},
	})
}

// RespondErrorWithRetry sends an error response with retry information
func RespondErrorWithRetry(c *gin.Context, statusCode int, code string, message string, retryAfterSeconds int) {
	c.JSON(statusCode, StandardResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:       code,
			Message:    message,
			RetryAfter: retryAfterSeconds,
		},
	})
}

// Common error codes
const (
	ErrCodeValidation    = "VALIDATION_ERROR"
	ErrCodeUnauthorized  = "UNAUTHORIZED"
	ErrCodeForbidden     = "FORBIDDEN"
	ErrCodeNotFound      = "NOT_FOUND"
	ErrCodeConflict      = "CONFLICT"
	ErrCodeRateLimit     = "RATE_LIMIT"
	ErrCodeInternalError = "INTERNAL_ERROR"
	ErrCodeInvalidToken  = "INVALID_TOKEN"
	ErrCodeBadRequest    = "BAD_REQUEST"
	ErrCodeAccountBanned = "ACCOUNT_BANNED"
	ErrCodeInvalidCreds  = "INVALID_CREDENTIALS"
)

// RespondValidationError is a convenience for validation errors
func RespondValidationError(c *gin.Context, message string, details interface{}) {
	RespondError(c, http.StatusBadRequest, ErrCodeValidation, message, details)
}

// RespondUnauthorized is a convenience for unauthorized errors
func RespondUnauthorized(c *gin.Context, message string) {
	RespondError(c, http.StatusUnauthorized, ErrCodeUnauthorized, message, nil)
}

// RespondForbidden is a convenience for forbidden errors
func RespondForbidden(c *gin.Context, message string) {
	RespondError(c, http.StatusForbidden, ErrCodeForbidden, message, nil)
}

// RespondNotFound is a convenience for not found errors
func RespondNotFound(c *gin.Context, message string) {
	RespondError(c, http.StatusNotFound, ErrCodeNotFound, message, nil)
}

// RespondConflict is a convenience for conflict errors
func RespondConflict(c *gin.Context, message string) {
	RespondError(c, http.StatusConflict, ErrCodeConflict, message, nil)
}

// RespondInternalError is a convenience for internal server errors
func RespondInternalError(c *gin.Context, message string) {
	RespondError(c, http.StatusInternalServerError, ErrCodeInternalError, message, nil)
}
