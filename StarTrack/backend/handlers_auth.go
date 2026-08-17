package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type registerRequest struct {
	Email       string `json:"email" binding:"required,email"`
	Password    string `json:"password" binding:"required,min=8"`
	DisplayName string `json:"display_name" binding:"required"`
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type authResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

func generateSecureToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("token-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

func registerHandler(cfg *Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req registerRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
			return
		}

		email := strings.ToLower(strings.TrimSpace(req.Email))
		var existing User
		if err := db.Where("email = ?", email).First(&existing).Error; err == nil {
			RespondConflict(c, "An account with that email already exists")
			return
		}

		hash, err := hashPassword(req.Password)
		if err != nil {
			RespondInternalError(c, "Failed to hash password")
			return
		}

		user := User{
			Email:                  email,
			PasswordHash:           hash,
			DisplayName:            req.DisplayName,
			Role:                   "user",
			Region:                 "Global",
			EmailVerified:          false,
			EmailVerificationToken: generateSecureToken(),
		}
		if err := db.Create(&user).Error; err != nil {
			RespondInternalError(c, "Failed to create account")
			return
		}

		token, err := signJWT(user.ID, user.Role, cfg.JWTSecret, tokenTTL)
		if err != nil {
			RespondInternalError(c, "Failed to issue authentication token")
			return
		}
		hydrateFollowCounts(&user)
		RespondSuccess(c, http.StatusCreated, authResponse{Token: token, User: user})
	}
}

func loginHandler(cfg *Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req loginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
			return
		}

		email := strings.ToLower(strings.TrimSpace(req.Email))

		if locked, retryAfter := checkLoginLockout(email); locked {
			retrySeconds := int(retryAfter.Seconds())
			RespondErrorWithRetry(c, http.StatusTooManyRequests, ErrCodeRateLimit, "Too many failed login attempts. Please try again later.", retrySeconds)
			return
		}

		var user User
		if err := db.Where("email = ?", email).First(&user).Error; err != nil {
			recordLoginFailure(email)
			RespondUnauthorized(c, "Invalid email or password")
			return
		}
		if !checkPassword(req.Password, user.PasswordHash) {
			recordLoginFailure(email)
			RespondUnauthorized(c, "Invalid email or password")
			return
		}
		if user.Banned {
			RespondForbidden(c, "This account has been suspended")
			return
		}
		clearLoginFailures(email)

		token, err := signJWT(user.ID, user.Role, cfg.JWTSecret, tokenTTL)
		if err != nil {
			RespondInternalError(c, "Failed to issue authentication token")
			return
		}
		hydrateFollowCounts(&user)
		RespondSuccess(c, http.StatusOK, authResponse{Token: token, User: user})
	}
}

func meHandler(c *gin.Context) {
	var user User
	if err := db.First(&user, currentUserID(c)).Error; err != nil {
		RespondNotFound(c, "User not found")
		return
	}
	hydrateFollowCounts(&user)
	RespondSuccess(c, http.StatusOK, user)
}

// Pointer fields distinguish "omitted from the request" (nil — leave
// untouched) from "explicitly sent, possibly blank" (non-nil — apply,
// including clearing to empty). Plain strings couldn't tell those apart,
// which meant a user could never clear their bio/website/etc back to blank.
type updateMeRequest struct {
	DisplayName *string `json:"display_name"`
	Region      *string `json:"region"`
	Location    *string `json:"location"`
	Bio         *string `json:"bio"`
	AvatarURL   *string `json:"avatar_url"`
	Website     *string `json:"website"`
	Instagram   *string `json:"instagram"`
	X           *string `json:"x"`
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8"`
}

type deleteAccountRequest struct {
	Password string `json:"password" binding:"required"`
}

