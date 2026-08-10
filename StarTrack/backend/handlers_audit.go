package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

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

func listAuditLogsHandler(c *gin.Context) {
	var logs []AdminAuditLog
	db.Order("created_at desc").Limit(200).Find(&logs)
	c.JSON(http.StatusOK, gin.H{"audit_logs": logs})
}
