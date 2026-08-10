package main

import (
	"sync"
	"time"
)

// In-memory per-email login attempt tracking. Good enough for a single
// backend instance; a multi-instance deployment would need this in Redis
// or similar shared store instead.
const (
	maxLoginAttempts    = 5
	loginLockoutDuration = 5 * time.Minute
)

type loginAttemptState struct {
	failCount   int
	lockedUntil time.Time
}

var (
	loginAttemptsMu sync.Mutex
	loginAttempts   = map[string]*loginAttemptState{}
)

// checkLoginLockout reports whether email is currently locked out, and if
// so, how much longer.
func checkLoginLockout(email string) (locked bool, retryAfter time.Duration) {
	loginAttemptsMu.Lock()
	defer loginAttemptsMu.Unlock()
	state, ok := loginAttempts[email]
	if !ok || !time.Now().Before(state.lockedUntil) {
		return false, 0
	}
	return true, time.Until(state.lockedUntil)
}

// recordLoginFailure increments email's failure count, locking it out for
// loginLockoutDuration once maxLoginAttempts is reached.
func recordLoginFailure(email string) {
	loginAttemptsMu.Lock()
	defer loginAttemptsMu.Unlock()
	state, ok := loginAttempts[email]
	if !ok {
		state = &loginAttemptState{}
		loginAttempts[email] = state
	}
	state.failCount++
	if state.failCount >= maxLoginAttempts {
		state.lockedUntil = time.Now().Add(loginLockoutDuration)
		state.failCount = 0
	}
}

func clearLoginFailures(email string) {
	loginAttemptsMu.Lock()
	defer loginAttemptsMu.Unlock()
	delete(loginAttempts, email)
}

// resetLoginLockoutState wipes all tracked attempts — used between tests so
// one test's failed logins can't spuriously lock out another test reusing
// the same email address.
func resetLoginLockoutState() {
	loginAttemptsMu.Lock()
	defer loginAttemptsMu.Unlock()
	loginAttempts = map[string]*loginAttemptState{}
}
