// Package chromecast keeps the connections to Cast devices that Stash is casting scenes to.
package chromecast

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/url"
	"sort"
	"sync"
	"time"

	castproto "github.com/stashapp/stash/pkg/chromecast"
	"github.com/stashapp/stash/pkg/logger"
)

const (
	discoverTimeout = 2 * time.Second
	// devices miss some discovery queries, so ones found recently are still listed
	deviceMemory = time.Hour
	// devices only report the position when something changes, so it is asked for while playing
	statusInterval = 5 * time.Second
)

type State string

const (
	StateIdle      State = "IDLE"
	StateBuffering State = "BUFFERING"
	StatePlaying   State = "PLAYING"
	StatePaused    State = "PAUSED"
	StateFinished  State = "FINISHED"
)

type Status struct {
	Address   string
	Name      string
	Connected bool
	// SceneID is 0 unless the device is playing a scene Stash sent it.
	SceneID  int
	State    State
	Time     float64
	Duration float64
	Volume   float64
	Muted    bool
	Error    string
}

type session struct {
	conn   *castproto.Conn
	status Status
	done   chan struct{}

	// the Default Media Receiver app that Stash is connected to, if it is running
	transportID  string
	appSessionID string
	// load to send once the app has launched
	pending *castproto.LoadRequest

	url           string
	loadRequestID int
	// mediaSessionID is set once the app reports playing url
	mediaSessionID int
	prevSessionID  int
	// HLS stream to try if the device can't play the direct stream
	fallback *castproto.LoadRequest
}

func (sess *session) confirmed() bool {
	return sess.mediaSessionID != 0
}

type seenDevice struct {
	castproto.Device
	at time.Time
}

type Service struct {
	mu       sync.Mutex
	sessions map[string]*session
	subs     map[chan Status]struct{}
	seen     map[string]seenDevice
}

func NewService() *Service {
	return &Service{
		sessions: make(map[string]*session),
		subs:     make(map[chan Status]struct{}),
		seen:     make(map[string]seenDevice),
	}
}

// Discover returns the devices found on the local network, along with ones found recently or connected to.
func (s *Service) Discover(ctx context.Context) ([]castproto.Device, error) {
	found, err := castproto.Discover(ctx, discoverTimeout)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	for _, d := range found {
		s.seen[d.Address] = seenDevice{Device: d, at: now}
	}

	var ret []castproto.Device
	for address, d := range s.seen {
		if now.Sub(d.at) > deviceMemory {
			delete(s.seen, address)
			continue
		}
		ret = append(ret, d.Device)
	}
	for address, sess := range s.sessions {
		if _, ok := s.seen[address]; !ok {
			ret = append(ret, castproto.Device{Name: sess.status.Name, Address: address})
		}
	}

	sort.Slice(ret, func(i, j int) bool {
		return ret[i].Name < ret[j].Name
	})
	return ret, nil
}

// Connect connects to the device at address if needed, and returns the IP address the device reaches Stash on.
func (s *Service) Connect(ctx context.Context, address string) (net.IP, error) {
	address = castproto.NormalizeAddress(address)

	if sess := s.session(address); sess != nil {
		return sess.conn.LocalIP(), nil
	}

	conn, err := castproto.Dial(ctx, address)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	if existing := s.sessions[address]; existing != nil {
		s.mu.Unlock()
		conn.Close()
		return existing.conn.LocalIP(), nil
	}
	name := address
	if d, ok := s.seen[address]; ok && d.Name != "" {
		name = d.Name
	}
	sess := &session{
		conn: conn,
		done: make(chan struct{}),
		status: Status{
			Address:   address,
			Name:      name,
			Connected: true,
			State:     StateIdle,
			Volume:    1,
		},
	}
	s.sessions[address] = sess
	s.mu.Unlock()

	go s.run(sess)
	go s.pollStatus(sess)

	return conn.LocalIP(), nil
}

