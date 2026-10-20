package api

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/url"
	"slices"
	"strconv"
	"strings"

	"github.com/stashapp/stash/internal/api/urlbuilders"
	"github.com/stashapp/stash/internal/manager"
	fcastproto "github.com/stashapp/stash/pkg/fcast"
	"github.com/stashapp/stash/pkg/ffmpeg"
	"github.com/stashapp/stash/pkg/models"
	"github.com/stashapp/stash/pkg/session"
	"github.com/stashapp/stash/pkg/signedurl"
)

// formats that TV receivers play directly; anything else is sent as HLS
var (
	fcastDirectContainers = map[ffmpeg.Container]string{
		ffmpeg.Mp4:      "video/mp4",
		ffmpeg.M4v:      "video/mp4",
		ffmpeg.Mov:      "video/quicktime",
		ffmpeg.Webm:     "video/webm",
		ffmpeg.Matroska: "video/x-matroska",
	}
	fcastDirectVideoCodecs = []string{ffmpeg.H264, ffmpeg.H265, ffmpeg.Hevc, ffmpeg.Vp9}
)

func (r *mutationResolver) FcastPlay(ctx context.Context, input FCastPlayInput) (bool, error) {
	sceneID, err := strconv.Atoi(input.SceneID)
	if err != nil {
		return false, fmt.Errorf("converting id: %w", err)
	}

	var scene *models.Scene
	if err := r.withReadTxn(ctx, func(ctx context.Context) error {
		var err error
		scene, err = r.repository.Scene.Find(ctx, sceneID)
		if scene != nil {
			err = scene.LoadPrimaryFile(ctx, r.repository.File)
		}
		return err
	}); err != nil {
		return false, err
	}
	if scene == nil {
		return false, fmt.Errorf("scene with id %d not found", sceneID)
	}
	file := scene.Files.Primary()
	if file == nil {
		return false, fmt.Errorf("scene %d has no file to cast", sceneID)
	}

	svc := manager.GetInstance().FCastService
	ip, err := svc.Connect(ctx, input.Address)
	if err != nil {
		return false, fmt.Errorf("connecting to FCast receiver %s: %w", input.Address, err)
	}

	baseURL, err := fcastBaseURL(ip)
	if err != nil {
		return false, err
	}

	// stream URLs must use an address the receiver can reach, not the one the browser used
	ctx = context.WithValue(ctx, BaseURLCtxKey, baseURL)
	streams, err := r.Query().SceneStreams(ctx, &input.SceneID)
	if err != nil {
		return false, err
	}

	play, fallback, err := fcastPlayMessages(streams, fcastDirectContainer(scene, file))
	if err != nil {
		return false, err
	}

	if input.Time != nil {
		play.Time = *input.Time
	}

	thumbnail, err := url.Parse(urlbuilders.NewSceneURLBuilder(baseURL, scene).GetScreenshotURL())
	if err != nil {
		return false, err
	}
	if err := signReceiverURL(ctx, thumbnail); err != nil {
		return false, err
	}
	play.Metadata = &fcastproto.Metadata{
		Title:        scene.GetTitle(),
		ThumbnailURL: thumbnail.String(),
	}
	if fallback != nil {
		fallback.Metadata = play.Metadata
	}

	if err := svc.Play(input.Address, sceneID, play, fallback); err != nil {
		return false, err
	}
	return true, nil
}

func fcastBaseURL(ip net.IP) (string, error) {
	c := manager.GetInstance().Config

	host := c.GetHost()
	if host == "localhost" {
		host = "127.0.0.1"
	}
	if hostIP := net.ParseIP(host); hostIP != nil {
		if hostIP.IsLoopback() {
			return "", fmt.Errorf("stash only listens on %s, which the receiver can't reach: set the host to 0.0.0.0 to cast", c.GetHost())
		}
		if !hostIP.IsUnspecified() {
			ip = hostIP
		}
	}

	scheme := "http"
	if c.HasTLSConfig() {
		scheme = "https"
	}

	return scheme + "://" + net.JoinHostPort(ip.String(), strconv.Itoa(c.GetPort())), nil
}

// fcastPlayMessages returns the stream to send, and an HLS stream to fall back to if the receiver can't play it. The direct stream is only sent if directContainer is set.
func fcastPlayMessages(streams []*manager.SceneStreamEndpoint, directContainer string) (fcastproto.PlayMessage, *fcastproto.PlayMessage, error) {
	var direct, hls *fcastproto.PlayMessage
	for _, s := range streams {
		u, err := url.Parse(s.URL)
		if err != nil {
			continue
		}

		switch {
		case strings.HasSuffix(u.Path, "/stream") && directContainer != "":
			direct = &fcastproto.PlayMessage{Container: directContainer, URL: s.URL}
		case strings.HasSuffix(u.Path, ".m3u8") && hls == nil:
			// the first HLS stream has the highest resolution
			hls = &fcastproto.PlayMessage{Container: ffmpeg.MimeHLS, URL: s.URL}
		}
	}

	switch {
	case direct != nil:
		return *direct, hls, nil
	case hls != nil:
		return *hls, nil, nil
	default:
		return fcastproto.PlayMessage{}, nil, errors.New("no stream available to cast")
	}
}

func fcastDirectContainer(scene *models.Scene, file *models.VideoFile) string {
	// the direct stream serves the generated MP4 transcode when there is one
	if manager.HasTranscode(scene, manager.GetInstance().Config.GetVideoFileNamingAlgorithm()) {
		return ffmpeg.MimeMp4Video
	}

	container, err := manager.GetVideoFileContainer(file)
	if err != nil || !slices.Contains(fcastDirectVideoCodecs, file.VideoCodec) {
		return ""
	}
	return fcastDirectContainers[container]
}

// signReceiverURL lets the receiver load u without the browser's session cookie.
func signReceiverURL(ctx context.Context, u *url.URL) error {
	c := manager.GetInstance().Config
	if !c.HasCredentials() {
		return nil
	}

	userID := session.GetCurrentUserID(ctx)
	if userID == nil {
		return errors.New("user ID not found")
	}

	q := u.Query()
	for k, v := range signedParams(c, *userID, signedurl.DerivePrefix(u.Path)) {
		q[k] = v
	}
	u.RawQuery = q.Encode()
	return nil
}

func (r *mutationResolver) FcastPause(ctx context.Context, address string) (bool, error) {
	if err := manager.GetInstance().FCastService.Pause(address); err != nil {
		return false, err
	}
	return true, nil
}

func (r *mutationResolver) FcastResume(ctx context.Context, address string) (bool, error) {
	if err := manager.GetInstance().FCastService.Resume(address); err != nil {
		return false, err
	}
	return true, nil
}

func (r *mutationResolver) FcastSeek(ctx context.Context, address string, time float64) (bool, error) {
	if err := manager.GetInstance().FCastService.Seek(address, time); err != nil {
		return false, err
	}
	return true, nil
}

func (r *mutationResolver) FcastSetVolume(ctx context.Context, address string, volume float64) (bool, error) {
	if err := manager.GetInstance().FCastService.SetVolume(address, volume); err != nil {
		return false, err
	}
	return true, nil
}

func (r *mutationResolver) FcastStop(ctx context.Context, address string) (bool, error) {
	if err := manager.GetInstance().FCastService.Stop(address); err != nil {
		return false, err
	}
	return true, nil
}
