package main

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID                     uint       `gorm:"primaryKey" json:"id"`
	Email                  string     `gorm:"size:255;unique;not null" json:"email"`
	PasswordHash           string     `gorm:"size:255;not null" json:"-"`
	DisplayName            string     `gorm:"size:120;not null" json:"display_name"`
	Role                   string     `gorm:"size:20;not null;default:user" json:"role"`
	Region                 string     `gorm:"size:120;default:Global" json:"region"`
	Location               string     `gorm:"size:120" json:"location"`
	Bio                    string     `gorm:"size:500" json:"bio"`
	AvatarURL              string     `gorm:"size:500" json:"avatar_url"`
	Website                string     `gorm:"size:255" json:"website"`
	Instagram              string     `gorm:"size:255" json:"instagram"`
	XHandle                string     `gorm:"size:255" json:"x"`
	FollowersCount         int        `gorm:"-" json:"followers_count"`
	FollowingCount         int        `gorm:"-" json:"following_count"`
	Score                  int        `gorm:"not null;default:0" json:"score"`
	Banned                 bool       `gorm:"not null;default:false" json:"banned"`
	EmailVerified          bool       `gorm:"not null;default:false" json:"email_verified"`
	EmailVerificationToken string     `gorm:"size:255" json:"-"`
	PasswordResetToken     string     `gorm:"size:255" json:"-"`
	PasswordResetExpiresAt *time.Time `json:"password_reset_expires_at,omitempty"`
	CreatedAt              time.Time  `json:"created_at"`
	UpdatedAt              time.Time  `json:"updated_at"`
}

type Follow struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	UserID          uint      `gorm:"not null;index" json:"user_id"`
	FollowingUserID uint      `gorm:"not null;index" json:"following_user_id"`
	CreatedAt       time.Time `json:"created_at"`
}

type Restaurant struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	Name        string `gorm:"size:255;not null" json:"name"`
	Stars       int    `gorm:"not null" json:"stars"`
	Country     string `gorm:"size:120;default:USA" json:"country"`
	City        string `gorm:"size:128;not null" json:"city"`
	Address     string `gorm:"size:512" json:"address"`
	Cuisine     string `gorm:"size:128" json:"cuisine"`
	YearAwarded int    `json:"year_awarded"`
	PhotoURL    string `gorm:"size:500" json:"photo_url"`
	// PriceTier is a 1-3 scale (like Stars) — 💰/💰💰/💰💰💰 — rather than a
	// free-text field, so it's actually comparable/sortable. 0 means unset.
	PriceTier    int       `gorm:"default:0" json:"price_tier"`
	LocationLat  float64   `json:"location_lat"`
	LocationLong float64   `json:"location_long"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`

	// ReservationReleaseDay is the day-of-month (1-31) this restaurant opens
	// its next reservation window, e.g. 1 = "reservations open on the 1st of
	// every month." 0 means no known recurring schedule. Admin-editable via
	// the Restaurant Engine.
	ReservationReleaseDay int `gorm:"default:0" json:"reservation_release_day"`

	// NextReservationRelease is computed fresh on every read from
	// ReservationReleaseDay (see nextReleaseDate) — never stored, so it's
	// always the true next occurrence instead of a value that goes stale
	// the moment this month's release day passes.
	NextReservationRelease *time.Time `gorm:"-" json:"next_reservation_release,omitempty"`

	// ReservationPlatform/ReservationURL link out to wherever this
	// restaurant actually takes online bookings (OpenTable, Resy, its own
	// site, ...) — StarTrack doesn't run its own booking system, it just
	// points guests at the real one. Empty ReservationURL means no known
	// online booking link.
	ReservationPlatform string `gorm:"size:20" json:"reservation_platform"`
	ReservationURL      string `gorm:"size:500" json:"reservation_url"`

	// AverageRating/ReviewCount are computed fresh on every read from this
	// restaurant's Reviews (see hydrateRatings) — never stored, so they can't
	// drift out of sync as reviews are added, edited, or deleted.
	AverageRating *float64 `gorm:"-" json:"average_rating,omitempty"`
	ReviewCount   int      `gorm:"-" json:"review_count"`

	// StarHistory is the actual per-year Michelin tier this restaurant held
	// (see RestaurantStarHistory) — unlike AverageRating, this is a real
	// stored relation, preloaded only where needed (restaurant detail).
	StarHistory []RestaurantStarHistory `gorm:"foreignKey:RestaurantID" json:"star_history,omitempty"`

	// Hours is the structured weekly schedule (see RestaurantHours) —
	// preloaded only where needed (restaurant detail), same as StarHistory.
	Hours []RestaurantHours `gorm:"foreignKey:RestaurantID" json:"hours,omitempty"`

	// IsOpen is computed fresh on every read from Hours (see hydrateIsOpen)
	// — never stored, so it can't go stale. The "is_open" JSON key matches
	// what the mobile client already checks for before falling back to
	// computing it client-side.
	IsOpen *bool `gorm:"-" json:"is_open,omitempty"`
}