func updateMeHandler(c *gin.Context) {
	var req updateMeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}

	userID := currentUserID(c)
	var user User
	if err := db.First(&user, userID).Error; err != nil {
		RespondNotFound(c, "User not found")
		return
	}

	updates := map[string]interface{}{}
	// DisplayName can't be cleared to blank (it's the identity shown
	// everywhere and the DB column is NOT NULL) — every other field is
	// optional and may be explicitly cleared by sending it as "".
	if req.DisplayName != nil {
		if trimmed := strings.TrimSpace(*req.DisplayName); trimmed != "" {
			updates["display_name"] = trimmed
		}
	}
	if req.Region != nil {
		updates["region"] = strings.TrimSpace(*req.Region)
	}
	if req.Location != nil {
		updates["location"] = strings.TrimSpace(*req.Location)
	}
	if req.Bio != nil {
		updates["bio"] = strings.TrimSpace(*req.Bio)
	}
	if req.AvatarURL != nil {
		updates["avatar_url"] = strings.TrimSpace(*req.AvatarURL)
	}
	if req.Website != nil {
		updates["website"] = strings.TrimSpace(*req.Website)
	}
	if req.Instagram != nil {
		updates["instagram"] = strings.TrimSpace(*req.Instagram)
	}
	if req.X != nil {
		updates["x_handle"] = strings.TrimSpace(*req.X)
	}
	if len(updates) == 0 {
		RespondValidationError(c, "No profile fields provided", nil)
		return
	}

	if err := db.Model(&user).Updates(updates).Error; err != nil {
		RespondInternalError(c, "Failed to update profile")
		return
	}

	if err := db.First(&user, userID).Error; err != nil {
		RespondNotFound(c, "User not found")
		return
	}
	hydrateFollowCounts(&user)
	RespondSuccess(c, http.StatusOK, user)
}

type forgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type resetPasswordRequest struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

type verifyEmailRequest struct {
	Token string `json:"token" binding:"required"`
}

func forgotPasswordHandler(cfg *Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req forgotPasswordRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
			return
		}

		const genericMessage = "If that email is registered, we've sent a password reset code to it."

		email := strings.ToLower(strings.TrimSpace(req.Email))
		var user User
		if err := db.Where("email = ?", email).First(&user).Error; err != nil {
			// Don't reveal whether email exists (security)
			RespondSuccess(c, http.StatusOK, map[string]string{"message": genericMessage})
			return
		}

		resetToken := generateSecureToken()
		expiresAt := time.Now().Add(30 * time.Minute)
		user.PasswordResetToken = resetToken
		user.PasswordResetExpiresAt = &expiresAt
		if err := db.Save(&user).Error; err != nil {
			RespondInternalError(c, "Failed to generate password reset token")
			return
		}

		// The token is only ever delivered by email — never in this
		// response — otherwise anyone who knows a user's email address
		// could reset their password without ever touching their inbox.
		if err := sendEmail(cfg, user.Email, "Reset your StarTrack password", passwordResetEmailBody(resetToken)); err != nil {
			log.Printf("failed to send password reset email to %s: %v", user.Email, err)
		}

		RespondSuccess(c, http.StatusOK, map[string]string{"message": genericMessage})
	}
}

func resetPasswordHandler(c *gin.Context) {
	var req resetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}

	var user User
	if err := db.Where("password_reset_token = ?", req.Token).First(&user).Error; err != nil {
		RespondUnauthorized(c, "Invalid or expired reset token")
		return
	}
	if user.PasswordResetExpiresAt == nil || user.PasswordResetExpiresAt.Before(time.Now()) {
		RespondUnauthorized(c, "Reset token has expired")
		return
	}

	hash, err := hashPassword(req.NewPassword)
	if err != nil {
		RespondInternalError(c, "Failed to hash password")
		return
	}

	user.PasswordHash = hash
	user.PasswordResetToken = ""
	user.PasswordResetExpiresAt = nil
	if err := db.Save(&user).Error; err != nil {
		RespondInternalError(c, "Failed to reset password")
		return
	}
	RespondSuccess(c, http.StatusOK, map[string]string{"message": "Password reset successful"})
}

func verifyEmailHandler(c *gin.Context) {
	var req verifyEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
		return
	}

	var user User
	if err := db.Where("email_verification_token = ?", req.Token).First(&user).Error; err != nil {
		RespondUnauthorized(c, "Invalid verification token")
		return
	}

	user.EmailVerified = true
	user.EmailVerificationToken = ""
	if err := db.Save(&user).Error; err != nil {
		RespondInternalError(c, "Failed to verify email")
		return
	}
	hydrateFollowCounts(&user)
	RespondSuccess(c, http.StatusOK, map[string]interface{}{"message": "Email verified", "user": user})
}

