package fcast

import (
	"context"
	"net"
	"strconv"
	"sync"
	"time"
)

const (
	dialTimeout  = 5 * time.Second
	pingInterval = 10 * time.Second
	// receivers that stop answering pings are treated as gone
	readTimeout = 3 * pingInterval
)

// Conn is a connection to an FCast receiver.
type Conn struct {
	conn net.Conn

	writeMu sync.Mutex
	closed  chan struct{}
	once    sync.Once
}

// Dial connects to the receiver at address and introduces sender to it. The port defaults to DefaultPort.
func Dial(ctx context.Context, address string, sender InitialMessage) (*Conn, error) {
	d := net.Dialer{Timeout: dialTimeout}
	nc, err := d.DialContext(ctx, "tcp", NormalizeAddress(address))
	if err != nil {
		return nil, err
	}

	c := &Conn{
		conn:   nc,
		closed: make(chan struct{}),
	}

	if err := c.send(OpVersion, VersionMessage{Version: protocolVersion}); err != nil {
		nc.Close()
		return nil, err
	}
	if err := c.send(OpInitial, sender); err != nil {
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

// LocalIP returns the address this side of the connection uses, which the receiver can reach.
func (c *Conn) LocalIP() net.IP {
	if addr, ok := c.conn.LocalAddr().(*net.TCPAddr); ok {
		return addr.IP
	}
	return nil
}

// Run reads messages from the receiver and passes them to handle until the connection closes. It returns nil if Close was called.
func (c *Conn) Run(handle func(msg interface{})) error {
	go c.keepAlive()

	for {
		if err := c.conn.SetReadDeadline(time.Now().Add(readTimeout)); err != nil {
			return c.runError(err)
		}

		op, body, err := readPacket(c.conn)
		if err != nil {
			return c.runError(err)
		}

		if op == OpPing {
			if err := c.send(OpPong, nil); err != nil {
				return c.runError(err)
			}
			continue
		}

		msg, err := decodeMessage(op, body)
		if err != nil {
			return c.runError(err)
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
			if err := c.send(OpPing, nil); err != nil {
				return
			}
		}
	}
}

func (c *Conn) send(op Opcode, body interface{}) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	if err := c.conn.SetWriteDeadline(time.Now().Add(dialTimeout)); err != nil {
		return err
	}
	return writePacket(c.conn, op, body)
}

func (c *Conn) Play(msg PlayMessage) error {
	return c.send(OpPlay, msg)
}

func (c *Conn) Pause() error {
	return c.send(OpPause, nil)
}

func (c *Conn) Resume() error {
	return c.send(OpResume, nil)
}

func (c *Conn) Stop() error {
	return c.send(OpStop, nil)
}

func (c *Conn) Seek(seconds float64) error {
	return c.send(OpSeek, seekMessage{Time: seconds})
}

// SetVolume sets the receiver volume, from 0 to 1.
func (c *Conn) SetVolume(volume float64) error {
	return c.send(OpSetVolume, setVolumeMessage{Volume: volume})
}

func (c *Conn) SetSpeed(speed float64) error {
	return c.send(OpSetSpeed, setSpeedMessage{Speed: speed})
}

func (c *Conn) Close() error {
	var err error
	c.once.Do(func() {
		close(c.closed)
		err = c.conn.Close()
	})
	return err
}
