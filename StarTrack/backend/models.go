package main

import "time"

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Email        string    `gorm:"size:255;unique;not null" json:"email"`
	PasswordHash string    `gorm:"size:255;not null" json:"-"`
	DisplayName  string    `gorm:"size:120;not null" json:"display_name"`
	Role         string    `gorm:"size:20;not null;default:user" json:"role"`
	Region       string    `gorm:"size:120;default:Global" json:"region"`
	Score        int       `gorm:"not null;default:0" json:"score"`
	Banned       bool      `gorm:"not null;default:false" json:"banned"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Restaurant struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Name         string    `gorm:"size:255;not null" json:"name"`
	Stars        int       `gorm:"not null" json:"stars"`
	Country      string    `gorm:"size:120;default:USA" json:"country"`
	City         string    `gorm:"size:128;not null" json:"city"`
	Address      string    `gorm:"size:512" json:"address"`
	Cuisine      string    `gorm:"size:128" json:"cuisine"`
	YearAwarded  int       `json:"year_awarded"`
	LocationLat  float64   `json:"location_lat"`
	LocationLong float64   `json:"location_long"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
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

type Review struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	RestaurantID   uint      `gorm:"index" json:"restaurant_id"`
	UserID         uint      `gorm:"index" json:"user_id"`
	Rating         int       `gorm:"not null" json:"rating"`
	Comment        string    `gorm:"type:text;not null" json:"comment"`
	FoodPhotoLabel string    `gorm:"size:255" json:"food_photo_label"`
	MenuLabel      string    `gorm:"size:255" json:"menu_label"`
	CreatedAt      time.Time `json:"created_at"`

	Author User `gorm:"foreignKey:UserID" json:"author,omitempty"`
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
	RestaurantName string    `gorm:"size:255;not null" json:"restaurant_name"`
	Note           string    `gorm:"size:255" json:"note"`
	CreatedAt      time.Time `json:"created_at"`
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
