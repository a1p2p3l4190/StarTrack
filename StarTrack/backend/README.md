# StarTrack Backend

Go + Gin + GORM API for the StarTrack ecosystem (mobile app + admin portal).

## 1. Database setup

You need a local PostgreSQL server (14+ recommended). Two ways to get schema
+ seed data in place — pick one:

**Option A — run the SQL script directly (recommended, shows the full design):**

```bash
createdb startrack
psql -d startrack -f db/schema.sql
```

This creates every table, index, and constraint, and seeds 5 restaurants,
their NFC tags, the 9-badge catalog, and two demo logins (see below). It's
idempotent — safe to re-run.

**Option B — let the Go server bootstrap it:**

Just start the server (step 3) against an empty database. `gorm.AutoMigrate`
creates the same tables on boot, and `seedData()` inserts the same seed
restaurants/devices/badges/demo users in Go instead of SQL.

Either path lands in the same place; you can also do A then B (AutoMigrate
no-ops against tables that already match).

See `db/schema.sql` for the full table-by-table design rationale in comments.

## 2. Configure environment variables

```bash
export DATABASE_URL="postgres://user:password@localhost:5432/startrack?sslmode=disable"
export JWT_SECRET="something-long-and-random-in-production"
export S3_BUCKET="startrack-assets"     # unused placeholder, reserved for future photo uploads
export S3_REGION="us-east-1"
```

`JWT_SECRET` defaults to an insecure dev value if unset — always set a real
one outside local development.

## 3. Run

```bash
go mod tidy
go run .
```

Server listens on `:8081` by default (override with `PORT`; 8080 is often
already taken by Apache/XAMPP or another dev server on Windows).

## Demo logins

Seeded by both `db/schema.sql` and `seedData()` in Go — password is the same
for both:

| Email                  | Password         | Role  |
|-------------------------|-------------------|-------|
| admin@startrack.app     | StarTrack123!     | admin |
| demo@startrack.app      | StarTrack123!     | user  |

The admin portal requires the `admin` role; the mobile app works with either.

## API overview

All endpoints are under `/api`. `auth` = requires `Authorization: Bearer <token>`.
`admin` = requires `auth` **and** the user's role to be `admin`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | /health | – | liveness check |
| POST | /auth/register | – | create a mobile account |
| POST | /auth/login | – | returns `{ token, user }` |
| GET | /auth/me | auth | current user profile |
| GET | /restaurants | – | list (filters: `year`, `stars`, `cuisine`, `city`, `country`, `q`) |
| GET | /restaurants/:id | – | single restaurant |
| POST/PUT/DELETE | /restaurants(/:id) | admin | manage catalog |
| GET | /nfc-devices | admin | list provisioned tags |
| POST/PUT/DELETE | /nfc-devices(/:id) | admin | manage tags |
| GET | /restaurants/:id/reviews | – | list reviews |
| GET | /restaurants/:id/review-eligibility | auth | can I review right now? |
| POST | /restaurants/:id/reviews | auth | post a review (requires a verified checkin at that restaurant in the last 7 days) |
| GET | /restaurants/:id/simulate-nfc-scan | – | **dev helper**: stands in for tapping a physical tag (see note below) |
| POST | /checkins/verify | auth | verify an NFC tap (signature + geofence check) |
| GET | /checkins/me/history | auth | `{ "<restaurant_id>": {timestamp, shorthand} }` |
| GET | /checkins/me/passport | auth | `{ "1": "AT", "2": "CB", ... }` for the 28-slot passport grid |
| GET | /badges | auth | catalog + this user's unlock status/rank |
| GET | /leaderboard | – | top 20 users by score |
| GET/POST | /wishlist | auth | list / add wishlist entries |
| DELETE | /wishlist/:id | auth | remove (must belong to caller) |
| GET | /anomalies | admin | flagged fraud/velocity anomalies |

### About `/simulate-nfc-scan`

The mobile app in this repo has no real NFC hardware access (that needs a
custom Expo dev client + native NFC module, out of scope here). A physical
tag would be etched once, at provisioning time, with `{tag_id, signature}` —
the phone just reads that pair off the tag on tap. This endpoint returns the
same pair so the app can simulate a tap without hardware. It changes nothing
about the actual security model: `POST /checkins/verify` independently
recomputes the expected signature server-side from the tag's salt and checks
the caller's GPS coordinates against the restaurant's registered location,
so a tampered client still can't fake a verified check-in.

### Badge rules

Unlock conditions live in `handlers_badges.go` (`badgeRules`), keyed by badge
`code`. Re-evaluated after every successful checkin and every new review.

### Anomaly detection

`handlers_social.go` flags two patterns after each checkin attempt:
- **Velocity**: two verified checkins at restaurants >5km apart within 15 minutes.
- **Repeated failures**: ≥3 failed signature/geofence checks from the same device within an hour.

## Testing with Postman

Import `postman/StarTrack.postman_collection.json` into Postman. It's one collection
covering every endpoint, grouped into folders (Auth, Restaurants, NFC Devices,
Checkins, Reviews, Badges & Leaderboard, Wishlist, Security Dashboard). It
already points at `http://localhost:8081/api` via the `base_url` collection
variable — change that if you run the server elsewhere.

Login requests have test scripts that save the returned JWT into collection
variables (`user_token`, `admin_token`), and a few other requests (Create
Restaurant, Simulate NFC Scan, Add Wishlist Item...) save IDs the same way —
so within each folder you can mostly just run requests top-to-bottom:

1. **Auth → Login (Demo User)** and **Auth → Login (Admin)** — populates `user_token`/`admin_token`.
2. **Checkins → Simulate NFC Scan** — populates `tag_id`/`signature` for the restaurant in `restaurant_id` (defaults to `1`, the seeded Aurum Table).
3. **Checkins → Verify Checkin** — uses those plus `restaurant_lat`/`restaurant_long` (also defaulted to Aurum Table's coordinates, so it verifies successfully). Point the lat/long elsewhere to see a geofence failure instead.
4. Everything else (Reviews, Badges, Leaderboard, Wishlist, admin-only Restaurant/NFC-device writes, Security Dashboard) works once the tokens above are set.

## Automated tests

```bash
go test ./...
```

Tests run against an in-memory SQLite database (no Postgres required) via
the same `setupRouter()` main.go uses, so they exercise the real HTTP
handlers end-to-end rather than mocking them out. Coverage includes:

- `auth_test.go` / `util_test.go` — JWT sign/parse/tamper/expiry, bcrypt hashing, haversine distance, signature generation (no DB needed).
- `handlers_auth_test.go` — register/login/me, duplicate email, wrong password.
- `handlers_restaurants_test.go` — filtering, admin-only write protection.
- `handlers_checkins_test.go` — signature verification, geofence pass/fail, badge unlocking, passport grid.
- `handlers_reviews_test.go` — the 7-day verified-checkin review gate.
- `handlers_social_test.go` — wishlist ownership, leaderboard ordering, anomaly detection, admin-only routes.

Run `go test ./... -v` for per-test output.
