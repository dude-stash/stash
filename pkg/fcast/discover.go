package fcast

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

const serviceType = "_fcast._tcp"

type Receiver struct {
	Name    string
	Address string
}

// Discover looks for receivers advertised over mDNS on the local network for the given duration. Receivers miss some queries, so one may not be found every time.
func Discover(ctx context.Context, timeout time.Duration) ([]Receiver, error) {
	entries := make(chan *mdns.ServiceEntry, 16)
	found := make(map[string]Receiver)
	done := make(chan struct{})

	go func() {
		defer close(done)
		for e := range entries {
			r, ok := receiverFromEntry(e)
			if ok {
				found[r.Address] = r
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

	ret := make([]Receiver, 0, len(found))
	for _, r := range found {
		ret = append(ret, r)
	}
	sort.Slice(ret, func(i, j int) bool {
		return ret[i].Name < ret[j].Name
	})

	return ret, nil
}

func receiverFromEntry(e *mdns.ServiceEntry) (Receiver, bool) {
	// mdns passes on every service it hears about, not only the ones queried for
	suffix := "." + serviceType + ".local."
	if e.AddrV4 == nil || e.Port == 0 || !strings.HasSuffix(e.Name, suffix) {
		return Receiver{}, false
	}

	name := strings.ReplaceAll(strings.TrimSuffix(e.Name, suffix), `\`, "")

	return Receiver{
		Name:    name,
		Address: net.JoinHostPort(e.AddrV4.String(), strconv.Itoa(e.Port)),
	}, true
}
