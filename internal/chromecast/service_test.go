package chromecast

import (
	"context"
	"strings"
	"testing"
	"time"

	castproto "github.com/stashapp/stash/pkg/chromecast"
	"github.com/stashapp/stash/pkg/chromecast/chromecasttest"
)

const (
	directURL = "http://192.168.1.2:9999/scene/7/stream"
	hlsURL    = "http://192.168.1.2:9999/scene/7/stream.m3u8?resolution=ORIGINAL"
)

func load(url string, time float64) castproto.LoadRequest {
	return castproto.LoadRequest{
		Media:       castproto.MediaInfo{ContentID: url, ContentType: "video/mp4", StreamType: "BUFFERED"},
		CurrentTime: time,
		Autoplay:    true,
	}
}

type harness struct {
	t       *testing.T
	svc     *Service
	device  *chromecasttest.Device
	address string
	updates <-chan Status
}

func newHarness(t *testing.T) *harness {
	d, err := chromecasttest.NewDevice()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	svc := NewService()
	h := &harness{t: t, svc: svc, device: d, address: d.Address(), updates: svc.Subscribe(ctx)}
	if _, err := svc.Connect(ctx, h.address); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = svc.Stop(h.address) })
	return h
}

// waitFor returns the first status update that matches.
func (h *harness) waitFor(desc string, match func(Status) bool) Status {
	h.t.Helper()
	timeout := time.After(3 * time.Second)
	for {
		select {
		case st := <-h.updates:
			if match(st) {
				return st
			}
		case <-timeout:
			h.t.Fatalf("timed out waiting for %s", desc)
			return Status{}
		}
	}
}

func (h *harness) play(fallback *castproto.LoadRequest) {
	h.t.Helper()
	if err := h.svc.Play(h.address, 7, load(directURL, 30), fallback); err != nil {
		h.t.Fatal(err)
	}
}

func (h *harness) waitPlaying() Status {
	h.t.Helper()
	return h.waitFor("playing", func(st Status) bool {
		return st.State == StatePlaying && st.SceneID == 7
	})
}

func TestPlayLaunchesApp(t *testing.T) {
	h := newHarness(t)
	h.play(nil)

	st := h.waitPlaying()
	if st.Time < 30 || st.Duration != 600 {
		t.Errorf("status = %+v, want time 30 and duration 600", st)
	}
	if n := len(h.device.Received("LAUNCH")); n != 1 {
		t.Errorf("LAUNCH sent %d times", n)
	}
	loads := h.device.Received("LOAD")
	if len(loads) != 1 || loads[0].Destination != "web-1" {
		t.Fatalf("LOAD = %+v", loads)
	}

	// the app is running now, so the next scene is loaded into it
	if err := h.svc.Play(h.address, 8, load("http://192.168.1.2:9999/scene/8/stream", 0), nil); err != nil {
		t.Fatal(err)
	}
	h.waitFor("scene 8", func(st Status) bool { return st.SceneID == 8 && st.State == StatePlaying })
	if n := len(h.device.Received("LAUNCH")); n != 1 {
		t.Errorf("LAUNCH sent %d times, want only for the first scene", n)
	}
}

func TestControls(t *testing.T) {
	h := newHarness(t)
	h.play(nil)
	h.waitPlaying()

	if err := h.svc.Pause(h.address); err != nil {
		t.Fatal(err)
	}
	h.waitFor("paused", func(st Status) bool { return st.State == StatePaused })

	if err := h.svc.Seek(h.address, 200); err != nil {
		t.Fatal(err)
	}
	h.waitFor("seek", func(st Status) bool { return st.Time == 200 })

	if err := h.svc.Resume(h.address); err != nil {
		t.Fatal(err)
	}
	h.waitPlaying()

	if err := h.svc.SetVolume(h.address, 0.25); err != nil {
		t.Fatal(err)
	}
	h.waitFor("volume", func(st Status) bool { return st.Volume == 0.25 })

	if err := h.svc.SetMuted(h.address, true); err != nil {
		t.Fatal(err)
	}
	h.waitFor("muted", func(st Status) bool { return st.Muted })
}

func TestCommandsNeedMedia(t *testing.T) {
	h := newHarness(t)
	if err := h.svc.Pause(h.address); err == nil {
		t.Error("pause succeeded before anything was cast")
	}
}

func TestFallsBackToHLS(t *testing.T) {
	h := newHarness(t)
	h.device.FailLoads("/stream")

	fallback := load(hlsURL, 0)
	h.play(&fallback)
	h.waitPlaying()

	loads := h.device.Received("LOAD")
	if len(loads) != 2 {
		t.Fatalf("LOAD sent %d times, want the direct stream then HLS", len(loads))
	}
	media, _ := loads[1].Payload["media"].(map[string]interface{})
	if media["contentId"] != hlsURL || loads[1].Payload["currentTime"] != 30.0 {
		t.Errorf("second LOAD = %+v, want HLS from the start time", loads[1].Payload)
	}
}

func TestLoadFailureNamesAddress(t *testing.T) {
	h := newHarness(t)
	h.device.FailLoads("/stream")
	h.device.FailLoads("ORIGINAL")

	fallback := load(hlsURL, 0)
	h.play(&fallback)
	st := h.waitFor("error", func(st Status) bool { return st.Error != "" })
	if !strings.Contains(st.Error, "http://192.168.1.2:9999") {
		t.Errorf("error = %q, want it to name the address Stash gave the device", st.Error)
	}
	if n := len(h.device.Received("LOAD")); n != 2 {
		t.Errorf("LOAD sent %d times, want 2", n)
	}
}

func TestFinished(t *testing.T) {
	h := newHarness(t)
	h.play(nil)
	h.waitPlaying()

	h.device.Finish()
	st := h.waitFor("finished", func(st Status) bool { return st.State == StateFinished })
	if st.SceneID != 7 {
		t.Errorf("scene = %d, want 7", st.SceneID)
	}
}

func TestStoppedOnDevice(t *testing.T) {
	h := newHarness(t)
	h.play(nil)
	h.waitPlaying()

	h.device.StopApp()
	st := h.waitFor("idle", func(st Status) bool { return st.State == StateIdle })
	if st.SceneID != 7 || !st.Connected {
		t.Errorf("status = %+v, want still connected with the scene", st)
	}
	if err := h.svc.Pause(h.address); err == nil {
		t.Error("pause succeeded after the app closed")
	}

	// casting again launches the app again
	h.play(nil)
	h.waitPlaying()
	if n := len(h.device.Received("LAUNCH")); n != 2 {
		t.Errorf("LAUNCH sent %d times, want 2", n)
	}
}

func TestStop(t *testing.T) {
	h := newHarness(t)
	h.play(nil)
	h.waitPlaying()

	if err := h.svc.Stop(h.address); err != nil {
		t.Fatal(err)
	}
	h.waitFor("disconnected", func(st Status) bool { return !st.Connected && st.Error == "" })
	// the device reads the request after Stash has closed its side
	for i := 0; len(h.device.Received("STOP")) == 0; i++ {
		if i == 100 {
			t.Fatal("STOP not sent to the device")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if len(h.svc.Sessions()) != 0 {
		t.Error("session kept after stopping")
	}
}

func TestDeviceGone(t *testing.T) {
	h := newHarness(t)
	h.play(nil)
	h.waitPlaying()

	h.device.DropConnections()
	st := h.waitFor("disconnected", func(st Status) bool { return !st.Connected })
	if st.Error == "" {
		t.Error("no error after losing the device")
	}
}
