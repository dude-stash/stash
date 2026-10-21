package api

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"net/url"
	"os"
	"slices"
	"strconv"
	"strings"

	"github.com/stashapp/stash/internal/api/urlbuilders"
	"github.com/stashapp/stash/internal/manager"
	castproto "github.com/stashapp/stash/pkg/chromecast"
	"github.com/stashapp/stash/pkg/ffmpeg"
	"github.com/stashapp/stash/pkg/models"
	"github.com/stashapp/stash/pkg/session"
	"github.com/stashapp/stash/pkg/signedurl"
)

// formats the Default Media Receiver plays directly; anything else is sent as HLS
var (
	chromecastDirectContainers = map[ffmpeg.Container]string{
		ffmpeg.Mp4:      ffmpeg.MimeMp4Video,
		ffmpeg.M4v:      ffmpeg.MimeMp4Video,
		ffmpeg.Mov:      "video/quicktime",
		ffmpeg.Webm:     "video/webm",
		ffmpeg.Matroska: "video/x-matroska",
	}
	chromecastDirectVideoCodecs = []string{ffmpeg.H264, ffmpeg.H265, ffmpeg.Hevc, ffmpeg.Vp9}
	// the receiver plays other audio, such as AC3 or DTS, silently instead of failing, so those files are sent as HLS
	chromecastDirectAudioCodecs = []ffmpeg.ProbeAudioCodec{"", ffmpeg.Aac, ffmpeg.Mp3, ffmpeg.Opus, ffmpeg.Vorbis, "flac"}
)

func (r *mutationResolver) ChromecastPlay(ctx context.Context, input ChromecastPlayInput) (bool, error) {
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

	svc := manager.GetInstance().ChromecastService
	ip, err := svc.Connect(ctx, input.Address)
	if err != nil {
		return false, fmt.Errorf("connecting to Chromecast %s: %w", input.Address, err)
	}

	startTime := 0.0
	if input.Time != nil {
		startTime = *input.Time
	}

	// files in zips can't be checked directly, and are left to the stream to report
	if file.ZipFileID == nil {
		if _, err := os.Stat(file.Path); err != nil {
			msg := fmt.Sprintf("Can't read %s: %v", file.Path, err)
			if errors.Is(err, fs.ErrNotExist) {
				msg = "File not found: " + file.Path
			}
			// reported through the session, so the page stays connected for the next scene
			return true, svc.Fail(input.Address, sceneID, startTime, msg)
		}
	}

	baseURL, err := chromecastBaseURL(ip, r.castMedia)
	if err != nil {
		return false, err
	}

	// stream URLs must use an address the device can reach, not the one the browser used
	ctx = context.WithValue(ctx, BaseURLCtxKey, baseURL)
	streams, err := r.Query().SceneStreams(ctx, &input.SceneID)
	if err != nil {
		return false, err
	}

	load, fallback, err := chromecastLoads(streams, chromecastDirectContentType(scene, file))
	if err != nil {
		return false, err
	}

	load.CurrentTime = startTime

	thumbnail, err := url.Parse(urlbuilders.NewSceneURLBuilder(baseURL, scene).GetScreenshotURL())
	if err != nil {
		return false, err
	}
	if err := signDeviceURL(ctx, thumbnail); err != nil {
		return false, err
	}
	load.Media.Metadata = &castproto.Metadata{
		Title:  scene.GetTitle(),
		Images: []castproto.Image{{URL: thumbnail.String()}},
	}
	if fallback != nil {
		fallback.Media.Metadata = load.Media.Metadata
	}

	if err := svc.Play(input.Address, sceneID, load, fallback); err != nil {
		return false, err
	}
	return true, nil
}

// chromecastBaseURL returns the address that Cast devices load media from. It is always plain HTTP, as they don't accept Stash's own certificate, so castMedia serves it when Stash uses HTTPS.
func chromecastBaseURL(ip net.IP, castMedia *castMediaServer) (string, error) {
	c := manager.GetInstance().Config

	host := c.GetHost()
	if host == "localhost" {
		host = "127.0.0.1"
	}
	if hostIP := net.ParseIP(host); hostIP != nil {
		if hostIP.IsLoopback() {
			return "", fmt.Errorf("stash only listens on %s, which the Chromecast can't reach: set the host to 0.0.0.0 to cast", c.GetHost())
		}
		if !hostIP.IsUnspecified() {
			ip = hostIP
		}
	}

	port := c.GetPort()
	if castMedia != nil {
		var err error
		if port, err = castMedia.Port(); err != nil {
			return "", err
		}
	}

	return "http://" + net.JoinHostPort(ip.String(), strconv.Itoa(port)), nil
}

