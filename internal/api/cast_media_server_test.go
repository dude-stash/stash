package api

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stashapp/stash/internal/manager/config"
	"github.com/stashapp/stash/pkg/signedurl"
)

func freePort(t *testing.T) int {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close()
	return port
}

func occupy(t *testing.T) int {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	return ln.Addr().(*net.TCPAddr).Port
}

func startCastMedia(t *testing.T, port, defaultPort int) (*castMediaServer, int, error) {
	s := newCastMediaServer("127.0.0.1", port, defaultPort, http.NotFoundHandler())
	t.Cleanup(func() { _ = s.Shutdown(context.Background()) })
	got, err := s.Port()
	return s, got, err
}

func TestCastMediaServerDefaultPort(t *testing.T) {
	want := freePort(t)
	s, got, err := startCastMedia(t, 0, want)
	if err != nil || got != want {
		t.Fatalf("Port() = %d, %v, want the default port %d", got, err, want)
	}
	if again, _ := s.Port(); again != got {
		t.Errorf("second Port() = %d, want the running server's %d", again, got)
	}
}

func TestCastMediaServerDefaultPortTaken(t *testing.T) {
	taken := occupy(t)
	_, got, err := startCastMedia(t, 0, taken)
	if err != nil || got == 0 || got == taken {
		t.Errorf("Port() = %d, %v, want another free port", got, err)
	}
}

func TestSignedOnly(t *testing.T) {
	c := config.InitializeEmpty()
	handler := signedOnly(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	status := func(target string, header http.Header) int {
		req := httptest.NewRequest(http.MethodGet, target, nil)
		for k, v := range header {
			req.Header[k] = v
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec.Code
	}

	// without a login, the main server's checks are left to decide
	if got := status("/scene/1/stream", nil); got != http.StatusOK {
		t.Errorf("without a login: %d, want the request passed on", got)
	}

	c.SetInterface(config.Username, "user")
	c.SetInterface(config.Password, "hash")

	signed := "/scene/1/stream?" + signedParams(c, "user", "/scene/1/stream").Encode()
	expired := url.Values{}
	for k, v := range signedParams(c, "user", "/scene/1/stream") {
		expired[k] = v
	}
	expired.Set(signedurl.ExpiresParam, strconv.FormatInt(time.Now().Add(-time.Minute).Unix(), 10))

	for _, tc := range []struct {
		name   string
		target string
		header http.Header
		want   int
	}{
		{"unsigned", "/scene/1/stream", nil, http.StatusUnauthorized},
		{"session cookie", "/scene/1/stream", http.Header{"Cookie": {"session=abc"}}, http.StatusUnauthorized},
		{"API key", "/scene/1/stream", http.Header{"Apikey": {"key"}}, http.StatusUnauthorized},
		{"signed", signed, nil, http.StatusOK},
		{"signed for another scene", strings.Replace(signed, "/scene/1/", "/scene/2/", 1), nil, http.StatusUnauthorized},
		{"expired", "/scene/1/stream?" + expired.Encode(), nil, http.StatusUnauthorized},
	} {
		if got := status(tc.target, tc.header); got != tc.want {
			t.Errorf("%s: %d, want %d", tc.name, got, tc.want)
		}
	}
}

func TestCastMediaServerConfiguredPortTaken(t *testing.T) {
	taken := occupy(t)
	if _, got, err := startCastMedia(t, taken, 0); err == nil {
		t.Errorf("Port() = %d, want an error for the configured port being in use", got)
	}
}
