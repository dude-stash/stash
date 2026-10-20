package chromecast

import (
	"context"
	"io"
	"log"
	"net"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/hashicorp/mdns"
)

const serviceType = "_googlecast._tcp"

type Device struct {
	Name string
	// Model is the kind of device, such as "Chromecast" or "Google Cast Group".
	Model   string
	Address string
}

// Discover looks for Cast devices advertised over mDNS on the local network for the given duration. Devices miss some queries, so one may not be found every time.
func Discover(ctx context.Context, timeout time.Duration) ([]Device, error) {
	entries := make(chan *mdns.ServiceEntry, 16)
	found := make(map[string]Device)
	done := make(chan struct{})

	go func() {
		defer close(done)
		for e := range entries {
			d, ok := deviceFromEntry(e)
			if ok {
				found[d.Address] = d
			}
		}
	}()

	err := mdns.QueryContext(ctx, &mdns.QueryParam{
		Service:             serviceType,
		Domain:              "local",
		Timeout:             timeout,
		Entries:             entries,
		DisableIPv6:         true,
		WantUnicastResponse: true,
		Logger:              log.New(io.Discard, "", 0),
	})
	close(entries)
	<-done

	if err != nil {
		return nil, err
	}

	ret := make([]Device, 0, len(found))
	for _, d := range found {
		ret = append(ret, d)
	}
	sort.Slice(ret, func(i, j int) bool {
		return ret[i].Name < ret[j].Name
	})

	return ret, nil
}

func deviceFromEntry(e *mdns.ServiceEntry) (Device, bool) {
	// mdns passes on every service it hears about, not only the ones queried for
	suffix := "." + serviceType + ".local."
	if e.AddrV4 == nil || e.Port == 0 || !strings.HasSuffix(e.Name, suffix) {
		return Device{}, false
	}

	d := Device{
		Address: net.JoinHostPort(e.AddrV4.String(), strconv.Itoa(e.Port)),
	}
	for _, field := range e.InfoFields {
		key, value, _ := strings.Cut(field, "=")
		switch key {
		case "fn":
			d.Name = value
		case "md":
			d.Model = value
		}
	}
	if d.Name == "" {
		// the instance name is the model and an ID, such as "Chromecast-1a2b…"
		d.Name = strings.ReplaceAll(strings.TrimSuffix(e.Name, suffix), `\`, "")
	}

	return d, true
}
