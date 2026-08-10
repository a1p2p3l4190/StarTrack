package main

import (
	"fmt"
	"net/http"
	"testing"
)

func TestAuditLogs_RecordsAndListsBanUser(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, adminID := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")
	_, userID := registerUser(t, router, "laura@example.com", "hunter22", "Laura Liu")

	doRequest(t, router, http.MethodPost, fmt.Sprintf("/api/users/%d/ban", userID), adminToken, nil)

	w := doRequest(t, router, http.MethodGet, "/api/audit-logs", adminToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		AuditLogs []AdminAuditLog `json:"audit_logs"`
	}
	decodeJSON(t, w, &resp)
	if len(resp.AuditLogs) != 1 {
		t.Fatalf("expected exactly one audit log entry, got %d", len(resp.AuditLogs))
	}
	entry := resp.AuditLogs[0]
	if entry.Action != "BAN_USER" {
		t.Errorf("expected action=BAN_USER, got %q", entry.Action)
	}
	if entry.AdminID != adminID {
		t.Errorf("expected admin_id=%d, got %d", adminID, entry.AdminID)
	}
	if entry.AdminEmail != "admin@example.com" {
		t.Errorf("expected admin_email=admin@example.com, got %q", entry.AdminEmail)
	}
	if entry.TargetID == nil || *entry.TargetID != userID {
		t.Errorf("expected target_id=%d, got %+v", userID, entry.TargetID)
	}
}

func TestAuditLogs_RequiresAdmin(t *testing.T) {
	router, _ := newTestApp(t)
	userToken, _ := registerUser(t, router, "user@example.com", "hunter22", "Regular User")

	w := doRequest(t, router, http.MethodGet, "/api/audit-logs", userToken, nil)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for non-admin, got %d: %s", w.Code, w.Body.String())
	}
}
