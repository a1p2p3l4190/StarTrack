package main

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// buildMultipartPhotoRequest builds a POST with a single "photo" file part.
func buildMultipartPhotoRequest(t *testing.T, path, token, filename, contentType string, content []byte) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	partHeader := make(map[string][]string)
	partHeader["Content-Disposition"] = []string{`form-data; name="photo"; filename="` + filename + `"`}
	if contentType != "" {
		partHeader["Content-Type"] = []string{contentType}
	}
	part, err := writer.CreatePart(partHeader)
	if err != nil {
		t.Fatalf("failed to create multipart part: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("failed to write multipart content: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, path, &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req
}

// validPNGBytes returns a tiny real PNG so content-sniffing accepts it.
func validPNGBytes(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{255, 0, 0, 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to encode test png: %v", err)
	}
	return buf.Bytes()
}

func TestUploadRestaurantPhoto_SavesAndServesFile(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	req := buildMultipartPhotoRequest(t, "/api/uploads/photo", adminToken, "spot.png", "image/png", validPNGBytes(t))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		PhotoURL string `json:"photo_url"`
	}
	decodeJSON(t, w, &resp)
	if resp.PhotoURL == "" || !strings.Contains(resp.PhotoURL, "/uploads/") {
		t.Fatalf("expected a /uploads/ photo_url, got %+v", resp)
	}
	if !strings.HasSuffix(resp.PhotoURL, ".png") {
		t.Errorf("expected the sniffed content type to pick a .png extension, got %s", resp.PhotoURL)
	}

	filename := resp.PhotoURL[strings.LastIndex(resp.PhotoURL, "/")+1:]
	savedPath := filepath.Join("uploads", filename)
	defer os.Remove(savedPath)
	if _, err := os.Stat(savedPath); err != nil {
		t.Fatalf("expected file to exist on disk at %s: %v", savedPath, err)
	}

	// The file should actually be servable back out via the static route.
	getReq := httptest.NewRequest(http.MethodGet, "/uploads/"+filename, nil)
	getW := httptest.NewRecorder()
	router.ServeHTTP(getW, getReq)
	if getW.Code != http.StatusOK {
		t.Errorf("expected the uploaded file to be servable, got %d", getW.Code)
	}
}

func TestUploadRestaurantPhoto_RequiresAdmin(t *testing.T) {
	router, _ := newTestApp(t)
	userToken, _ := registerUser(t, router, "user@example.com", "hunter22", "Regular User")

	req := buildMultipartPhotoRequest(t, "/api/uploads/photo", userToken, "spot.png", "image/png", validPNGBytes(t))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for non-admin, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUploadRestaurantPhoto_RejectsOversizedFile(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	oversized := make([]byte, maxPhotoUploadBytes+1)
	req := buildMultipartPhotoRequest(t, "/api/uploads/photo", adminToken, "big.png", "image/png", oversized)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for an oversized file, got %d: %s", w.Code, w.Body.String())
	}
}

// The client-declared filename/Content-Type must never be trusted — this is
// what actually proves the content-sniffing guard works, not just the
// extension check.
func TestUploadRestaurantPhoto_RejectsContentThatIsNotActuallyAnImage(t *testing.T) {
	router, _ := newTestApp(t)
	adminToken, _ := registerAdmin(t, router, "admin@example.com", "hunter22", "Admin")

	fakeImage := []byte("<html><body><script>alert(1)</script></body></html>")
	req := buildMultipartPhotoRequest(t, "/api/uploads/photo", adminToken, "spot.png", "image/png", fakeImage)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for content that isn't really an image, got %d: %s", w.Code, w.Body.String())
	}
}
