package fcast

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"io"
	"net"
	"testing"
	"time"

	fcastproto "github.com/stashapp/stash/pkg/fcast"
)

type fakeReceiver struct {
	t    *testing.T
	conn net.Conn
}

func startReceiver(t *testing.T) (string, <-chan *fakeReceiver) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })

	ch := make(chan *fakeReceiver, 1)
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		t.Cleanup(func() { c.Close() })
		ch <- &fakeReceiver{t: t, conn: c}
	}()
	return ln.Addr().String(), ch
}

func (r *fakeReceiver) send(op fcastproto.Opcode, body interface{}) {
	r.t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		r.t.Fatal(err)
	}
	buf := make([]byte, 5+len(data))
	binary.LittleEndian.PutUint32(buf, uint32(len(data)+1))
	buf[4] = byte(op)
	copy(buf[5:], data)
	if _, err := r.conn.Write(buf); err != nil {
		r.t.Fatal(err)
	}
}

// next returns the next packet the sender wrote that isn't a ping.
func (r *fakeReceiver) next() (fcastproto.Opcode, map[string]interface{}) {
	r.t.Helper()
	for {
		header := make([]byte, 5)
		if _, err := io.ReadFull(r.conn, header); err != nil {
			r.t.Fatal(err)
		}
		body := make([]byte, binary.LittleEndian.Uint32(header)-1)
		if _, err := io.ReadFull(r.conn, body); err != nil {
			r.t.Fatal(err)
		}
		op := fcastproto.Opcode(header[4])
		if op == fcastproto.OpPing {
			continue
		}
		var m map[string]interface{}
		if len(body) > 0 {
			if err := json.Unmarshal(body, &m); err != nil {
				r.t.Fatal(err)
			}
		}
		return op, m
	}
}

func waitFor(t *testing.T, updates <-chan Status, cond func(Status) bool) Status {
	t.Helper()
	timeout := time.After(2 * time.Second)
	for {
		select {
		case st := <-updates:
			if cond(st) {
				return st
			}
		case <-timeout:
			t.Fatal("timed out waiting for status")
			return Status{}
		}
	}
}

func connect(t *testing.T) (*Service, string, *fakeReceiver, <-chan Status) {
	address, accepted := startReceiver(t)
	s := NewService()

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	updates := s.Subscribe(ctx)

	if _, err := s.Connect(ctx, address); err != nil {
		t.Fatal(err)
	}
	r := <-accepted
	if op, _ := r.next(); op != fcastproto.OpVersion {
		t.Fatalf("first packet = %d, want version", op)
	}
	if op, _ := r.next(); op != fcastproto.OpInitial {
		t.Fatalf("second packet = %d, want initial", op)
	}
	return s, address, r, updates
}

func TestPlayIgnoresPreviousMediaUntilConfirmed(t *testing.T) {
	s, address, r, updates := connect(t)

	r.send(fcastproto.OpInitial, map[string]interface{}{"displayName": "Living room"})
	waitFor(t, updates, func(st Status) bool { return st.Name == "Living room" })

	direct := fcastproto.PlayMessage{Container: "video/mp4", URL: "http://stash/scene/7/stream"}
	if err := s.Play(address, 7, direct, nil); err != nil {
		t.Fatal(err)
	}
	if op, m := r.next(); op != fcastproto.OpPlay || m["url"] != direct.URL {
		t.Fatalf("got %d %v, want play", op, m)
	}

	// what the receiver was playing before it took our request
	r.send(fcastproto.OpPlaybackUpdate, map[string]interface{}{"generationTime": 1, "state": 1, "time": 1826, "duration": 4991})
	r.send(fcastproto.OpPlayUpdate, map[string]interface{}{"generationTime": 2, "playData": map[string]interface{}{"container": "video/mp4", "url": direct.URL}})
	r.send(fcastproto.OpPlaybackUpdate, map[string]interface{}{"generationTime": 3, "state": 1, "time": 2, "duration": 600})

	st := waitFor(t, updates, func(st Status) bool { return st.State == fcastproto.StatePlaying })
	if st.Time != 2 || st.Duration != 600 || st.SceneID != 7 {
		t.Errorf("status = %+v, want scene 7 at 2s of 600s", st)
	}
}

func TestPlaybackErrorFallsBackToHLS(t *testing.T) {
	s, address, r, updates := connect(t)

	direct := fcastproto.PlayMessage{Container: "video/x-matroska", URL: "http://stash/scene/7/stream", Time: 30}
	hls := fcastproto.PlayMessage{Container: "application/vnd.apple.mpegurl", URL: "http://stash/scene/7/stream.m3u8"}
	if err := s.Play(address, 7, direct, &hls); err != nil {
		t.Fatal(err)
	}
	r.next()

	r.send(fcastproto.OpPlaybackError, map[string]interface{}{"message": "unsupported codec"})
	if op, m := r.next(); op != fcastproto.OpPlay || m["url"] != hls.URL || m["time"] != 30.0 {
		t.Fatalf("got %d %v, want HLS from 30s", op, m)
	}

	// no more fallbacks, so the error is reported
	r.send(fcastproto.OpPlaybackError, map[string]interface{}{"message": "network error"})
	st := waitFor(t, updates, func(st Status) bool { return st.Error != "" })
	if st.Error != "network error" || st.SceneID != 7 {
		t.Errorf("status = %+v", st)
	}
}

func TestOtherSenderTakesOver(t *testing.T) {
	s, address, r, updates := connect(t)

	if err := s.Play(address, 7, fcastproto.PlayMessage{Container: "video/mp4", URL: "http://stash/scene/7/stream"}, nil); err != nil {
		t.Fatal(err)
	}
	r.next()

	r.send(fcastproto.OpPlayUpdate, map[string]interface{}{"generationTime": 2, "playData": map[string]interface{}{"container": "video/mp4", "url": "http://elsewhere/video.mp4"}})
	waitFor(t, updates, func(st Status) bool { return st.SceneID == 0 })
}

func TestStopDisconnects(t *testing.T) {
	s, address, r, updates := connect(t)

	if err := s.Stop(address); err != nil {
		t.Fatal(err)
	}
	if op, _ := r.next(); op != fcastproto.OpStop {
		t.Fatalf("got %d, want stop", op)
	}

	st := waitFor(t, updates, func(st Status) bool { return !st.Connected })
	if st.Error != "" {
		t.Errorf("stopping reported an error: %s", st.Error)
	}
	if len(s.Sessions()) != 0 {
		t.Error("session still listed after stopping")
	}
}

func TestReceiverClosingIsReported(t *testing.T) {
	s, _, r, updates := connect(t)

	r.conn.Close()
	st := waitFor(t, updates, func(st Status) bool { return !st.Connected })
	if st.Error == "" {
		t.Error("lost connection without an error")
	}
	if len(s.Sessions()) != 0 {
		t.Error("session still listed after the receiver closed")
	}
}
