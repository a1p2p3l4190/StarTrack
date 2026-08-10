package main

import (
	"net/http"
	"testing"
)

func TestIPRateLimiter_BlocksBurstExceeded(t *testing.T) {
	limiter := newIPRateLimiter(1, 2) // 1 req/sec refill, burst of 2
	ip := "203.0.113.5"
	if !limiter.get(ip).Allow() {
		t.Fatal("expected first request to be allowed")
	}
	if !limiter.get(ip).Allow() {
		t.Fatal("expected second request (within burst) to be allowed")
	}
	if limiter.get(ip).Allow() {
		t.Fatal("expected third immediate request to exceed burst and be denied")
	}
}

func TestIPRateLimiter_TracksPerIPIndependently(t *testing.T) {
	limiter := newIPRateLimiter(1, 1)
	if !limiter.get("1.1.1.1").Allow() {
		t.Fatal("expected first IP's first request to be allowed")
	}
	if limiter.get("1.1.1.1").Allow() {
		t.Fatal("expected first IP's second immediate request to be denied")
	}
	if !limiter.get("2.2.2.2").Allow() {
		t.Fatal("expected a different IP to have its own independent bucket")
	}
}

func TestLoginLockout_LocksAfterMaxAttempts(t *testing.T) {
	resetLoginLockoutState()
	email := "lockout-unit-test@example.com"
	for i := 0; i < maxLoginAttempts; i++ {
		recordLoginFailure(email)
	}
	locked, retryAfter := checkLoginLockout(email)
	if !locked {
		t.Fatal("expected account to be locked after max failed attempts")
	}
	if retryAfter <= 0 {
		t.Errorf("expected a positive retry-after duration, got %v", retryAfter)
	}
}

func TestLoginLockout_ClearsOnSuccessfulLogin(t *testing.T) {
	resetLoginLockoutState()
	email := "clear-unit-test@example.com"
	for i := 0; i < maxLoginAttempts-1; i++ {
		recordLoginFailure(email)
	}
	clearLoginFailures(email)
	locked, _ := checkLoginLockout(email)
	if locked {
		t.Fatal("expected lockout state to be cleared")
	}
}

// End-to-end: repeated bad-password attempts against the real login
// endpoint eventually get rejected with 429, whether that's the per-IP
// rate limiter or the per-email lockout kicking in first.
func TestLoginEndpoint_LocksOutAfterRepeatedFailures(t *testing.T) {
	router, _ := newTestApp(t)
	registerUser(t, router, "bruteforce-target@example.com", "correct-password", "Target")

	var last int
	for i := 0; i < maxLoginAttempts+1; i++ {
		w := doRequest(t, router, http.MethodPost, "/api/auth/login", "", loginRequest{
			Email: "bruteforce-target@example.com", Password: "wrong-password",
		})
		last = w.Code
	}
	if last != http.StatusTooManyRequests {
		t.Errorf("expected 429 after %d failed login attempts, got %d", maxLoginAttempts+1, last)
	}
}
