package chromecast

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"net"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

const (
	dialTimeout  = 5 * time.Second
	pingInterval = 5 * time.Second
	// devices that stop answering pings are treated as gone
	readTimeout = 3 * pingInterval
)

// Conn is a connection to a Cast device.
type Conn struct {
	conn      net.Conn
	requestID atomic.Int64

	writeMu sync.Mutex
	closed  chan struct{}
	once    sync.Once
}

// Dial connects to the Cast device at address and asks for its status. The port defaults to DefaultPort.
func Dial(ctx context.Context, address string) (*Conn, error) {
	d := tls.Dialer{
		NetDialer: &net.Dialer{Timeout: dialTimeout},
		// devices present certificates signed by Google's device CA, which no sender checks
		Config: &tls.Config{InsecureSkipVerify: true},
	}
	nc, err := d.DialContext(ctx, "tcp", NormalizeAddress(address))
	if err != nil {
		return nil, err
	}

	c := &Conn{
		conn:   nc,
		closed: make(chan struct{}),
	}

	if err := c.Connect(receiverID); err != nil {
		nc.Close()
		return nil, err
	}
	if err := c.GetReceiverStatus(); err != nil {
		nc.Close()
		return nil, err
	}

	return c, nil
}

// NormalizeAddress adds the default port to address if it has none.
func NormalizeAddress(address string) string {
	if _, _, err := net.SplitHostPort(address); err == nil {
		return address
	}
	return net.JoinHostPort(address, strconv.Itoa(DefaultPort))
}

// LocalIP returns the address this side of the connection uses, which the device can reach.
func (c *Conn) LocalIP() net.IP {
	if addr, ok := c.conn.LocalAddr().(*net.TCPAddr); ok {
		return addr.IP
	}
	return nil
}

// Run reads messages from the device and passes the ones decodeMessage knows to handle until the connection closes. It returns nil if Close was called.
func (c *Conn) Run(handle func(msg interface{})) error {
	go c.keepAlive()

	for {
		if err := c.conn.SetReadDeadline(time.Now().Add(readTimeout)); err != nil {
			return c.runError(err)
		}

		m, err := readMessage(c.conn)
		if err != nil {
			return c.runError(err)
		}

		if m.Namespace == nsHeartbeat {
			var h header
			if json.Unmarshal([]byte(m.Payload), &h) == nil && h.Type == "PING" {
				if err := c.sendTo(m.SourceID, nsHeartbeat, header{Type: "PONG"}); err != nil {
					return c.runError(err)
				}
			}
			continue
		}

		msg, err := decodeMessage(m)
		if err != nil {
			// one bad message isn't a reason to drop the device
			continue
		}
		if msg != nil {
			handle(msg)
		}
	}
}

func (c *Conn) runError(err error) error {
	select {
	case <-c.closed:
		return nil
	default:
	}

	c.Close()
	return err
}

func (c *Conn) keepAlive() {
	t := time.NewTicker(pingInterval)
	defer t.Stop()

	for {
		select {
		case <-c.closed:
			return
		case <-t.C:
			if err := c.sendTo(receiverID, nsHeartbeat, header{Type: "PING"}); err != nil {
				return
			}
		}
	}
}

// NewRequestID returns an ID for a request, which the device includes in its reply.
func (c *Conn) NewRequestID() int {
	return int(c.requestID.Add(1))
}

func (c *Conn) sendTo(destination, namespace string, payload interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	if err := c.conn.SetWriteDeadline(time.Now().Add(dialTimeout)); err != nil {
		return err
	}
	return writeMessage(c.conn, castMessage{
		SourceID:      senderID,
		DestinationID: destination,
		Namespace:     namespace,
		Payload:       string(body),
	})
}

func (c *Conn) request(typ string) header {
	return header{Type: typ, RequestID: c.NewRequestID()}
}

// Connect opens a virtual connection to destination, which is the device itself or the transport ID of a running app.
func (c *Conn) Connect(destination string) error {
	return c.sendTo(destination, nsConnection, header{Type: "CONNECT"})
}

func (c *Conn) GetReceiverStatus() error {
	return c.sendTo(receiverID, nsReceiver, c.request("GET_STATUS"))
}

// Launch starts an app, replacing whatever the device is running. The device answers with a ReceiverStatus that includes it.
func (c *Conn) Launch(appID string) error {
	return c.sendTo(receiverID, nsReceiver, launchRequest{header: c.request("LAUNCH"), AppID: appID})
}

// StopApp closes the app with the given session ID, returning the device to its idle screen.
func (c *Conn) StopApp(sessionID string) error {
	return c.sendTo(receiverID, nsReceiver, stopAppRequest{header: c.request("STOP"), SessionID: sessionID})
}

// SetVolume sets the device volume, from 0 to 1.
func (c *Conn) SetVolume(level float64) error {
	return c.sendTo(receiverID, nsReceiver, setVolumeRequest{header: c.request("SET_VOLUME"), Volume: Volume{Level: &level}})
}

func (c *Conn) SetMuted(muted bool) error {
	return c.sendTo(receiverID, nsReceiver, setVolumeRequest{header: c.request("SET_VOLUME"), Volume: Volume{Muted: &muted}})
}

// Load asks the app at transportID to play req. The app answers with a MediaStatusMessage, or an ErrorMessage with requestID if it can't.
func (c *Conn) Load(transportID string, requestID int, req LoadRequest) error {
	return c.sendTo(transportID, nsMedia, loadRequest{header: header{Type: "LOAD", RequestID: requestID}, LoadRequest: req})
}

func (c *Conn) GetMediaStatus(transportID string) error {
	return c.sendTo(transportID, nsMedia, c.request("GET_STATUS"))
}

func (c *Conn) Play(transportID string, mediaSessionID int) error {
	return c.sendTo(transportID, nsMedia, mediaRequest{header: c.request("PLAY"), MediaSessionID: mediaSessionID})
}

func (c *Conn) Pause(transportID string, mediaSessionID int) error {
	return c.sendTo(transportID, nsMedia, mediaRequest{header: c.request("PAUSE"), MediaSessionID: mediaSessionID})
}

// StopMedia stops playback, leaving the app open.
func (c *Conn) StopMedia(transportID string, mediaSessionID int) error {
	return c.sendTo(transportID, nsMedia, mediaRequest{header: c.request("STOP"), MediaSessionID: mediaSessionID})
}

func (c *Conn) Seek(transportID string, mediaSessionID int, seconds float64) error {
	return c.sendTo(transportID, nsMedia, mediaRequest{header: c.request("SEEK"), MediaSessionID: mediaSessionID, CurrentTime: &seconds})
}

func (c *Conn) Close() error {
	var err error
	c.once.Do(func() {
		close(c.closed)
		err = c.conn.Close()
	})
	return err
}
