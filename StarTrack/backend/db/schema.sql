-- =====================================================================
-- StarTrack PostgreSQL schema
--
-- Run directly against a fresh database, e.g.:
--   createdb startrack
--   psql -d startrack -f backend/db/schema.sql
--
-- This script is idempotent (safe to re-run): it creates the database
-- objects with IF NOT EXISTS / ON CONFLICT DO NOTHING guards.
--
-- The Go backend also runs GORM AutoMigrate on boot, which will happily
-- no-op against tables that already match this shape. You can therefore
-- either (a) run this script once up front and let the backend attach
-- to it, or (b) skip this script entirely and let AutoMigrate create
-- everything on first run. Running the script gives you seed data
-- (restaurants, NFC tags, badges, a demo login) without needing to hit
-- any HTTP endpoints first.
-- =====================================================================

-- bcrypt-compatible password hashing helpers (crypt/gen_salt), used only
-- to seed demo accounts below. The Go backend hashes passwords itself at
-- registration time via golang.org/x/crypto/bcrypt.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(120) NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    region        VARCHAR(120) NOT NULL DEFAULT 'Global',
    score         INTEGER      NOT NULL DEFAULT 0,
    banned        BOOLEAN      NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_score ON users (score DESC);

-- ---------------------------------------------------------------------
-- restaurants
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurants (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    stars         SMALLINT     NOT NULL CHECK (stars BETWEEN 1 AND 3),
    country       VARCHAR(120) NOT NULL DEFAULT 'USA',
    city          VARCHAR(120) NOT NULL,
    address       VARCHAR(512),
    cuisine       VARCHAR(120),
    year_awarded  INTEGER,
    price_tier    SMALLINT     NOT NULL DEFAULT 0 CHECK (price_tier BETWEEN 0 AND 3),
    location_lat  DOUBLE PRECISION,
    location_long DOUBLE PRECISION,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_restaurants_stars ON restaurants (stars);
CREATE INDEX IF NOT EXISTS idx_restaurants_city ON restaurants (city);
CREATE INDEX IF NOT EXISTS idx_restaurants_year ON restaurants (year_awarded);

-- ---------------------------------------------------------------------
-- restaurant_hours — structured weekly schedule, one row per restaurant
-- per day of week (0=Sunday..6=Saturday, matching JS's Date.getDay()).
-- open_time/close_time are "HH:MM" 24-hour strings; close_time < open_time
-- means the hours span past midnight.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurant_hours (
    id            BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    is_closed     BOOLEAN NOT NULL DEFAULT false,
    open_time     VARCHAR(5),
    close_time    VARCHAR(5),
    UNIQUE (restaurant_id, day_of_week)
);
CREATE INDEX IF NOT EXISTS idx_restaurant_hours_restaurant ON restaurant_hours (restaurant_id);

-- ---------------------------------------------------------------------
-- nfc_devices — one physical tag per restaurant, used to sign check-ins
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nfc_devices (
    id            BIGSERIAL PRIMARY KEY,
    tag_id        VARCHAR(256) NOT NULL UNIQUE,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    salt          VARCHAR(256) NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nfc_devices_restaurant ON nfc_devices (restaurant_id);

-- ---------------------------------------------------------------------
-- checkins — every verify-checkin attempt (successful or not), used for
-- the passport grid, badge evaluation, leaderboard scoring, and anomaly
-- detection.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkins (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    device_id     BIGINT REFERENCES nfc_devices(id) ON DELETE SET NULL,
    nfc_signature VARCHAR(512),
    verified      BOOLEAN NOT NULL DEFAULT false,
    revoked       BOOLEAN NOT NULL DEFAULT false,
    verified_at   TIMESTAMPTZ,
    location_lat  DOUBLE PRECISION,
    location_long DOUBLE PRECISION,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins (user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_restaurant ON checkins (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user_verified ON checkins (user_id, verified, verified_at);

-- ---------------------------------------------------------------------
-- reviews — one per (user, checkin): postable only against a verified
-- checkin the user owns, so a second visit unlocks a second review slot.
-- checkin_id is nullable only so rows written before this column existed
-- keep loading. Soft-deleted via deleted_at (edit/delete are user-owned,
-- enforced in the API layer).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
    id               BIGSERIAL PRIMARY KEY,
    restaurant_id    BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    checkin_id       BIGINT REFERENCES checkins(id) ON DELETE SET NULL,
    rating           SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment          TEXT NOT NULL,
    food_photo_label VARCHAR(255),
    menu_label       VARCHAR(255),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant ON reviews (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_checkin ON reviews (checkin_id);
CREATE INDEX IF NOT EXISTS idx_reviews_deleted_at ON reviews (deleted_at);

-- ---------------------------------------------------------------------
-- badges — catalog of achievements; unlock rules are evaluated in Go
-- (see backend/badges.go) keyed off `code`.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS badges (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(20) NOT NULL UNIQUE,
    title       VARCHAR(120) NOT NULL,
    category    VARCHAR(40) NOT NULL,
    description VARCHAR(512),
    icon        VARCHAR(16),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_badges (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id    BIGINT NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges (badge_id, unlocked_at);

-- ---------------------------------------------------------------------
-- wishlist_items — "notify me" list on the Tools screen
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wishlist_items (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    restaurant_name VARCHAR(255) NOT NULL,
    note            VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist_items (user_id);

-- ---------------------------------------------------------------------
-- anomalies — flagged by the backend's fraud-detection pass after each
-- checkin attempt; reviewed on the admin Security Dashboard.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anomalies (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    restaurant_id BIGINT REFERENCES restaurants(id) ON DELETE SET NULL,
    device_id     BIGINT REFERENCES nfc_devices(id) ON DELETE SET NULL,
    checkin_id    BIGINT REFERENCES checkins(id) ON DELETE SET NULL,
    description   VARCHAR(512) NOT NULL,
    severity      VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    status        VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'confirmed')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_anomalies_created ON anomalies (created_at DESC);

-- ---------------------------------------------------------------------
-- cities / cuisines — shared picklists behind the admin portal's
-- typeable dropdowns (Restaurant Engine, NFC Inventory filters). Not a
-- foreign key on restaurants — that table keeps plain string columns.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cities (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS cuisines (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------
-- admin_audit_logs — who did what to whom from the admin portal
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    admin_id    BIGINT NOT NULL,
    admin_email VARCHAR(255),
    action      VARCHAR(60) NOT NULL,
    target_type VARCHAR(40),
    target_id   BIGINT,
    detail      VARCHAR(512),
    ip_address  VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON admin_audit_logs (admin_id);

-- =====================================================================
-- Seed data
-- =====================================================================

-- Restaurants — a fictional but geographically realistic Michelin roster
-- spanning 15 cities, matching backend/seed.go's seedRestaurantDefs()
INSERT INTO restaurants (name, stars, country, city, address, cuisine, year_awarded, price_tier, location_lat, location_long)
VALUES
    ('Aurum Table',      3, 'USA',          'Chicago',       '900 N Michigan Ave',    'Contemporary',       2026, 2, 41.8984,  -87.6242),
    ('Celeste Bistro',   2, 'USA',          'New York',      '120 W 57th St',         'French',             2025, 3, 40.7649,  -73.9793),
    ('Miroir Lounge',    1, 'USA',          'San Francisco', '420 Market St',         'Modern Asian',       2026, 2, 37.7936,  -122.3965),
    ('L''Atelier d''Or',  3, 'France',       'Paris',         '5 Avenue Montaigne',    'French',             2026, 3, 48.8656,  2.3036),
    ('Den Tokyo',        2, 'Japan',        'Tokyo',         '1-1 Marunouchi',        'Modern Asian',       2025, 2, 35.6812,  139.7671),
    ('Ember & Oak',      2, 'USA',          'Los Angeles',   '8500 Sunset Blvd',      'Contemporary',       2025, 2, 34.0900,  -118.3856),
    ('Thistle & Thorn',  1, 'UK',           'London',        '14 Berkeley Square',    'Modern British',     2026, 3, 51.5090,  -0.1470),
    ('Jade Pavilion',    2, 'Hong Kong',    'Hong Kong',     '8 Finance St, Central', 'Cantonese',          2025, 3, 22.2830,  114.1580),
    ('Kelapa Rooms',     1, 'Singapore',    'Singapore',     '1 Fullerton Rd',        'Peranakan',          2026, 2, 1.2860,   103.8530),
    ('Nordisk Havn',     2, 'Denmark',      'Copenhagen',    'Nyhavn 15',             'New Nordic',         2025, 3, 55.6800,  12.5900),
    ('Casa Bramido',     1, 'Spain',        'Barcelona',     'Passeig de Gràcia 92',  'Catalan',            2026, 2, 41.3980,  2.1620),
    ('Hanok Gyeol',      2, 'South Korea',  'Seoul',         'Bukchon-ro 37',         'Korean Fine Dining', 2025, 2, 37.5820,  126.9850),
    ('Opal Harbour',     1, 'Australia',    'Sydney',        '1 Circular Quay',       'Modern Australian',  2026, 2, -33.8590, 151.2100),
    ('Kiln & Cedar',     3, 'Japan',        'Kyoto',         'Gion Shijo',            'Kaiseki',            2026, 3, 35.0038,  135.7780),
    ('Osteria Aurelia',  1, 'Italy',        'Rome',          'Via Veneto 42',         'Italian',            2025, 2, 41.9060,  12.4880)
ON CONFLICT DO NOTHING;

-- NFC tags, one per restaurant, matched up by name
INSERT INTO nfc_devices (tag_id, restaurant_id, salt)
SELECT v.tag_id, r.id, v.salt
FROM (VALUES
    ('TAG-STAR-001', 'Aurum Table',     'golden-salt-2026'),
    ('TAG-STAR-002', 'Celeste Bistro',  'ruby-salt-2025'),
    ('TAG-STAR-003', 'Miroir Lounge',   'onyx-salt-2026'),
    ('TAG-STAR-004', 'L''Atelier d''Or','platinum-salt-2026'),
    ('TAG-STAR-005', 'Den Tokyo',       'jade-salt-2025'),
    ('TAG-STAR-006', 'Ember & Oak',     'sunset-salt-2025'),
    ('TAG-STAR-007', 'Thistle & Thorn', 'thorn-salt-2026'),
    ('TAG-STAR-008', 'Jade Pavilion',   'emerald-salt-2025'),
    ('TAG-STAR-009', 'Kelapa Rooms',    'orchid-salt-2026'),
    ('TAG-STAR-010', 'Nordisk Havn',    'harbor-salt-2025'),
    ('TAG-STAR-011', 'Casa Bramido',    'garnet-salt-2026'),
    ('TAG-STAR-012', 'Hanok Gyeol',     'hanbok-salt-2025'),
    ('TAG-STAR-013', 'Opal Harbour',    'coral-salt-2026'),
    ('TAG-STAR-014', 'Kiln & Cedar',    'cedarwood-salt-2026'),
    ('TAG-STAR-015', 'Osteria Aurelia', 'aurelia-salt-2025')
) AS v(tag_id, restaurant_name, salt)
JOIN restaurants r ON r.name = v.restaurant_name
ON CONFLICT (tag_id) DO NOTHING;

-- Default weekly hours (daily 11:00-22:00, unless overridden below) for
-- every seeded restaurant
INSERT INTO restaurant_hours (restaurant_id, day_of_week, is_closed, open_time, close_time)
SELECT r.id, d.day_of_week, false, '11:00', '22:00'
FROM restaurants r
CROSS JOIN generate_series(0, 6) AS d(day_of_week)
WHERE r.name IN (
    'Aurum Table', 'Celeste Bistro', 'Miroir Lounge', 'L''Atelier d''Or', 'Den Tokyo',
    'Jade Pavilion', 'Casa Bramido', 'Opal Harbour'
)
ON CONFLICT (restaurant_id, day_of_week) DO NOTHING;

-- Restaurants with a narrower or later daily window than the 11:00-22:00 default
INSERT INTO restaurant_hours (restaurant_id, day_of_week, is_closed, open_time, close_time)
SELECT r.id, d.day_of_week, false, v.open_time, v.close_time
FROM restaurants r
CROSS JOIN generate_series(0, 6) AS d(day_of_week)
JOIN (VALUES
    ('Ember & Oak',     '11:30', '22:00'),
    ('Thistle & Thorn', '18:00', '23:00'),
    ('Kelapa Rooms',    '11:00', '21:30'),
    ('Nordisk Havn',    '17:30', '22:00'),
    ('Hanok Gyeol',     '11:30', '21:00'),
    ('Kiln & Cedar',    '17:00', '21:30'),
    ('Osteria Aurelia', '12:30', '22:30')
) AS v(restaurant_name, open_time, close_time) ON v.restaurant_name = r.name
ON CONFLICT (restaurant_id, day_of_week) DO NOTHING;

-- Weekly closed days for restaurants that don't open all seven days
-- (0=Sunday..6=Saturday, matching restaurant_hours.day_of_week)
UPDATE restaurant_hours SET is_closed = true, open_time = NULL, close_time = NULL
WHERE day_of_week = 1 AND restaurant_id IN (SELECT id FROM restaurants WHERE name IN ('Ember & Oak', 'Thistle & Thorn', 'Kelapa Rooms', 'Hanok Gyeol'));
UPDATE restaurant_hours SET is_closed = true, open_time = NULL, close_time = NULL
WHERE day_of_week = 0 AND restaurant_id IN (SELECT id FROM restaurants WHERE name IN ('Thistle & Thorn', 'Nordisk Havn', 'Osteria Aurelia'));
UPDATE restaurant_hours SET is_closed = true, open_time = NULL, close_time = NULL
WHERE day_of_week = 3 AND restaurant_id IN (SELECT id FROM restaurants WHERE name = 'Kiln & Cedar');

-- Badge catalog (matches mobile ACHIEVEMENT_BADGES); unlock state is
-- per-user, tracked in user_badges and computed by backend/badges.go
INSERT INTO badges (code, title, category, description, icon)
VALUES
    ('b1', '3-Star Connoisseur', 'Michelin', 'Dined at a 3-star Michelin venue.', '👑'),
    ('b2', 'Chicago Elite',      'Regional', 'Verified 3 restaurants in Chicago.', '🏙️'),
    ('b3', 'NFC Pioneer',        'Social',   'First time using NFC proof-of-dining.', '⚡'),
    ('b4', 'Gourmet Master',     'Social',   'Reached top 3 on the leaderboard.', '🏆'),
    ('b5', 'French Critic',      'Michelin', 'Tried 5 different French contemporary menus.', '🥖'),
    ('b6', 'NY Jetsetter',       'Regional', 'Unlocked a premium New York dining badge.', '🗽'),
    ('b7', 'Star Collector',     'Michelin', 'Accumulated over 10 Michelin stars.', '✨'),
    ('b8', 'First Class Lounge', 'Social',   'Shared your badge wall with 10 friends.', '🥂'),
    ('b9', 'SF Explorer',        'Regional', 'Verified at a San Francisco establishment.', '🌉')
ON CONFLICT (code) DO NOTHING;

-- Cities/cuisines matching the values already used above
INSERT INTO cities (name) VALUES
    ('Chicago'), ('New York'), ('San Francisco'), ('Paris'), ('Tokyo'),
    ('Los Angeles'), ('London'), ('Hong Kong'), ('Singapore'), ('Copenhagen'),
    ('Barcelona'), ('Seoul'), ('Sydney'), ('Kyoto'), ('Rome')
ON CONFLICT (name) DO NOTHING;

INSERT INTO cuisines (name) VALUES
    ('Contemporary'), ('French'), ('Modern Asian'),
    ('Modern British'), ('Cantonese'), ('Peranakan'), ('New Nordic'),
    ('Catalan'), ('Korean Fine Dining'), ('Modern Australian'), ('Kaiseki'), ('Italian')
ON CONFLICT (name) DO NOTHING;

-- Demo + community accounts — password for all is: StarTrack123!
-- (bcrypt hash generated in-database via pgcrypto so this script has no
-- external dependency; verified at login time by Go's bcrypt package,
-- which reads the cost factor out of the hash itself). The community
-- accounts give the leaderboard and follow graph more than one real user;
-- their checkins/reviews/follows are seeded by backend/seed.go instead of
-- here, since that needs application-side scoring/badge logic.
INSERT INTO users (email, password_hash, display_name, role, region)
VALUES
    ('admin@startrack.app',   crypt('StarTrack123!', gen_salt('bf', 10)), 'StarTrack Admin', 'admin', 'Chicago'),
    ('demo@startrack.app',    crypt('StarTrack123!', gen_salt('bf', 10)), 'Laura Liu',        'user',  'Chicago'),
    ('mei.tanaka@startrack.app',    crypt('StarTrack123!', gen_salt('bf', 10)), 'Mei Tanaka',       'user', 'Tokyo'),
    ('julien.moreau@startrack.app', crypt('StarTrack123!', gen_salt('bf', 10)), 'Julien Moreau',    'user', 'Paris'),
    ('sofia.almeida@startrack.app', crypt('StarTrack123!', gen_salt('bf', 10)), 'Sofia Almeida',    'user', 'Barcelona'),
    ('daniel.osei@startrack.app',   crypt('StarTrack123!', gen_salt('bf', 10)), 'Daniel Osei',      'user', 'London'),
    ('priya.nair@startrack.app',    crypt('StarTrack123!', gen_salt('bf', 10)), 'Priya Nair',       'user', 'Singapore'),
    ('marcus.chen@startrack.app',   crypt('StarTrack123!', gen_salt('bf', 10)), 'Marcus Chen',      'user', 'Hong Kong'),
    ('isabella.rossi@startrack.app',crypt('StarTrack123!', gen_salt('bf', 10)), 'Isabella Rossi',   'user', 'Rome'),
    ('noah.becker@startrack.app',   crypt('StarTrack123!', gen_salt('bf', 10)), 'Noah Becker',      'user', 'Copenhagen'),
    ('hana.kim@startrack.app',      crypt('StarTrack123!', gen_salt('bf', 10)), 'Hana Kim',         'user', 'Seoul'),
    ('ethan.walker@startrack.app',  crypt('StarTrack123!', gen_salt('bf', 10)), 'Ethan Walker',     'user', 'Los Angeles'),
    ('grace.thompson@startrack.app',crypt('StarTrack123!', gen_salt('bf', 10)), 'Grace Thompson',   'user', 'Sydney'),
    ('oliver.smith@startrack.app',  crypt('StarTrack123!', gen_salt('bf', 10)), 'Oliver Smith',     'user', 'New York')
ON CONFLICT (email) DO NOTHING;