func (s *Service) run(sess *session) {
	err := sess.conn.Run(func(msg interface{}) {
		s.mu.Lock()
		actions := s.handle(sess, msg)
		s.mu.Unlock()
		// sent from another goroutine so a slow write doesn't hold up reading
		if len(actions) > 0 {
			go s.send(sess, actions)
		}
	})
	close(sess.done)
	if err != nil {
		logger.Warnf("[chromecast] lost connection to %s: %v", sess.status.Address, err)
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

func (s *Service) pollStatus(sess *session) {
	t := time.NewTicker(statusInterval)
	defer t.Stop()

	for {
		select {
		case <-sess.done:
			return
		case <-t.C:
			s.mu.Lock()
			transportID := sess.transportID
			playing := sess.confirmed() && (sess.status.State == StatePlaying || sess.status.State == StateBuffering)
			s.mu.Unlock()

			if playing {
				_ = sess.conn.GetMediaStatus(transportID)
			}
		}
	}
}

type action func(c *castproto.Conn) error

func (s *Service) send(sess *session, actions []action) {
	for _, a := range actions {
		if err := a(sess.conn); err != nil {
			logger.Warnf("[chromecast] sending to %s: %v", sess.status.Address, err)
			return
		}
	}
}

// handle must be called with s.mu held. It returns the requests to send in reply.
func (s *Service) handle(sess *session, msg interface{}) []action {
	var actions []action

	switch m := msg.(type) {
	case *castproto.ReceiverStatus:
		actions = s.handleReceiverStatus(sess, m)
	case *castproto.MediaStatusMessage:
		if m.Source != sess.transportID {
			return nil
		}
		for _, ms := range m.Status {
			actions = append(actions, s.handleMediaStatus(sess, ms)...)
		}
	case *castproto.ErrorMessage:
		actions = s.handleError(sess, m)
	default:
		return nil
	}

	s.publish(sess.status)
	return actions
}

func (s *Service) handleReceiverStatus(sess *session, m *castproto.ReceiverStatus) []action {
	st := &sess.status
	if m.Volume.Level != nil {
		st.Volume = *m.Volume.Level
	}
	if m.Volume.Muted != nil {
		st.Muted = *m.Volume.Muted
	}

	app := m.App(castproto.DefaultMediaReceiver)
	if app == nil {
		if sess.transportID == "" {
			return nil
		}
		sess.transportID = ""
		sess.appSessionID = ""
		if sess.pending != nil {
			// still launching
			return nil
		}

		sess.mediaSessionID = 0
		if st.SceneID != 0 && st.State != StateFinished {
			st.State = StateIdle
			for _, other := range m.Applications {
				if !other.IsIdleScreen {
					// another app took over the device
					st.SceneID = 0
					sess.url = ""
				}
			}
		}
		return nil
	}

	var actions []action
	if app.TransportID != sess.transportID {
		sess.transportID = app.TransportID
		sess.appSessionID = app.SessionID
		transportID := app.TransportID
		actions = append(actions, func(c *castproto.Conn) error {
			return c.Connect(transportID)
		})
	}
	if sess.pending != nil {
		actions = append(actions, s.loadAction(sess, *sess.pending))
		sess.pending = nil
	}
	return actions
}

func (s *Service) handleMediaStatus(sess *session, ms castproto.MediaStatus) []action {
	st := &sess.status

	if ms.MediaSessionID != sess.mediaSessionID {
		if ms.Media == nil || sess.url == "" || ms.MediaSessionID <= sess.prevSessionID {
			return nil
		}
		switch {
		case !sess.confirmed() && ms.Media.ContentID == sess.url:
			sess.mediaSessionID = ms.MediaSessionID
		case sess.confirmed() && ms.MediaSessionID > sess.mediaSessionID:
			// another sender loaded something into the app
			sess.url = ""
			sess.mediaSessionID = 0
			st.SceneID = 0
			st.State = StateIdle
			return nil
		default:
			return nil
		}
	}

	st.Time = ms.CurrentTime
	if ms.Media != nil && ms.Media.Duration > 0 {
		st.Duration = ms.Media.Duration
	}

	switch ms.PlayerState {
	case castproto.PlayerPlaying:
		st.State = StatePlaying
	case castproto.PlayerPaused:
		st.State = StatePaused
	case castproto.PlayerBuffering, castproto.PlayerLoading:
		st.State = StateBuffering
	case castproto.PlayerIdle:
		switch ms.IdleReason {
		case castproto.IdleFinished:
			st.State = StateFinished
		case castproto.IdleError:
			return s.loadFailed(sess)
		case castproto.IdleInterrupted:
			// replaced by a newer load, which reports its own status
		default:
			st.State = StateIdle
		}
	}
	return nil
}

func (s *Service) handleError(sess *session, m *castproto.ErrorMessage) []action {
	switch m.Type {
	case "LOAD_FAILED":
		// the app may already have reported the failure in a media status
		if m.RequestID != 0 && m.RequestID == sess.loadRequestID {
			return s.loadFailed(sess)
		}
	case "LAUNCH_ERROR":
		sess.pending = nil
		sess.status.Error = fmt.Sprintf("%s couldn't start its media player: %s", sess.status.Name, m.Reason)
		logger.Warnf("[chromecast] %s", sess.status.Error)
	default:
		logger.Debugf("[chromecast] %s refused a request: %s %s", sess.status.Name, m.Type, m.Reason)
	}
	return nil
}

// loadFailed tries the fallback stream, or reports the failure if there is none.
func (s *Service) loadFailed(sess *session) []action {
	st := &sess.status

	if sess.fallback != nil {
		logger.Infof("[chromecast] %s could not play the direct stream of scene %d, trying HLS", st.Name, st.SceneID)
		load := *sess.fallback
		load.CurrentTime = st.Time
		s.startLoad(sess, load, nil)
		return []action{s.loadAction(sess, load)}
	}

	// the receiver doesn't say why, and the usual reason is that it can't reach the address Stash gave it
	host := sess.url
	if u, err := url.Parse(sess.url); err == nil {
		host = u.Scheme + "://" + u.Host
	}
	st.Error = fmt.Sprintf("%s couldn't load the video from %s. Check that it can reach Stash at that address.", st.Name, host)
	logger.Warnf("[chromecast] %s could not play scene %d from %s", st.Name, st.SceneID, sess.url)
	sess.url = ""
	sess.loadRequestID = 0
	return nil
}

// loadAction must be called with s.mu held.
func (s *Service) loadAction(sess *session, load castproto.LoadRequest) action {
	transportID := sess.transportID
	requestID := sess.conn.NewRequestID()
	sess.loadRequestID = requestID
	return func(c *castproto.Conn) error {
		return c.Load(transportID, requestID, load)
	}
}

// startLoad must be called with s.mu held, before sending load.
func (s *Service) startLoad(sess *session, load castproto.LoadRequest, fallback *castproto.LoadRequest) {
	sess.url = load.Media.ContentID
	sess.fallback = fallback
	if sess.mediaSessionID > sess.prevSessionID {
		sess.prevSessionID = sess.mediaSessionID
	}
	sess.mediaSessionID = 0
}

func (s *Service) session(address string) *session {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sessions[castproto.NormalizeAddress(address)]
}

func (s *Service) connected(address string) (*session, error) {
	sess := s.session(address)
	if sess == nil {
		return nil, fmt.Errorf("not connected to %s", address)
	}
	return sess, nil
}

// Play casts a scene to a device that Connect has connected to, launching the Default Media Receiver on it if needed. The device plays fallback if it can't play load.
func (s *Service) Play(address string, sceneID int, load castproto.LoadRequest, fallback *castproto.LoadRequest) error {
	sess, err := s.connected(address)
	if err != nil {
		return err
	}

	s.mu.Lock()
	st := &sess.status
	st.SceneID = sceneID
	st.State = StateBuffering
	st.Time = load.CurrentTime
	st.Duration = 0
	st.Error = ""
	s.startLoad(sess, load, fallback)

	var send action
	if sess.transportID != "" {
		sess.pending = nil
		send = s.loadAction(sess, load)
	} else {
		sess.pending = &load
		send = func(c *castproto.Conn) error {
			return c.Launch(castproto.DefaultMediaReceiver)
		}
	}
	s.publish(*st)
	s.mu.Unlock()

	return send(sess.conn)
}

var errNotPlaying = errors.New("nothing Stash sent is playing")

// media returns the app and media session that commands go to.
func (s *Service) media(address string) (*session, string, int, error) {
	sess, err := s.connected(address)
	if err != nil {
		return nil, "", 0, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if !sess.confirmed() || sess.transportID == "" {
		return nil, "", 0, errNotPlaying
	}
	return sess, sess.transportID, sess.mediaSessionID, nil
}

func (s *Service) Pause(address string) error {
	sess, transportID, mediaSessionID, err := s.media(address)
	if err != nil {
		return err
	}
	return sess.conn.Pause(transportID, mediaSessionID)
}

func (s *Service) Resume(address string) error {
	sess, transportID, mediaSessionID, err := s.media(address)
	if err != nil {
		return err
	}
	return sess.conn.Play(transportID, mediaSessionID)
}

func (s *Service) Seek(address string, seconds float64) error {
	sess, transportID, mediaSessionID, err := s.media(address)
	if err != nil {
		return err
	}
	return sess.conn.Seek(transportID, mediaSessionID, seconds)
}

// SetVolume sets the device volume, from 0 to 1.
func (s *Service) SetVolume(address string, volume float64) error {
	sess, err := s.connected(address)
	if err != nil {
		return err
	}
	return sess.conn.SetVolume(volume)
}

func (s *Service) SetMuted(address string, muted bool) error {
	sess, err := s.connected(address)
	if err != nil {
		return err
	}
	return sess.conn.SetMuted(muted)
}

// Stop closes the media player on the device and disconnects from it.
func (s *Service) Stop(address string) error {
	sess := s.session(address)
	if sess == nil {
		return nil
	}

	s.mu.Lock()
	appSessionID := sess.appSessionID
	s.mu.Unlock()

	var err error
	if appSessionID != "" {
		err = sess.conn.StopApp(appSessionID)
	}
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
			// a slow subscriber misses an update rather than holding up the device
		}
	}
}
