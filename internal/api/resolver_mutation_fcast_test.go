package api

import (
	"testing"

	"github.com/stashapp/stash/internal/manager"
)

func TestFcastPlayMessages(t *testing.T) {
	streams := []*manager.SceneStreamEndpoint{
		{URL: "http://192.168.1.2:9999/scene/1/stream?apikey=k"},
		{URL: "http://192.168.1.2:9999/scene/1/stream.mp4?resolution=ORIGINAL&apikey=k"},
		{URL: "http://192.168.1.2:9999/scene/1/stream.m3u8?resolution=ORIGINAL&apikey=k"},
		{URL: "http://192.168.1.2:9999/scene/1/stream.m3u8?resolution=STANDARD&apikey=k"},
	}

	play, fallback, err := fcastPlayMessages(streams, "video/x-matroska")
	if err != nil {
		t.Fatal(err)
	}
	if play.URL != streams[0].URL || play.Container != "video/x-matroska" {
		t.Errorf("play = %+v, want the direct stream", play)
	}
	if fallback == nil || fallback.URL != streams[2].URL || fallback.Container != "application/vnd.apple.mpegurl" {
		t.Errorf("fallback = %+v, want the original resolution HLS stream", fallback)
	}

	play, fallback, err = fcastPlayMessages(streams, "")
	if err != nil {
		t.Fatal(err)
	}
	if play.URL != streams[2].URL || fallback != nil {
		t.Errorf("play = %+v, fallback = %+v, want HLS only", play, fallback)
	}

	if _, _, err := fcastPlayMessages(streams[:2], ""); err == nil {
		t.Error("expected an error without a stream to cast")
	}
}