// RestaurantStarHistory records the Michelin star tier a restaurant held in
// a given year — restaurants can gain or lose stars across guide editions,
// which the single current Stars/YearAwarded fields on Restaurant can't
// represent by themselves.
type RestaurantStarHistory struct {
	ID           uint `gorm:"primaryKey" json:"id"`
	RestaurantID uint `gorm:"uniqueIndex:idx_restaurant_year;index" json:"restaurant_id"`
	Year         int  `gorm:"uniqueIndex:idx_restaurant_year;not null" json:"year"`
	Stars        int  `gorm:"not null" json:"stars"`
}

// RestaurantHours holds a restaurant's hours for one day of the week.
// DayOfWeek matches JS's Date.getDay() (0=Sunday..6=Saturday), the
// convention the mobile client already uses for "is today" checks.
type RestaurantHours struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	RestaurantID uint   `gorm:"uniqueIndex:idx_restaurant_dow;index" json:"restaurant_id"`
	DayOfWeek    int    `gorm:"uniqueIndex:idx_restaurant_dow;not null" json:"day_of_week"`
	IsClosed     bool   `gorm:"default:false" json:"is_closed"`
	OpenTime     string `gorm:"size:5" json:"open_time"`  // "HH:MM", empty when closed
	CloseTime    string `gorm:"size:5" json:"close_time"` // "HH:MM"; < OpenTime means it spans midnight
}

type NFCDevice struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	TagID        string    `gorm:"size:256;unique;not null" json:"tag_id"`
	RestaurantID uint      `json:"restaurant_id"`
	Salt         string    `gorm:"size:256" json:"salt"`
	Status       string    `gorm:"size:20;not null;default:active" json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type CheckIn struct {
	ID           uint       `gorm:"primaryKey" json:"id"`
	UserID       uint       `gorm:"index" json:"user_id"`
	RestaurantID uint       `gorm:"index" json:"restaurant_id"`
	DeviceID     *uint      `json:"device_id"`
	NFCSignature string     `gorm:"size:512" json:"nfc_signature"`
	Verified     bool       `json:"verified"`
	Revoked      bool       `gorm:"not null;default:false" json:"revoked"`
	VerifiedAt   *time.Time `json:"verified_at"`
	LocationLat  float64    `json:"location_lat"`
	LocationLong float64    `json:"location_long"`
	CreatedAt    time.Time  `json:"created_at"`

	Restaurant Restaurant `gorm:"foreignKey:RestaurantID" json:"restaurant,omitempty"`
}

// TableName pins this model to the `checkins` table defined in
// backend/db/schema.sql. Without this override, GORM's default naming
// strategy maps CheckIn to `check_ins`, which would silently create a
// second, unused table alongside the real one.
func (CheckIn) TableName() string {
	return "checkins"
}

// Review is scoped to a single verified visit (CheckInID): a user gets one
// review per checkin, editable/deletable by them, and a fresh checkin at the
// same restaurant unlocks another review slot. CheckInID is nullable only to
// keep pre-existing rows (created before this field existed) from breaking.
type Review struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	RestaurantID uint           `gorm:"index" json:"restaurant_id"`
	UserID       uint           `gorm:"index" json:"user_id"`
	CheckInID    *uint          `gorm:"column:checkin_id;index" json:"checkin_id"`
	Rating       int            `gorm:"not null" json:"rating"`
	Comment      string         `gorm:"type:text;not null" json:"comment"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`

	Author User `gorm:"foreignKey:UserID" json:"author,omitempty"`
}

// ReviewPhoto is one image attached to a Review. A review can carry any
// number of photos added together at submit time (replaces the old fixed
// food/menu photo slots).
type ReviewPhoto struct {
	ID       uint `gorm:"primaryKey" json:"id"`
	ReviewID uint `gorm:"index" json:"review_id"`
	// text (not size-limited): on native the value is a short imgbb URL or
	// local file:// path, but the web fallback (no expo-file-system support
	// there) hands back a base64 data: URI, which for a real photo is far
	// larger than any reasonable varchar bound.
	URL       string    `gorm:"type:text" json:"url"`
	Label     string    `gorm:"size:255" json:"label"`
	Position  int       `json:"position"`
	CreatedAt time.Time `json:"created_at"`
}

type Badge struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Code        string    `gorm:"size:20;unique;not null" json:"code"`
	Title       string    `gorm:"size:120;not null" json:"title"`
	Category    string    `gorm:"size:40;not null" json:"category"`
	Description string    `gorm:"size:512" json:"description"`
	Icon        string    `gorm:"size:16" json:"icon"`
	CreatedAt   time.Time `json:"created_at"`
}

type UserBadge struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     uint      `gorm:"uniqueIndex:idx_user_badge" json:"user_id"`
	BadgeID    uint      `gorm:"uniqueIndex:idx_user_badge" json:"badge_id"`
	UnlockedAt time.Time `json:"unlocked_at"`
}

type WishlistItem struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	UserID         uint      `gorm:"index" json:"user_id"`
	RestaurantID   *uint     `gorm:"index" json:"restaurant_id,omitempty"`
	RestaurantName string    `gorm:"size:255;not null" json:"restaurant_name"`
	PhotoURL       string    `gorm:"size:500" json:"photo_url"`
	PriceTier      int       `gorm:"default:0" json:"price_tier"`
	OpeningHours   string    `gorm:"size:200" json:"opening_hours"`
	Note           string    `gorm:"size:255" json:"note"`
	CreatedAt      time.Time `json:"created_at"`
}

// ReviewReport keeps a lightweight moderation queue for user-submitted review complaints.
type ReviewReport struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	ReviewID  uint      `gorm:"index" json:"review_id"`
	UserID    uint      `gorm:"index" json:"user_id"`
	Reason    string    `gorm:"size:40;not null" json:"reason"`
	Details   string    `gorm:"size:500" json:"details"`
	Status    string    `gorm:"size:20;not null;default:open" json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// Notification stores in-app reminders and status updates for the user.
