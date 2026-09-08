package utils

import "net"

// ShouldAdvertiseIP reports whether ip is a unicast IPv4 address that other
// devices on the LAN can reasonably reach. Loopback, unspecified, and
// link-local addresses are excluded.
func ShouldAdvertiseIP(ip net.IP) bool {
	ip4 := ip.To4()
	if ip4 == nil {
		return false
	}
	if ip4.IsLoopback() || ip4.IsUnspecified() || ip4.IsLinkLocalUnicast() {
		return false
	}
	return true
}

func preferredOutboundIPv4() net.IP {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return nil
	}
	defer conn.Close()

	addr, ok := conn.LocalAddr().(*net.UDPAddr)
	if !ok || addr == nil {
		return nil
	}
	return addr.IP
}

// LocalIPv4s returns this host's reachable IPv4 addresses, excluding loopback
// and link-local. The preferred outbound address (the one used to reach the
// internet) is listed first when it is a private LAN address.
func LocalIPv4s() []string {
	seen := make(map[string]struct{})
	ips := make([]string, 0)

	add := func(ip net.IP) {
		if !ShouldAdvertiseIP(ip) {
			return
		}
		s := ip.To4().String()
		if _, ok := seen[s]; ok {
			return
		}
		seen[s] = struct{}{}
		ips = append(ips, s)
	}

	add(preferredOutboundIPv4())

	ifaces, err := net.Interfaces()
	if err != nil {
		return ips
	}

	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			add(ip)
		}
	}

	return ips
}