func sendVerificationEmailHandler(cfg *Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := currentUserID(c)
		var user User
		if err := db.First(&user, userID).Error; err != nil {
			RespondNotFound(c, "User not found")
			return
		}
		if user.EmailVerified {
			RespondSuccess(c, http.StatusOK, map[string]interface{}{"message": "Email already verified", "email_verified": true})
			return
		}
		user.EmailVerificationToken = generateSecureToken()
		if err := db.Save(&user).Error; err != nil {
			RespondInternalError(c, "Failed to generate verification token")
			return
		}

		// Same rule as forgotPasswordHandler: the token is only ever
		// delivered by email, never in this response — otherwise anyone
		// could mark an email address they don't control as "verified."
		if err := sendEmail(cfg, user.Email, "Verify your StarTrack email", emailVerificationBody(user.EmailVerificationToken)); err != nil {
			log.Printf("failed to send verification email to %s: %v", user.Email, err)
		}

		RespondSuccess(c, http.StatusOK, map[string]string{"message": "Verification email sent — check your inbox."})
	}
}

func changePasswordHandler(cfg *Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req changePasswordRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
			return
		}

		userID := currentUserID(c)
		var user User
		if err := db.First(&user, userID).Error; err != nil {
			RespondNotFound(c, "User not found")
			return
		}
		if !checkPassword(req.CurrentPassword, user.PasswordHash) {
			RespondUnauthorized(c, "Current password is incorrect")
			return
		}
		if req.NewPassword == req.CurrentPassword {
			RespondValidationError(c, "New password must be different from the current one", nil)
			return
		}

		hash, err := hashPassword(req.NewPassword)
		if err != nil {
			RespondInternalError(c, "Failed to hash password")
			return
		}
		if err := db.Model(&user).Update("password_hash", hash).Error; err != nil {
			RespondInternalError(c, "Failed to update password")
			return
		}

		updatedUser := user
		updatedUser.PasswordHash = ""
		RespondSuccess(c, http.StatusOK, map[string]interface{}{"message": "Password updated", "user": updatedUser})
	}
}

func deleteAccountHandler(cfg *Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req deleteAccountRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			RespondValidationError(c, "Invalid request format", map[string]string{"error": err.Error()})
			return
		}

		userID := currentUserID(c)
		var user User
		if err := db.First(&user, userID).Error; err != nil {
			RespondNotFound(c, "User not found")
			return
		}
		if !checkPassword(req.Password, user.PasswordHash) {
			RespondUnauthorized(c, "Password is incorrect")
			return
		}

		if err := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Where("user_id = ?", userID).Delete(&WishlistItem{}).Error; err != nil {
				return err
			}
			if err := tx.Where("user_id = ?", userID).Delete(&Review{}).Error; err != nil {
				return err
			}
			if err := tx.Where("user_id = ?", userID).Delete(&UserBadge{}).Error; err != nil {
				return err
			}
			if err := tx.Where("user_id = ?", userID).Delete(&CheckIn{}).Error; err != nil {
				return err
			}
			if err := tx.Where("user_id = ?", userID).Delete(&Anomaly{}).Error; err != nil {
				return err
			}
			if err := tx.Where("user_id = ? OR following_user_id = ?", userID, userID).Delete(&Follow{}).Error; err != nil {
				return err
			}
			if err := tx.Where("user_id = ?", userID).Delete(&Notification{}).Error; err != nil {
				return err
			}
			if err := tx.Where("user_id = ?", userID).Delete(&ReviewReport{}).Error; err != nil {
				return err
			}
			if err := tx.Where("admin_id = ?", userID).Delete(&AdminAuditLog{}).Error; err != nil {
				return err
			}
			return tx.Delete(&user).Error
		}); err != nil {
			RespondInternalError(c, "Failed to delete account")
			return
		}

		RespondSuccess(c, http.StatusOK, map[string]string{"message": "Account deleted successfully"})
	}
}
