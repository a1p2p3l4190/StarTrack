package main

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
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

func registerHandler(cfg *Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req registerRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		email := strings.ToLower(strings.TrimSpace(req.Email))
		var existing User
		if err := db.Where("email = ?", email).First(&existing).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "an account with that email already exists"})
			return
		}

		hash, err := hashPassword(req.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}

		user := User{
			Email:        email,
			PasswordHash: hash,
			DisplayName:  req.DisplayName,
			Role:         "user",
			Region:       "Global",
		}
		if err := db.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		token, err := signJWT(user.ID, user.Role, cfg.JWTSecret, tokenTTL)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue token"})
			return
		}
		c.JSON(http.StatusCreated, authResponse{Token: token, User: user})
	}
}

func loginHandler(cfg *Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req loginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		email := strings.ToLower(strings.TrimSpace(req.Email))

		if locked, retryAfter := checkLoginLockout(email); locked {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": fmt.Sprintf("too many failed attempts — try again in %d minute(s)", int(retryAfter.Minutes())+1)})
			return
		}

		var user User
		if err := db.Where("email = ?", email).First(&user).Error; err != nil {
			recordLoginFailure(email)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid email or password"})
			return
		}
		if !checkPassword(req.Password, user.PasswordHash) {
			recordLoginFailure(email)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid email or password"})
			return
		}
		if user.Banned {
			c.JSON(http.StatusForbidden, gin.H{"error": "this account has been suspended"})
			return
		}
		clearLoginFailures(email)

		token, err := signJWT(user.ID, user.Role, cfg.JWTSecret, tokenTTL)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue token"})
			return
		}
		c.JSON(http.StatusOK, authResponse{Token: token, User: user})
	}
}

func meHandler(c *gin.Context) {
	var user User
	if err := db.First(&user, currentUserID(c)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, user)
}
