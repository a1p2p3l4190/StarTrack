package main

import (
	"net/http"
	"testing"
)

func TestRegisterAndLogin(t *testing.T) {
	router, _ := newTestApp(t)

	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")
	if token == "" {
		t.Fatal("expected a non-empty token from registration")
	}

	w := doRequest(t, router, http.MethodPost, "/api/auth/login", "", loginRequest{
		Email: "laura@example.com", Password: "hunter22",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 logging in with correct credentials, got %d: %s", w.Code, w.Body.String())
	}
}

func TestRegister_DuplicateEmailRejected(t *testing.T) {
	router, _ := newTestApp(t)
	registerUser(t, router, "dup@example.com", "hunter22", "First")

	w := doRequest(t, router, http.MethodPost, "/api/auth/register", "", registerRequest{
		Email: "dup@example.com", Password: "hunter22", DisplayName: "Second",
	})
	if w.Code != http.StatusConflict {
		t.Errorf("expected 409 for duplicate email, got %d: %s", w.Code, w.Body.String())
	}
}

func TestLogin_WrongPasswordRejected(t *testing.T) {
	router, _ := newTestApp(t)
	registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodPost, "/api/auth/login", "", loginRequest{
		Email: "laura@example.com", Password: "wrong-password",
	})
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for wrong password, got %d: %s", w.Code, w.Body.String())
	}
}

func TestMe_RequiresAuth(t *testing.T) {
	router, _ := newTestApp(t)
	w := doRequest(t, router, http.MethodGet, "/api/auth/me", "", nil)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 without a token, got %d", w.Code)
	}
}

func TestMe_ReturnsCurrentUser(t *testing.T) {
	router, _ := newTestApp(t)
	token, _ := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	w := doRequest(t, router, http.MethodGet, "/api/auth/me", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var user User
	decodeJSON(t, w, &user)
	if user.Email != "laura@example.com" {
		t.Errorf("expected email laura@example.com, got %q", user.Email)
	}
}
