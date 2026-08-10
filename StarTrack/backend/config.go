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
