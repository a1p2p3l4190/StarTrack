package main

import (
	"net/http"
	"testing"
)

func TestCreateCity_DedupesCaseInsensitive(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	w := doRequest(t, router, http.MethodPost, "/api/cities", adminToken, City{Name: "Chicago"})
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 for first create, got %d: %s", w.Code, w.Body.String())
	}

	w = doRequest(t, router, http.MethodPost, "/api/cities", adminToken, City{Name: "chicago"})
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 (existing city returned) for case-insensitive duplicate, got %d: %s", w.Code, w.Body.String())
	}

	var count int64
	db.Model(&City{}).Count(&count)
	if count != 1 {
		t.Errorf("expected exactly one city row after duplicate submit, got %d", count)
	}
}

func TestListCitiesAndCuisines_RequireAdmin(t *testing.T) {
	router, _ := newTestApp(t)
	userToken, _ := registerUser(t, router, "user@example.com", "hunter22", "Regular User")

	w := doRequest(t, router, http.MethodGet, "/api/cities", userToken, nil)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for non-admin cities list, got %d: %s", w.Code, w.Body.String())
	}
	w = doRequest(t, router, http.MethodGet, "/api/cuisines", userToken, nil)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for non-admin cuisines list, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCreateCuisine_RejectsBlankName(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	w := doRequest(t, router, http.MethodPost, "/api/cuisines", adminToken, Cuisine{Name: "   "})
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for blank cuisine name, got %d: %s", w.Code, w.Body.String())
	}
}
