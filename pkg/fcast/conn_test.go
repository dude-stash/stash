package fcast

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"net"
	"testing"
	"time"
)

type fakeReceiver struct {
	t    *testing.T
	ln   net.Listener
	conn chan net.Conn
}

func newFakeReceiver(t *testing.T) *fakeReceiver {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	r := &fakeReceiver{t: t, ln: ln, conn: make(chan net.Conn, 1)}
	go func() {
		c, err := ln.Accept()
		if err == nil {
			r.conn <- c
		}
	}()
	t.Cleanup(func() { ln.Close() })
	return r
}

func (r *fakeReceiver) accept() net.Conn {
	select {
	case c := <-r.conn:
		r.t.Cleanup(func() { c.Close() })
		return c
	case <-time.After(time.Second):
		r.t.Fatal("no connection")
		return nil
	}
}

func (r *fakeReceiver) expect(c net.Conn, op Opcode, body interface{}) {
	r.t.Helper()
	gotOp, gotBody, err := readPacket(c)
	if err != nil {
		r.t.Fatal(err)
	}
	if gotOp != op {
		r.t.Fatalf("opcode = %d, want %d", gotOp, op)
	}
	if body == nil {
		if len(gotBody) != 0 {
			r.t.Fatalf("body = %s, want none", gotBody)
		}
		return
	}
	want, err := json.Marshal(body)
	if err != nil {
		r.t.Fatal(err)
	}
	if !bytes.Equal(gotBody, want) {
		r.t.Fatalf("body = %s, want %s", gotBody, want)
	}
}

func dialFake(t *testing.T) (*Conn, net.Conn, *fakeReceiver) {
	r := newFakeReceiver(t)
	c, err := Dial(context.Background(), r.ln.Addr().String(), InitialMessage{DisplayName: "Stash"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.Close() })

	rc := r.accept()
	r.expect(rc, OpVersion, VersionMessage{Version: 3})
	r.expect(rc, OpInitial, InitialMessage{DisplayName: "Stash"})
	return c, rc, r
}

func TestDialSendsCommands(t *testing.T) {
	c, rc, r := dialFake(t)

	play := PlayMessage{
		Container: "video/mp4",
		URL:       "http://192.168.1.2:9999/scene/1/stream",
		Time:      12.5,
		Metadata:  &Metadata{Title: "Scene"},
	}
	if err := c.Play(play); err != nil {
		t.Fatal(err)
	}
	_, body, err := readPacket(rc)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"container":"video/mp4","url":"http://192.168.1.2:9999/scene/1/stream","time":12.5,"metadata":{"type":0,"title":"Scene"}}`
	if string(body) != want {
		t.Fatalf("play body = %s, want %s", body, want)
	}

	if err := c.Seek(30); err != nil {
		t.Fatal(err)
	}
	r.expect(rc, OpSeek, seekMessage{Time: 30})

	if err := c.Pause(); err != nil {
		t.Fatal(err)
	}
	r.expect(rc, OpPause, nil)

	if err := c.SetVolume(0.5); err != nil {
		t.Fatal(err)
	}
	r.expect(rc, OpSetVolume, setVolumeMessage{Volume: 0.5})
}

func TestRunAnswersPingsAndDecodesUpdates(t *testing.T) {
	c, rc, r := dialFake(t)

	msgs := make(chan interface{}, 4)
	runErr := make(chan error, 1)
	go func() {
		runErr <- c.Run(func(msg interface{}) { msgs <- msg })
	}()

	if err := writePacket(rc, OpPing, nil); err != nil {
		t.Fatal(err)
	}
	r.expect(rc, OpPong, nil)

	if err := writePacket(rc, OpPlaybackUpdate, map[string]interface{}{"generationTime": 1, "state": 1, "time": 4.5, "duration": 60}); err != nil {
		t.Fatal(err)
	}
	select {
	case msg := <-msgs:
		u, ok := msg.(*PlaybackUpdateMessage)
		if !ok || u.State != StatePlaying || *u.Time != 4.5 || *u.Duration != 60 || u.Speed != nil {
			t.Fatalf("unexpected message %#v", msg)
		}
	case <-time.After(time.Second):
		t.Fatal("no update")
	}

	rc.Close()
	select {
	case err := <-runErr:
		if !errors.Is(err, io.EOF) {
			t.Fatalf("run error = %v, want EOF", err)
		}
	case <-time.After(time.Second):
		t.Fatal("run did not return")
	}
}

func TestRunReturnsNilAfterClose(t *testing.T) {
	c, _, _ := dialFake(t)

	runErr := make(chan error, 1)
	go func() {
		runErr <- c.Run(func(interface{}) {})
	}()

	c.Close()
	select {
	case err := <-runErr:
		if err != nil {
			t.Fatalf("run error = %v, want nil", err)
		}
	case <-time.After(time.Second):
		t.Fatal("run did not return")
	}
}

func TestReadPacketAcrossWrites(t *testing.T) {
	var buf bytes.Buffer
	if err := writePacket(&buf, OpVersion, VersionMessage{Version: 3}); err != nil {
		t.Fatal(err)
	}
	packet := buf.Bytes()

	pr, pw := io.Pipe()
	go func() {
		for _, b := range packet {
			_, _ = pw.Write([]byte{b})
		}
	}()

	op, body, err := readPacket(pr)
	if err != nil {
		t.Fatal(err)
	}
	if op != OpVersion || string(body) != `{"version":3}` {
		t.Fatalf("got %d %s", op, body)
	}
}

func TestReadPacketRejectsBadSizes(t *testing.T) {
	for _, size := range []uint32{0, maxPacketSize + 1} {
		header := make([]byte, headerSize)
		binary.LittleEndian.PutUint32(header, size)
		if _, _, err := readPacket(bytes.NewReader(header)); err == nil {
			t.Errorf("size %d: expected error", size)
		}
	}
}

func TestNormalizeAddress(t *testing.T) {
	tests := map[string]string{
		"192.168.1.5":      "192.168.1.5:46899",
		"192.168.1.5:1234": "192.168.1.5:1234",
		"tv.local":         "tv.local:46899",
		"fe80::1":          "[fe80::1]:46899",
	}
	for in, want := range tests {
		if got := NormalizeAddress(in); got != want {
			t.Errorf("NormalizeAddress(%q) = %q, want %q", in, got, want)
		}
	}
}
