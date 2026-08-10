package main

import (
	"strings"
	"testing"
	"time"
)

func TestSignAndParseJWT_RoundTrip(t *testing.T) {
	token, err := signJWT(42, "admin", "secret", time.Hour)
	if err != nil {
		t.Fatalf("signJWT returned error: %v", err)
	}

	claims, err := parseJWT(token, "secret")
	if err != nil {
		t.Fatalf("parseJWT returned error: %v", err)
	}
	if claims.UserID != 42 {
		t.Errorf("expected UserID 42, got %d", claims.UserID)
	}
	if claims.Role != "admin" {
		t.Errorf("expected Role admin, got %q", claims.Role)
	}
}

func TestParseJWT_WrongSecretRejected(t *testing.T) {
	token, err := signJWT(1, "user", "secret-a", time.Hour)
	if err != nil {
		t.Fatalf("signJWT returned error: %v", err)
	}
	if _, err := parseJWT(token, "secret-b"); err == nil {
		t.Fatal("expected parseJWT to reject a token signed with a different secret")
	}
}

func TestParseJWT_TamperedPayloadRejected(t *testing.T) {
	token, err := signJWT(1, "user", "secret", time.Hour)
	if err != nil {
		t.Fatalf("signJWT returned error: %v", err)
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("expected 3 JWT segments, got %d", len(parts))
	}
	// Flip the claims segment but keep the original signature.
	tampered := parts[0] + "." + parts[1] + "x" + "." + parts[2]
	if _, err := parseJWT(tampered, "secret"); err == nil {
		t.Fatal("expected parseJWT to reject a tampered payload")
	}
}

func TestParseJWT_ExpiredTokenRejected(t *testing.T) {
	token, err := signJWT(1, "user", "secret", -time.Minute)
	if err != nil {
		t.Fatalf("signJWT returned error: %v", err)
	}
	if _, err := parseJWT(token, "secret"); err == nil {
		t.Fatal("expected parseJWT to reject an expired token")
	}
}

func TestHashAndCheckPassword(t *testing.T) {
	hash, err := hashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hashPassword returned error: %v", err)
	}
	if !checkPassword("correct horse battery staple", hash) {
		t.Error("expected checkPassword to accept the original password")
	}
	if checkPassword("wrong password", hash) {
		t.Error("expected checkPassword to reject an incorrect password")
	}
}