// chromecastLoads returns the stream to load, and an HLS stream to fall back to if the device can't play it. The direct stream is only used if directContentType is set.
func chromecastLoads(streams []*manager.SceneStreamEndpoint, directContentType string) (castproto.LoadRequest, *castproto.LoadRequest, error) {
	var direct, hls *castproto.LoadRequest
	for _, s := range streams {
		u, err := url.Parse(s.URL)
		if err != nil {
			continue
		}

		switch {
		case strings.HasSuffix(u.Path, "/stream") && directContentType != "":
			direct = chromecastLoad(s.URL, directContentType)
		case strings.HasSuffix(u.Path, ".m3u8") && hls == nil:
			// the first HLS stream has the highest resolution
			hls = chromecastLoad(s.URL, ffmpeg.MimeHLS)
			hls.Media.HLSSegmentFormat = "ts"
			hls.Media.HLSVideoSegmentFormat = "mpeg2_ts"
		}
	}

	switch {
	case direct != nil:
		return *direct, hls, nil
	case hls != nil:
		return *hls, nil, nil
	default:
		return castproto.LoadRequest{}, nil, errors.New("no stream available to cast")
	}
}

func chromecastLoad(url, contentType string) *castproto.LoadRequest {
	return &castproto.LoadRequest{
		Media: castproto.MediaInfo{
			ContentID:   url,
			ContentType: contentType,
			StreamType:  "BUFFERED",
		},
		Autoplay: true,
	}
}

func chromecastDirectContentType(scene *models.Scene, file *models.VideoFile) string {
	// the direct stream serves the generated MP4 transcode when there is one
	if manager.HasTranscode(scene, manager.GetInstance().Config.GetVideoFileNamingAlgorithm()) {
		return ffmpeg.MimeMp4Video
	}

	container, err := manager.GetVideoFileContainer(file)
	if err != nil || !slices.Contains(chromecastDirectVideoCodecs, file.VideoCodec) || !slices.Contains(chromecastDirectAudioCodecs, ffmpeg.ProbeAudioCodec(file.AudioCodec)) {
		return ""
	}
	return chromecastDirectContainers[container]
}

// signDeviceURL lets the device load u without the browser's session cookie.
func signDeviceURL(ctx context.Context, u *url.URL) error {
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

func (r *mutationResolver) ChromecastPause(ctx context.Context, address string) (bool, error) {
	if err := manager.GetInstance().ChromecastService.Pause(address); err != nil {
		return false, err
	}
	return true, nil
}

func (r *mutationResolver) ChromecastResume(ctx context.Context, address string) (bool, error) {
	if err := manager.GetInstance().ChromecastService.Resume(address); err != nil {
		return false, err
	}
	return true, nil
}

func (r *mutationResolver) ChromecastSeek(ctx context.Context, address string, time float64) (bool, error) {
	if err := manager.GetInstance().ChromecastService.Seek(address, time); err != nil {
		return false, err
	}
	return true, nil
}

func (r *mutationResolver) ChromecastSetVolume(ctx context.Context, address string, volume float64) (bool, error) {
	if err := manager.GetInstance().ChromecastService.SetVolume(address, volume); err != nil {
		return false, err
	}
	return true, nil
}

func (r *mutationResolver) ChromecastSetMuted(ctx context.Context, address string, muted bool) (bool, error) {
	if err := manager.GetInstance().ChromecastService.SetMuted(address, muted); err != nil {
		return false, err
	}
	return true, nil
}

func (r *mutationResolver) ChromecastStop(ctx context.Context, address string) (bool, error) {
	if err := manager.GetInstance().ChromecastService.Stop(address); err != nil {
		return false, err
	}
	return true, nil
}
