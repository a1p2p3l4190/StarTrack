package main

import (
	"math"
	"testing"
)

func TestHaversineDistance_SamePointIsZero(t *testing.T) {
	d := haversineDistance(41.8984, -87.6242, 41.8984, -87.6242)
	if math.Abs(d) > 1e-9 {
		t.Errorf("expected distance 0 for identical points, got %f", d)
	}
}

func TestHaversineDistance_ChicagoToNewYork(t *testing.T) {
	// Aurum Table (Chicago) vs Celeste Bistro (New York) — roughly 1140km apart.
	d := haversineDistance(41.8984, -87.6242, 40.7649, -73.9793)
	if d < 1000 || d > 1300 {
		t.Errorf("expected ~1100km between Chicago and New York, got %f", d)
	}
}

func TestOrdinal(t *testing.T) {
	cases := map[int]string{1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 11: "11th"}
	for input, want := range cases {
		if got := ordinal(input); got != want {
			t.Errorf("ordinal(%d) = %q, want %q", input, got, want)
		}
	}
}

func TestComputeSignature_DeterministicAndSaltSensitive(t *testing.T) {
	a := computeSignature("TAG-1", "salt-a")
	b := computeSignature("TAG-1", "salt-a")
	if a != b {
		t.Error("expected computeSignature to be deterministic for the same inputs")
	}
	c := computeSignature("TAG-1", "salt-b")
	if a == c {
		t.Error("expected a different salt to produce a different signature")
	}
}

func TestInitials(t *testing.T) {
	cases := map[string]string{
		"Aurum Table":    "AT",
		"Celeste Bistro": "CB",
		"Den Tokyo":      "DT",
	}
	for name, want := range cases {
		if got := initials(name); got != want {
			t.Errorf("initials(%q) = %q, want %q", name, got, want)
		}
	}
}
