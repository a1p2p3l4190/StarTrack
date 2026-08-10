package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// newTestApp spins up a fresh in-memory SQLite database (migrated the same
// way Postgres is in main()) and returns a router wired identically to
// production. Each call is fully isolated from every other test.
func newTestApp(t *testing.T) (*gin.Engine, *Config) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	testDB, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	// SQLite's ":memory:" database is per-connection; force the pool down to
	// a single connection so every query in this test hits the same DB
	// instead of silently opening a second, empty one.
	sqlDB, err := testDB.DB()
	if err != nil {
		t.Fatalf("failed to get sql.DB: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)

	if err := testDB.AutoMigrate(
		&User{}, &Restaurant{}, &NFCDevice{}, &CheckIn{},
		&Review{}, &Badge{}, &UserBadge{}, &WishlistItem{}, &Anomaly{},
		&City{}, &Cuisine{}, &AdminAuditLog{},
	); err != nil {
		t.Fatalf("failed to migrate test db: %v", err)
	}
	db = testDB
	resetLoginLockoutState()

	cfg := &Config{JWTSecret: "test-secret", DatabaseURL: "sqlite-test"}
	return setupRouter(cfg), cfg
}

func doRequest(t *testing.T, router *gin.Engine, method, path, token string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()
	var reqBody *bytes.Buffer
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("failed to marshal body: %v", err)
		}
		reqBody = bytes.NewBuffer(payload)
	} else {
		reqBody = bytes.NewBuffer(nil)
	}

	req := httptest.NewRequest(method, path, reqBody)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func decodeJSON(t *testing.T, w *httptest.ResponseRecorder, out interface{}) {
	t.Helper()
	if err := json.Unmarshal(w.Body.Bytes(), out); err != nil {
		t.Fatalf("failed to decode response body %q: %v", w.Body.String(), err)
	}
}

// registerUser creates an account and returns its bearer token and ID.
func registerUser(t *testing.T, router *gin.Engine, email, password, displayName string) (string, uint) {
	t.Helper()
	w := doRequest(t, router, http.MethodPost, "/api/auth/register", "", registerRequest{
		Email: email, Password: password, DisplayName: displayName,
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("register failed: status %d body %s", w.Code, w.Body.String())
	}
	var resp authResponse
	decodeJSON(t, w, &resp)
	return resp.Token, resp.User.ID
}

// registerAdmin creates an account, promotes it to admin directly in the DB,
// then logs in again so the returned token's role claim is "admin".
func registerAdmin(t *testing.T, router *gin.Engine, email, password, displayName string) (string, uint) {
	t.Helper()
	_, userID := registerUser(t, router, email, password, displayName)
	if err := db.Model(&User{}).Where("id = ?", userID).Update("role", "admin").Error; err != nil {
		t.Fatalf("failed to promote user to admin: %v", err)
	}

	w := doRequest(t, router, http.MethodPost, "/api/auth/login", "", loginRequest{Email: email, Password: password})
	if w.Code != http.StatusOK {
		t.Fatalf("admin login failed: status %d body %s", w.Code, w.Body.String())
	}
	var resp authResponse
	decodeJSON(t, w, &resp)
	return resp.Token, resp.User.ID
}

func seedRestaurant(t *testing.T, r Restaurant) Restaurant {
	t.Helper()
	if err := db.Create(&r).Error; err != nil {
		t.Fatalf("failed to seed restaurant: %v", err)
	}
	return r
}

func seedNFCDevice(t *testing.T, d NFCDevice) NFCDevice {
	t.Helper()
	if err := db.Create(&d).Error; err != nil {
		t.Fatalf("failed to seed nfc device: %v", err)
	}
	return d
}
