package main

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	DatabaseURL string
	S3Bucket    string
	S3Region    string
	JWTSecret   string
	Port        string

	// SMTP* are all optional. When SMTPHost is empty, sendEmail falls back
	// to logging the message instead of failing — this environment has no
	// mail account provisioned, but a real deployment just sets these.
	SMTPHost     string
	SMTPPort     string
	SMTPUsername string
	SMTPPassword string
	SMTPFrom     string
}

func loadConfig() (*Config, error) {
	loadDotEnv(".env")

	cfg := &Config{
		DatabaseURL: getEnv("DATABASE_URL", "postgres://localhost:5432/startrack?sslmode=disable"),
		S3Bucket:    getEnv("S3_BUCKET", "startrack-assets"),
		S3Region:    getEnv("S3_REGION", "us-east-1"),
		JWTSecret:   getEnv("JWT_SECRET", "dev-only-insecure-secret-change-me"),
		// 8080 is a common collision (Apache/XAMPP, other dev servers); 8081
		// is just a less-contested default, override with PORT if needed.
		Port: getEnv("PORT", "8081"),

		SMTPHost:     getEnv("SMTP_HOST", ""),
		SMTPPort:     getEnv("SMTP_PORT", "587"),
		SMTPUsername: getEnv("SMTP_USERNAME", ""),
		SMTPPassword: getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:     getEnv("SMTP_FROM", "StarTrack <no-reply@startrack.app>"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	return cfg, nil
}

func getEnv(key, defaultValue string) string {
	val := os.Getenv(key)
	if val == "" {
		return defaultValue
	}
	return val
}

// loadDotEnv reads simple KEY=VALUE lines from a .env file (if present) and
// applies them via os.Setenv, without overriding anything already set in the
// real environment — so `export DATABASE_URL=...` in your shell still wins
// over whatever is in .env. Missing file is not an error; .env is optional.
func loadDotEnv(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}

	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)

		if _, alreadySet := os.LookupEnv(key); !alreadySet {
			os.Setenv(key, value)
		}
	}
}
