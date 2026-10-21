package api

import (
	"context"
	"net"
	"net/http"
	"testing"
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

func TestCastMediaServerConfiguredPortTaken(t *testing.T) {
	taken := occupy(t)
	if _, got, err := startCastMedia(t, taken, 0); err == nil {
		t.Errorf("Port() = %d, want an error for the configured port being in use", got)
	}
}
