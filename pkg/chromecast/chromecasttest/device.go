// Package chromecasttest provides a fake Cast device that runs the Default Media Receiver.
package chromecasttest

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net"
	"strings"
	"sync"
	"time"
)

const (
	appID       = "CC1AD845"
	transportID = "web-1"
	appSession  = "app-session-1"
)

// Message is a request the device received.
type Message struct {
	Destination string
	Namespace   string
	Type        string
	Payload     map[string]interface{}
}

// Device is a fake Cast device. Its media plays in real time once loaded.
type Device struct {
	ln net.Listener

	mu       sync.Mutex
	writeMu  sync.Mutex
	conns    []net.Conn
	received []Message
	// LOAD requests for URLs ending with one of these fail
	failURLs []string

	appRunning bool
	volume     float64
	muted      bool

	mediaSession int
	contentID    string
	duration     float64
	state        string
	idleReason   string
	position     float64
	positionAt   time.Time
}

func NewDevice() (*Device, error) {
	cert, err := selfSignedCert()
	if err != nil {
		return nil, err
	}
	ln, err := tls.Listen("tcp", "127.0.0.1:0", &tls.Config{Certificates: []tls.Certificate{cert}})
	if err != nil {
		return nil, err
	}

	d := &Device{ln: ln, volume: 0.5, state: "IDLE"}
	go d.accept()
	return d, nil
}

func (d *Device) Address() string {
	return d.ln.Addr().String()
}

func (d *Device) Close() error {
	d.mu.Lock()
	for _, c := range d.conns {
		c.Close()
	}
	d.mu.Unlock()
	return d.ln.Close()
}

// FailLoads makes LOAD requests for URLs ending with suffix fail.
func (d *Device) FailLoads(suffix string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.failURLs = append(d.failURLs, suffix)
}

// Received returns the requests of the given type the device has received.
func (d *Device) Received(typ string) []Message {
	d.mu.Lock()
	defer d.mu.Unlock()

	var ret []Message
	for _, m := range d.received {
		if m.Type == typ {
			ret = append(ret, m)
		}
	}
	return ret
}

// Finish ends the media as if it had played to the end.
func (d *Device) Finish() {
	d.mu.Lock()
	d.position = d.duration
	d.state = "IDLE"
	d.idleReason = "FINISHED"
	d.mu.Unlock()
	d.broadcastMedia()
}

// StopApp closes the app as if it had been stopped with the TV's remote.
func (d *Device) StopApp() {
	d.mu.Lock()
	d.appRunning = false
	d.state = "IDLE"
	d.contentID = ""
	d.mu.Unlock()
	d.broadcast(transportID, "urn:x-cast:com.google.cast.tp.connection", map[string]interface{}{"type": "CLOSE"})
	d.broadcastReceiver()
}

// DropConnections closes every sender connection, as if the device had gone off the network.
func (d *Device) DropConnections() {
	d.mu.Lock()
	defer d.mu.Unlock()
	for _, c := range d.conns {
		c.Close()
	}
	d.conns = nil
}

func (d *Device) accept() {
	for {
		c, err := d.ln.Accept()
		if err != nil {
			return
		}
		d.mu.Lock()
		d.conns = append(d.conns, c)
		d.mu.Unlock()
		go d.serve(c)
	}
}

func (d *Device) serve(c net.Conn) {
	defer c.Close()
	for {
		var size [4]byte
		if _, err := io.ReadFull(c, size[:]); err != nil {
			return
		}
		body := make([]byte, binary.BigEndian.Uint32(size[:]))
		if _, err := io.ReadFull(c, body); err != nil {
			return
		}
		src, dst, ns, payload, err := decode(body)
		if err != nil {
			return
		}

		var p map[string]interface{}
		if err := json.Unmarshal([]byte(payload), &p); err != nil {
			return
		}
		typ, _ := p["type"].(string)

		d.mu.Lock()
		d.received = append(d.received, Message{Destination: dst, Namespace: ns, Type: typ, Payload: p})
		d.mu.Unlock()

		d.handle(c, src, dst, ns, typ, p)
	}
}

func (d *Device) handle(c net.Conn, src, dst, ns, typ string, p map[string]interface{}) {
	requestID := p["requestId"]
	switch {
	case ns == "urn:x-cast:com.google.cast.tp.heartbeat" && typ == "PING":
		_ = d.send(c, dst, src, ns, map[string]interface{}{"type": "PONG"})
	case ns == "urn:x-cast:com.google.cast.receiver":
		switch typ {
		case "LAUNCH":
			d.mu.Lock()
			d.appRunning = true
			d.mu.Unlock()
		case "STOP":
			d.StopApp()
			return
		case "SET_VOLUME":
			v, _ := p["volume"].(map[string]interface{})
			d.mu.Lock()
			if level, ok := v["level"].(float64); ok {
				d.volume = level
			}
			if muted, ok := v["muted"].(bool); ok {
				d.muted = muted
			}
			d.mu.Unlock()
			d.broadcastReceiver()
			return
		}
		_ = d.send(c, "receiver-0", src, ns, d.receiverStatus(requestID))
	case ns == "urn:x-cast:com.google.cast.media" && dst == transportID:
		d.handleMedia(c, src, typ, p, requestID)
	}
}