// The records are lightweight and durable enough to support a real social-app
// notification center without introducing external email/push infrastructure.
type Notification struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	UserID    uint       `gorm:"index" json:"user_id"`
	Kind      string     `gorm:"size:40;not null;default:info" json:"kind"`
	Title     string     `gorm:"size:120;not null" json:"title"`
	Message   string     `gorm:"size:500;not null" json:"message"`
	ReadAt    *time.Time `json:"read_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

// City and Cuisine back the admin portal's typeable dropdowns for
// Restaurant Engine and NFC Inventory. They're standalone option lists
// (not foreign keys on Restaurant, which keeps its plain string columns)
// so admins can grow the picklist without a migration.
type City struct {
	ID   uint   `gorm:"primaryKey" json:"id"`
	Name string `gorm:"size:120;unique;not null" json:"name"`
}

type Cuisine struct {
	ID   uint   `gorm:"primaryKey" json:"id"`
	Name string `gorm:"size:120;unique;not null" json:"name"`
}

// AdminAuditLog records who did what to whom from the admin portal —
// deletes, bans, manual check-in overrides, device status changes, and
// anomaly resolutions. Write-only from the app's perspective; read via
// GET /api/audit-logs for the Audit Log tab.
type AdminAuditLog struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	AdminID    uint      `gorm:"index" json:"admin_id"`
	AdminEmail string    `gorm:"size:255" json:"admin_email"`
	Action     string    `gorm:"size:60;not null" json:"action"`
	TargetType string    `gorm:"size:40" json:"target_type"`
	TargetID   *uint     `json:"target_id"`
	Detail     string    `gorm:"size:512" json:"detail"`
	IPAddress  string    `gorm:"size:64" json:"ip_address"`
	CreatedAt  time.Time `json:"created_at"`
}

type Anomaly struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       *uint     `json:"user_id"`
	RestaurantID *uint     `json:"restaurant_id"`
	DeviceID     *uint     `json:"device_id"`
	CheckInID    *uint     `json:"checkin_id"`
	Description  string    `gorm:"size:512;not null" json:"description"`
	Severity     string    `gorm:"size:20;not null" json:"severity"`
	Status       string    `gorm:"size:20;not null;default:open" json:"status"`
	CreatedAt    time.Time `json:"created_at"`
}
