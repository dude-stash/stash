// Package fcast keeps the connections to FCast receivers that Stash is casting scenes to.
package fcast

import (
	"context"
	"fmt"
	"net"
	"sort"
	"sync"
	"time"

	"github.com/stashapp/stash/internal/build"
	fcastproto "github.com/stashapp/stash/pkg/fcast"
	"github.com/stashapp/stash/pkg/logger"
)

const (
	discoverTimeout = 2 * time.Second
	// receivers miss some discovery queries, so ones found recently are still listed
	receiverMemory = time.Hour
	// receivers that don't confirm a play request with a PlayUpdate are trusted after this long
	playConfirmTimeout = 3 * time.Second
)

type Status struct {
	Address   string
	Name      string
	Connected bool
	// SceneID is 0 unless the receiver is playing a scene Stash sent it.
	SceneID  int
	State    fcastproto.PlaybackState
	Time     float64
	Duration float64
	Volume   float64
	Error    string
}

type session struct {
	conn   *fcastproto.Conn
	status Status

	url        string
	playSentAt time.Time
	confirmed  bool
	// HLS stream to try if the receiver can't play the direct stream
	fallback *fcastproto.PlayMessage
}

type seenReceiver struct {
	fcastproto.Receiver
	at time.Time
}

type Service struct {
	mu       sync.Mutex
	sessions map[string]*session
	subs     map[chan Status]struct{}
	seen     map[string]seenReceiver
}

func NewService() *Service {
	return &Service{
		sessions: make(map[string]*session),
		subs:     make(map[chan Status]struct{}),
		seen:     make(map[string]seenReceiver),
	}
}

// Discover returns the receivers found on the local network, along with ones found recently or connected to.
func (s *Service) Discover(ctx context.Context) ([]fcastproto.Receiver, error) {
	found, err := fcastproto.Discover(ctx, discoverTimeout)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	for _, r := range found {
		s.seen[r.Address] = seenReceiver{Receiver: r, at: now}
	}

	var ret []fcastproto.Receiver
	for address, r := range s.seen {
		if now.Sub(r.at) > receiverMemory {
			delete(s.seen, address)
			continue
		}
		ret = append(ret, r.Receiver)
	}
	for address, sess := range s.sessions {
		if _, ok := s.seen[address]; !ok {
			ret = append(ret, fcastproto.Receiver{Name: sess.status.Name, Address: address})
		}
	}

	sort.Slice(ret, func(i, j int) bool {
		return ret[i].Name < ret[j].Name
	})
	return ret, nil
}

// Connect connects to the receiver at address if needed, and returns the IP address the receiver reaches Stash on.
func (s *Service) Connect(ctx context.Context, address string) (net.IP, error) {
	address = fcastproto.NormalizeAddress(address)

	if sess := s.session(address); sess != nil {
		return sess.conn.LocalIP(), nil
	}

	version, _, _ := build.Version()
	conn, err := fcastproto.Dial(ctx, address, fcastproto.InitialMessage{
		DisplayName: "Stash",
		AppName:     "Stash",
		AppVersion:  version,
	})
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	if existing := s.sessions[address]; existing != nil {
		s.mu.Unlock()
		conn.Close()
		return existing.conn.LocalIP(), nil
	}
	sess := &session{
		conn: conn,
		status: Status{
			Address:   address,
			Connected: true,
			Volume:    1,
		},
	}
	s.sessions[address] = sess
	s.mu.Unlock()

	go s.run(sess)

	return conn.LocalIP(), nil
}