func (d *Device) handleMedia(c net.Conn, src, typ string, p map[string]interface{}, requestID interface{}) {
	const ns = "urn:x-cast:com.google.cast.media"

	d.mu.Lock()
	switch typ {
	case "LOAD":
		media, _ := p["media"].(map[string]interface{})
		url, _ := media["contentId"].(string)
		for _, f := range d.failURLs {
			if strings.HasSuffix(url, f) {
				d.mu.Unlock()
				_ = d.send(c, transportID, src, ns, map[string]interface{}{"type": "LOAD_FAILED", "requestId": requestID})
				return
			}
		}
		d.mediaSession++
		d.contentID = url
		d.duration = 600
		d.position, _ = p["currentTime"].(float64)
		d.positionAt = time.Now()
		d.state = "PLAYING"
		d.idleReason = ""
	case "PLAY":
		d.position = d.currentPosition()
		d.positionAt = time.Now()
		d.state = "PLAYING"
	case "PAUSE":
		d.position = d.currentPosition()
		d.state = "PAUSED"
	case "STOP":
		d.position = d.currentPosition()
		d.state = "IDLE"
		d.idleReason = "CANCELLED"
	case "SEEK":
		d.position, _ = p["currentTime"].(float64)
		d.positionAt = time.Now()
	}
	d.mu.Unlock()

	if typ == "GET_STATUS" {
		_ = d.send(c, transportID, src, ns, d.mediaStatus(requestID))
		return
	}
	d.broadcastMedia()
}

func (d *Device) currentPosition() float64 {
	if d.state != "PLAYING" {
		return d.position
	}
	return d.position + time.Since(d.positionAt).Seconds()
}

func (d *Device) receiverStatus(requestID interface{}) map[string]interface{} {
	d.mu.Lock()
	defer d.mu.Unlock()

	apps := []map[string]interface{}{}
	if d.appRunning {
		apps = append(apps, map[string]interface{}{
			"appId":       appID,
			"displayName": "Default Media Receiver",
			"sessionId":   appSession,
			"transportId": transportID,
		})
	}
	return map[string]interface{}{
		"type":      "RECEIVER_STATUS",
		"requestId": requestID,
		"status": map[string]interface{}{
			"applications": apps,
			"volume":       map[string]interface{}{"level": d.volume, "muted": d.muted},
		},
	}
}

func (d *Device) mediaStatus(requestID interface{}) map[string]interface{} {
	d.mu.Lock()
	defer d.mu.Unlock()

	status := []map[string]interface{}{}
	if d.contentID != "" {
		s := map[string]interface{}{
			"mediaSessionId": d.mediaSession,
			"playerState":    d.state,
			"currentTime":    d.currentPosition(),
			"media": map[string]interface{}{
				"contentId":   d.contentID,
				"contentType": "video/mp4",
				"streamType":  "BUFFERED",
				"duration":    d.duration,
			},
		}
		if d.idleReason != "" {
			s["idleReason"] = d.idleReason
		}
		status = append(status, s)
	}
	return map[string]interface{}{"type": "MEDIA_STATUS", "requestId": requestID, "status": status}
}

func (d *Device) broadcastReceiver() {
	d.broadcast("receiver-0", "urn:x-cast:com.google.cast.receiver", d.receiverStatus(0))
}

func (d *Device) broadcastMedia() {
	d.broadcast(transportID, "urn:x-cast:com.google.cast.media", d.mediaStatus(0))
}

func (d *Device) broadcast(src, ns string, payload map[string]interface{}) {
	d.mu.Lock()
	conns := append([]net.Conn(nil), d.conns...)
	d.mu.Unlock()
	for _, c := range conns {
		_ = d.send(c, src, "*", ns, payload)
	}
}

func (d *Device) send(c net.Conn, src, dst, ns string, payload map[string]interface{}) error {
	d.writeMu.Lock()
	defer d.writeMu.Unlock()

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	msg := encode(src, dst, ns, string(body))
	buf := make([]byte, 4, 4+len(msg))
	binary.BigEndian.PutUint32(buf, uint32(len(msg)))
	_, err = c.Write(append(buf, msg...))
	return err
}

// encode and decode are a separate implementation of the CastMessage protobuf, so the tests don't only check pkg/chromecast against itself.
func encode(src, dst, ns, payload string) []byte {
	var b []byte
	field := func(n int, s string) {
		b = binary.AppendUvarint(b, uint64(n<<3|2))
		b = binary.AppendUvarint(b, uint64(len(s)))
		b = append(b, s...)
	}
	b = append(b, 1<<3, 0)
	field(2, src)
	field(3, dst)
	field(4, ns)
	b = append(b, 5<<3, 0)
	field(6, payload)
	return b
}

func decode(b []byte) (src, dst, ns, payload string, err error) {
	fields := map[uint64]string{}
	for len(b) > 0 {
		tag, n := binary.Uvarint(b)
		if n <= 0 {
			return "", "", "", "", fmt.Errorf("bad tag")
		}
		b = b[n:]
		switch tag & 7 {
		case 0:
			_, n = binary.Uvarint(b)
			b = b[n:]
		case 2:
			l, n := binary.Uvarint(b)
			fields[tag>>3] = string(b[n : n+int(l)])
			b = b[n+int(l):]
		default:
			return "", "", "", "", fmt.Errorf("unexpected wire type %d", tag&7)
		}
	}
	return fields[2], fields[3], fields[4], fields[6], nil
}

func selfSignedCert() (tls.Certificate, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, err
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(24 * time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return tls.Certificate{}, err
	}
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key}, nil
}
