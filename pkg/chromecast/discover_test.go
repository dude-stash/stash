package chromecast

import (
	"net"
	"testing"

	"github.com/hashicorp/mdns"
)

func TestDeviceFromEntry(t *testing.T) {
	entry := func(name string, port int, fields ...string) *mdns.ServiceEntry {
		return &mdns.ServiceEntry{
			Name:       name + "._googlecast._tcp.local.",
			AddrV4:     net.ParseIP("192.168.1.5"),
			Port:       port,
			InfoFields: fields,
		}
	}

	d, ok := deviceFromEntry(entry("Chromecast-6e6a", 8009, "md=Chromecast", "fn=Living Room TV", "ca=463365"))
	if !ok || d.Name != "Living Room TV" || d.Model != "Chromecast" || d.Address != "192.168.1.5:8009" {
		t.Errorf("Chromecast = %+v, %v", d, ok)
	}

	for _, e := range []*mdns.ServiceEntry{
		entry("Google-Nest-Mini-5ebb", 8009, "md=Google Nest Mini", "fn=Kitchen speaker", "ca=198660"),
		entry("Google-Cast-Group-85FB", 32207, "md=Google Cast Group", "fn=everywhere", "ca=199204"),
		{Name: "printer._ipp._tcp.local.", AddrV4: net.ParseIP("192.168.1.9"), Port: 631},
	} {
		if d, ok := deviceFromEntry(e); ok {
			t.Errorf("listed %+v, which can't play video", d)
		}
	}

	// devices without a friendly name or capabilities are listed under their instance name
	d, ok = deviceFromEntry(entry("Chromecast-1a2b", 8009))
	if !ok || d.Name != "Chromecast-1a2b" {
		t.Errorf("unnamed device = %+v, %v", d, ok)
	}
}