func (s *Service) run(sess *session) {
	err := sess.conn.Run(func(msg interface{}) {
		s.handle(sess, msg)
	})
	if err != nil {
		logger.Warnf("[fcast] lost connection to %s: %v", sess.status.Address, err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.sessions[sess.status.Address] == sess {
		delete(s.sessions, sess.status.Address)
	}
	sess.status.Connected = false
	if err != nil {
		sess.status.Error = fmt.Sprintf("Lost connection to %s: %v", sess.status.Name, err)
	}
	s.publish(sess.status)
}

func (s *Service) handle(sess *session, msg interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()

	st := &sess.status
	switch m := msg.(type) {
	case *fcastproto.InitialMessage:
		st.Name = m.DisplayName
	case *fcastproto.PlayUpdateMessage:
		if m.PlayData == nil || sess.url == "" {
			return
		}
		if m.PlayData.URL == sess.url {
			sess.confirmed = true
			return
		}
		// another sender is now using the receiver
		sess.url = ""
		sess.fallback = nil
		st.SceneID = 0
		st.State = fcastproto.StateIdle
	case *fcastproto.PlaybackUpdateMessage:
		// the receiver reports the previous media's state until it has taken our play request
		if !sess.confirmed && time.Since(sess.playSentAt) < playConfirmTimeout {
			return
		}
		st.State = m.State
		if m.Time != nil {
			st.Time = *m.Time
		}
		if m.Duration != nil {
			st.Duration = *m.Duration
		}
	case *fcastproto.VolumeUpdateMessage:
		st.Volume = m.Volume
	case *fcastproto.PlaybackErrorMessage:
		if sess.fallback != nil {
			logger.Infof("[fcast] %s could not play the direct stream, trying HLS: %s", st.Name, m.Message)
			fallback := *sess.fallback
			fallback.Time = st.Time
			s.startPlay(sess, fallback, nil)
			// don't hold up the read loop, which answers the receiver's pings
			go func() {
				if err := sess.conn.Play(fallback); err != nil {
					logger.Warnf("[fcast] sending HLS stream to %s: %v", sess.status.Address, err)
				}
			}()
			return
		}
		logger.Warnf("[fcast] %s could not play scene %d: %s", st.Name, st.SceneID, m.Message)
		st.Error = m.Message
	default:
		return
	}

	s.publish(*st)
}

func (s *Service) session(address string) *session {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sessions[fcastproto.NormalizeAddress(address)]
}

func (s *Service) connected(address string) (*session, error) {
	sess := s.session(address)
	if sess == nil {
		return nil, fmt.Errorf("not connected to %s", address)
	}
	return sess, nil
}

// Play casts a scene to a receiver that Connect has connected to. The receiver plays fallback if it can't play msg.
func (s *Service) Play(address string, sceneID int, msg fcastproto.PlayMessage, fallback *fcastproto.PlayMessage) error {
	sess, err := s.connected(address)
	if err != nil {
		return err
	}

	s.mu.Lock()
	st := &sess.status
	st.SceneID = sceneID
	st.State = fcastproto.StateIdle
	st.Time = msg.Time
	st.Duration = 0
	st.Error = ""
	s.startPlay(sess, msg, fallback)
	s.mu.Unlock()

	return sess.conn.Play(msg)
}

// startPlay must be called with s.mu held, before sending msg.
func (s *Service) startPlay(sess *session, msg fcastproto.PlayMessage, fallback *fcastproto.PlayMessage) {
	sess.url = msg.URL
	sess.fallback = fallback
	sess.playSentAt = time.Now()
	sess.confirmed = false
	s.publish(sess.status)
}

func (s *Service) Pause(address string) error {
	sess, err := s.connected(address)
	if err != nil {
		return err
	}
	return sess.conn.Pause()
}

func (s *Service) Resume(address string) error {
	sess, err := s.connected(address)
	if err != nil {
		return err
	}
	return sess.conn.Resume()
}

func (s *Service) Seek(address string, seconds float64) error {
	sess, err := s.connected(address)
	if err != nil {
		return err
	}
	return sess.conn.Seek(seconds)
}

func (s *Service) SetVolume(address string, volume float64) error {
	sess, err := s.connected(address)
	if err != nil {
		return err
	}
	return sess.conn.SetVolume(volume)
}

// Stop stops playback on the receiver and disconnects from it.
func (s *Service) Stop(address string) error {
	sess := s.session(address)
	if sess == nil {
		return nil
	}

	err := sess.conn.Stop()
	sess.conn.Close()
	return err
}

func (s *Service) Sessions() []Status {
	s.mu.Lock()
	defer s.mu.Unlock()

	ret := make([]Status, 0, len(s.sessions))
	for _, sess := range s.sessions {
		ret = append(ret, sess.status)
	}
	return ret
}

// Subscribe returns a channel of session status changes, which is closed when ctx is done.
func (s *Service) Subscribe(ctx context.Context) <-chan Status {
	ch := make(chan Status, 16)

	s.mu.Lock()
	s.subs[ch] = struct{}{}
	s.mu.Unlock()

	go func() {
		<-ctx.Done()
		s.mu.Lock()
		delete(s.subs, ch)
		close(ch)
		s.mu.Unlock()
	}()

	return ch
}

// publish must be called with s.mu held.
func (s *Service) publish(st Status) {
	for ch := range s.subs {
		select {
		case ch <- st:
		default:
			// a slow subscriber misses an update rather than holding up the receiver
		}
	}
}
