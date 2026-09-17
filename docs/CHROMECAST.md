# Chromecast

## Why not a Video.js tech

Stash used `@silvermine/videojs-chromecast`, which plugs in as a Video.js
*tech*. A tech is a playback backend, so when it takes over it loads
`player.currentSource()` onto the receiver — whatever the browser had chosen
for itself. That is wrong twice over, and it is why casting used to connect and
then hang on the Cast splash screen ([#4136]).

- **The source is picked for a browser.** Every stream endpoint reports
  `video/mp4` regardless of the real container, deliberately, since browsers
  refuse an unfamiliar MIME type. Chrome tolerates a mislabelled Matroska file;
  the Default Media Receiver does not decode Matroska at all.
- **The URL is built from this browser's origin.** Usually
  `http://localhost:9999`, which a Chromecast resolves to itself.

So the scene player drives Google's Cast Application Framework directly and
chooses both the stream and the address.

## Things that bite

- The Cast **sender** only initialises on HTTPS or `http://localhost`, while
  the **receiver** cannot fetch `localhost`. Both hold at once, which is why
  the page stays put and only the media URL is rewritten, using
  `systemStatus.localIPs` from `pkg/utils/net.go`.
- Judge the container by `VideoFile.format`, never the extension.
  `MatchContainer` reads the file's magic bytes at scan time precisely because
  Matroska files are routinely named `.mp4`.
- Chromecast resolves hostnames through Google's DNS, so a LAN-only name never
  answers. The LAN address avoids the question.
- The device sends no cookies. Stream URLs are signed ([#6529]) with a
  prefix-scoped HMAC, so rewriting must keep the query parameters.
- The first transcoded cast is slow: `getTranscodeStream` spawns a fresh ffmpeg
  per request and nothing keeps it warm. Prefetching from the browser does not
  help — cancelling the prefetch kills that ffmpeg.

[#4136]: https://github.com/stashapp/stash/issues/4136
[#6529]: https://github.com/stashapp/stash/pull/6529
