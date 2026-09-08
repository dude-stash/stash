# Chromecast

Notes for anyone touching `ui/v2.5/src/components/ScenePlayer/cast/`.

## Why not a Video.js tech

Stash used `@silvermine/videojs-chromecast`, which plugs in as a Video.js
*tech*. A tech is a playback backend, so when it takes over it loads
`player.currentSource()` onto the receiver — whatever the browser had chosen
for itself. That is wrong twice over, and it is why casting used to connect and
then hang on the Cast splash screen ([#4136]).

- **The source is picked for a browser.** The first stream endpoint is the
  direct stream, and every endpoint reports `video/mp4` regardless of the real
  container — deliberately, since browsers refuse to try an unfamiliar MIME
  type. Chrome tolerates a mislabelled Matroska file. The Default Media
  Receiver does not decode Matroska at all.
- **The URL is built from this browser's origin.** That is usually
  `http://localhost:9999`, and a Chromecast resolves `localhost` to itself.

So the scene player drives Google's Cast Application Framework directly and
chooses both the stream and the address.

## The pieces

| File | Responsibility |
| --- | --- |
| `utils/castMedia.ts` | Pure. Picks a stream the device can decode and rewrites the URL. No Video.js, no Cast SDK, no DOM — the only part with unit tests |
| `cast/sdk.ts` | The only file touching `window.cast`. Loads the sender SDK once and returns a configured context, or null |
| `cast/session.ts` | Connection state, connect and disconnect, loading media |
| `cast/plugin.ts` | The Video.js button, and the glue to the scene player |

## Constraints worth remembering

- The Cast **sender** only initialises on HTTPS or `http://localhost`. The Cast
  **receiver** cannot fetch `localhost`. Both hold at the same time, which is
  why the page stays where it is and only the media URL is rewritten, using
  `systemStatus.localIPs` from `pkg/utils/net.go`.
- Chromecast resolves hostnames through Google's DNS, so a LAN-only name will
  not resolve on the device. The LAN address avoids the question.
- The device sends no cookies. Stream URLs are signed ([#6529]) with a
  prefix-scoped HMAC, so one signature covers the stream and its segments.
  Signed query parameters must survive URL rewriting.
- Endpoint **labels are not a reliable key**. The original-resolution endpoints
  are labelled plainly (`MP4`, `HLS`); only the query string says
  `resolution=ORIGINAL`.
- A transcoded stream is requested once before the device is told about it, so
  ffmpeg is already running when the device asks. Without that head start the
  device often gives up first.

[#4136]: https://github.com/stashapp/stash/issues/4136
[#6529]: https://github.com/stashapp/stash/pull/6529
