package utils

import (
	"net"
	"testing"
)

func TestShouldAdvertiseIP(t *testing.T) {
	t.Parallel()

	cases := []struct {
		ip   string
		want bool
	}{
		{"192.168.22.22", true},
		{"10.0.0.1", true},
		{"172.16.1.1", true},
		{"8.8.8.8", true},
		{"127.0.0.1", false},
		{"0.0.0.0", false},
		{"169.254.1.1", false},
		{"::1", false},
		{"fe80::1", false},
	}

	for _, tc := range cases {
		t.Run(tc.ip, func(t *testing.T) {
			t.Parallel()
			got := ShouldAdvertiseIP(net.ParseIP(tc.ip))
			if got != tc.want {
				t.Fatalf("ShouldAdvertiseIP(%s) = %v, want %v", tc.ip, got, tc.want)
			}
		})
	}
}

func TestLocalIPv4sExcludesLoopback(t *testing.T) {
	t.Parallel()

	for _, ip := range LocalIPv4s() {
		parsed := net.ParseIP(ip)
		if parsed == nil || !ShouldAdvertiseIP(parsed) {
			t.Fatalf("LocalIPv4s returned non-advertisable address %q", ip)
		}
	}
}
