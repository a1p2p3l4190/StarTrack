package main

import (
	"fmt"
	"log"
	"net/smtp"
)

// sendEmail delivers a plain-text email via SMTP when cfg.SMTPHost is
// configured. This dev/course-project environment has no mail account
// provisioned, so with SMTPHost unset it logs the message to stdout instead
// of failing outright — the caller (e.g. forgotPasswordHandler) never
// exposes the message contents back to the HTTP response either way, so
// this fallback doesn't reopen the "token leaked in the API response"
// problem it exists to close.
func sendEmail(cfg *Config, to, subject, body string) error {
	if cfg.SMTPHost == "" {
		log.Printf("[email:dev-fallback] to=%s subject=%q\n%s", to, subject, body)
		return nil
	}

	addr := fmt.Sprintf("%s:%s", cfg.SMTPHost, cfg.SMTPPort)
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s\r\n", cfg.SMTPFrom, to, subject, body)

	var auth smtp.Auth
	if cfg.SMTPUsername != "" {
		auth = smtp.PlainAuth("", cfg.SMTPUsername, cfg.SMTPPassword, cfg.SMTPHost)
	}
	return smtp.SendMail(addr, auth, cfg.SMTPFrom, []string{to}, []byte(msg))
}

func passwordResetEmailBody(token string) string {
	return fmt.Sprintf(
		"We received a request to reset your StarTrack password.\n\n"+
			"Enter this code in the app's \"Reset Password\" screen:\n\n    %s\n\n"+
			"This code expires in 30 minutes. If you didn't request this, you can safely ignore this email.",
		token,
	)
}

func emailVerificationBody(token string) string {
	return fmt.Sprintf(
		"Welcome to StarTrack! Verify your email with this code:\n\n    %s\n\n"+
			"If you didn't create a StarTrack account, you can safely ignore this email.",
		token,
	)
}
