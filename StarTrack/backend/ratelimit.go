package main

import (
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// ipRateLimiter hands out a per-IP token-bucket limiter, creating one on
// first sight and reusing it afterward. Limiters are never evicted — fine
// at the scale of a single admin/demo deployment; a long-running
// production service would want a TTL sweep to bound memory.
type ipRateLimiter struct {
	mu       sync.Mutex
	limiters map[string]*rate.Limiter
	r        rate.Limit
	burst    int
}

func newIPRateLimiter(requestsPerSecond float64, burst int) *ipRateLimiter {
	return &ipRateLimiter{
		limiters: make(map[string]*rate.Limiter),
		r:        rate.Limit(requestsPerSecond),
		burst:    burst,
	}
}

func (l *ipRateLimiter) get(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()
	limiter, ok := l.limiters[ip]
	if !ok {
		limiter = rate.NewLimiter(l.r, l.burst)
		l.limiters[ip] = limiter
	}
	return limiter
}

// rateLimitMiddleware rejects requests once an IP exceeds requestsPerSecond
// (with a short burst allowance), returning 429. Meant for endpoints that
// are attractive brute-force/DoS targets — login and NFC checkin
// verification — not applied globally so normal browsing traffic is
// unaffected.
func rateLimitMiddleware(requestsPerSecond float64, burst int) gin.HandlerFunc {
	limiter := newIPRateLimiter(requestsPerSecond, burst)
	return func(c *gin.Context) {
		if !limiter.get(c.ClientIP()).Allow() {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests, slow down"})
			return
		}
		c.Next()
	}
}
