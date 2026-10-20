package api

import (
	"testing"

	"github.com/stashapp/stash/internal/manager"
)

func TestChromecastLoads(t *testing.T) {
	streams := []*manager.SceneStreamEndpoint{
		{URL: "http://192.168.1.2:9997/scene/1/stream?apikey=k"},
		{URL: "http://192.168.1.2:9997/scene/1/stream.mp4?resolution=ORIGINAL&apikey=k"},
		{URL: "http://192.168.1.2:9997/scene/1/stream.m3u8?resolution=ORIGINAL&apikey=k"},
		{URL: "http://192.168.1.2:9997/scene/1/stream.m3u8?resolution=STANDARD&apikey=k"},
	}

	load, fallback, err := chromecastLoads(streams, "video/webm")
	if err != nil {
		t.Fatal(err)
	}
	if load.Media.ContentID != streams[0].URL || load.Media.ContentType != "video/webm" || !load.Autoplay {
		t.Errorf("load = %+v, want the direct stream", load)
	}
	if fallback == nil || fallback.Media.ContentID != streams[2].URL || fallback.Media.ContentType != "application/vnd.apple.mpegurl" || fallback.Media.HLSSegmentFormat != "ts" {
		t.Errorf("fallback = %+v, want the original resolution HLS stream", fallback)
	}

	load, fallback, err = chromecastLoads(streams, "")
	if err != nil {
		t.Fatal(err)
	}
	if load.Media.ContentID != streams[2].URL || fallback != nil {
		t.Errorf("load = %+v, fallback = %+v, want HLS only", load, fallback)
	}

	if _, _, err := chromecastLoads(streams[:2], ""); err == nil {
		t.Error("expected an error without a stream to cast")
	}
}
