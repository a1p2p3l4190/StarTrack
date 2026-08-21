package main

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// auditSortColumns whitelists which columns the admin portal's Audit Log
// table may sort by — never interpolate c.Query("sort") directly into SQL.
var auditSortColumns = map[string]string{
	"created_at":  "created_at",
	"action":      "action",
	"admin_email": "admin_email",
	"target_type": "target_type",
}

// targetIDFromParam converts a route param like c.Param("id") into a *uint
// for AdminAuditLog.TargetID, or nil if it's not a valid integer.
func targetIDFromParam(idStr string) *uint {
	n, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		return nil
	}
	v := uint(n)
	return &v
}

// logAuditEvent records a sensitive admin action. Best-effort: a logging
// failure never blocks the action it's describing, so errors are swallowed
// rather than surfaced to the caller.
func logAuditEvent(c *gin.Context, action, targetType string, targetID *uint, detail string) {
	adminID := currentUserID(c)
	var admin User
	email := ""
	if db.First(&admin, adminID).Error == nil {
		email = admin.Email
	}
	db.Create(&AdminAuditLog{
		AdminID:    adminID,
		AdminEmail: email,
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
		Detail:     detail,
		IPAddress:  c.ClientIP(),
	})
}

// listAuditLogsHandler always paginates — the admin portal is its only
// caller, so unlike listUsersHandler/listRestaurantsHandler there's no
// other consumer relying on a full unpaginated dump.
func listAuditLogsHandler(c *gin.Context) {
	var logs []AdminAuditLog
	query := db.Model(&AdminAuditLog{})

	if q := c.Query("search"); q != "" {
		like := "%" + strings.ToLower(q) + "%"
		query = query.Where("LOWER(admin_email) LIKE ? OR LOWER(action) LIKE ? OR LOWER(target_type) LIKE ? OR LOWER(detail) LIKE ?", like, like, like, like)
	}

	column, ok := auditSortColumns[c.Query("sort")]
	if !ok {
		column = "created_at"
	}
	direction := "desc"
	if c.Query("order") == "asc" {
		direction = "asc"
	}
	query = query.Order(column + " " + direction)

	limit, err := strconv.Atoi(c.Query("limit"))
	if err != nil || limit <= 0 || limit > 200 {
		limit = 50
	}
	page, err := strconv.Atoi(c.Query("page"))
	if err != nil || page <= 0 {
		page = 1
	}

	var total int64
	query.Count(&total)
	query.Offset((page - 1) * limit).Limit(limit).Find(&logs)

	meta := &Metadata{Pagination: &PaginationMeta{Page: page, Limit: limit, Total: int(total)}}
	RespondSuccessWithMeta(c, http.StatusOK, map[string]interface{}{"audit_logs": logs}, meta)
}
