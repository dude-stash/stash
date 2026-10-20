package chromecast

import (
	"bytes"
	"context"
	"testing"
	"time"

	"github.com/stashapp/stash/pkg/chromecast/chromecasttest"
)

func TestMessageRoundTrip(t *testing.T) {
	m := castMessage{
		SourceID:      senderID,
		DestinationID: receiverID,
		Namespace:     nsReceiver,
		Payload:       `{"type":"GET_STATUS","requestId":1}`,
	}

	var buf bytes.Buffer
	if err := writeMessage(&buf, m); err != nil {
		t.Fatal(err)
	}
	got, err := readMessage(&buf)
	if err != nil {
		t.Fatal(err)
	}
	if got != m {
		t.Errorf("got %+v, want %+v", got, m)
	}
}

func TestUnmarshalMalformed(t *testing.T) {
	for _, b := range [][]byte{
		{0x12, 0x05, 'a'},
		{0x80},
		{0x13},
	} {
		if _, err := unmarshalMessage(b); err == nil {
			t.Errorf("unmarshalMessage(%x) succeeded", b)
		}
	}
}

func TestReadMessageTooLarge(t *testing.T) {
	if _, err := readMessage(bytes.NewReader([]byte{0, 1, 0, 1})); err == nil {
		t.Error("expected an error for a message over 64KB")
	}
}

type recorder struct {
	msgs chan interface{}
}

func (r *recorder) handle(msg interface{}) {
	r.msgs <- msg
}

// next returns the next message of type T, skipping others.
func next[T any](t *testing.T, r *recorder) T {
	t.Helper()
	timeout := time.After(2 * time.Second)
	for {
		select {
		case msg := <-r.msgs:
			if m, ok := msg.(T); ok {
				return m
			}
		case <-timeout:
			var zero T
			t.Fatalf("no %T received", zero)
			return zero
		}
	}
}

func dialFake(t *testing.T) (*Conn, *chromecasttest.Device, *recorder) {
	d, err := chromecasttest.NewDevice()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })

	c, err := Dial(context.Background(), d.Address())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.Close() })

	r := &recorder{msgs: make(chan interface{}, 32)}
	go func() { _ = c.Run(r.handle) }()
	return c, d, r
}

func TestPlayback(t *testing.T) {
	c, d, r := dialFake(t)

	status := next[*ReceiverStatus](t, r)
	if status.App(DefaultMediaReceiver) != nil {
		t.Fatal("app running before launch")
	}
	if *status.Volume.Level != 0.5 {
		t.Errorf("volume = %v, want 0.5", *status.Volume.Level)
	}

	app := launch(t, c, r)
	if err := c.Connect(app.TransportID); err != nil {
		t.Fatal(err)
	}
	if err := c.Load(app.TransportID, c.NewRequestID(), LoadRequest{
		Media:       MediaInfo{ContentID: "http://stash/scene/1/stream", ContentType: "video/mp4", StreamType: "BUFFERED"},
		CurrentTime: 30,
		Autoplay:    true,
	}); err != nil {
		t.Fatal(err)
	}
	media := next[*MediaStatusMessage](t, r)
	if len(media.Status) != 1 || media.Status[0].PlayerState != PlayerPlaying || media.Status[0].Media.ContentID != "http://stash/scene/1/stream" {
		t.Fatalf("media status = %+v", media.Status)
	}
	if media.Source != app.TransportID {
		t.Errorf("source = %q, want %q", media.Source, app.TransportID)
	}

	load := d.Received("LOAD")[0]
	if load.Destination != app.TransportID || load.Payload["currentTime"] != 30.0 || load.Payload["autoplay"] != true {
		t.Errorf("LOAD = %+v", load)
	}

	session := media.Status[0].MediaSessionID
	if err := c.Seek(app.TransportID, session, 120); err != nil {
		t.Fatal(err)
	}
	if got := next[*MediaStatusMessage](t, r).Status[0].CurrentTime; got < 120 || got > 121 {
		t.Errorf("time after seek = %v, want 120", got)
	}

	if err := c.Pause(app.TransportID, session); err != nil {
		t.Fatal(err)
	}
	if got := next[*MediaStatusMessage](t, r).Status[0].PlayerState; got != PlayerPaused {
		t.Errorf("state after pause = %v", got)
	}

	if err := c.SetMuted(true); err != nil {
		t.Fatal(err)
	}
	if v := next[*ReceiverStatus](t, r).Volume; v.Muted == nil || !*v.Muted {
		t.Errorf("volume after mute = %+v", v)
	}

	if err := c.StopApp(app.SessionID); err != nil {
		t.Fatal(err)
	}
	if next[*CloseMessage](t, r).Source != app.TransportID {
		t.Error("close came from the wrong source")
	}
}

func TestLoadFailed(t *testing.T) {
	c, d, r := dialFake(t)
	d.FailLoads("stream")

	app := launch(t, c, r)
	if err := c.Load(app.TransportID, c.NewRequestID(), LoadRequest{Media: MediaInfo{ContentID: "http://stash/scene/1/stream"}}); err != nil {
		t.Fatal(err)
	}
	if got := next[*ErrorMessage](t, r).Type; got != "LOAD_FAILED" {
		t.Errorf("error type = %q", got)
	}
}

func launch(t *testing.T, c *Conn, r *recorder) *Application {
	t.Helper()
	if err := c.Launch(DefaultMediaReceiver); err != nil {
		t.Fatal(err)
	}
	// skip the status from before the launch
	for {
		if app := next[*ReceiverStatus](t, r).App(DefaultMediaReceiver); app != nil {
			return app
		}
	}
}

func TestRunReturnsWhenDeviceGoes(t *testing.T) {
	d, err := chromecasttest.NewDevice()
	if err != nil {
		t.Fatal(err)
	}
	c, err := Dial(context.Background(), d.Address())
	if err != nil {
		t.Fatal(err)
	}

	done := make(chan error, 1)
	go func() { done <- c.Run(func(interface{}) {}) }()

	time.Sleep(50 * time.Millisecond)
	d.DropConnections()
	d.Close()

	select {
	case err := <-done:
		if err == nil {
			t.Error("Run returned nil after the device went away")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run didn't return after the device went away")
	}
}

func TestNormalizeAddress(t *testing.T) {
	for in, want := range map[string]string{
		"192.168.1.5":       "192.168.1.5:8009",
		"192.168.1.5:32187": "192.168.1.5:32187",
	} {
		if got := NormalizeAddress(in); got != want {
			t.Errorf("NormalizeAddress(%q) = %q, want %q", in, got, want)
		}
	}
}
