# Chromecast

Stash casts with Google's Cast Application Framework (CAF), not Video.js's
Chromecast tech. The local player stays on HTML5; the dongle is sent a URL it
can fetch on its own.

## Why Direct stream fails

The Default Media Receiver loads the media URL itself. It cannot send Stash
session cookies, it infers type from the path, and it does not play MKV.

`/scene/{id}/stream` is often Matroska labeled `video/mp4`. That is why the old
Video.js Cast button connected and then hung.

## What gets sent

1. H.264 + AAC (or MP3) in an `.mp4` / `.m4v` / `.mov` file → Direct stream.
2. Otherwise Original `stream.mp4` (live transcode).
3. HLS (`.m3u8`) if no MP4 endpoint exists.

Signed query params (`cid`, `expires`, `signature`) stay on the URL so auth
works without cookies. See `signed_url_expiry` in
[Configuration](../ui/v2.5/src/docs/en/Manual/Configuration.md).

## Localhost

The sender page may be `http://localhost` (Cast SDK requires a secure origin
or localhost). The Chromecast cannot fetch `127.0.0.1`. Stream URLs are
rewritten to the first address in `systemStatus.localIPs` (this machine's
reachable IPv4, excluding loopback and link-local). Vite's port `3000` is
rewritten to `9999`.

## Browser support

Works in Chrome, Edge, and Opera when Cast is enabled. Safari and Firefox do
not run the Cast sender SDK. iOS Chrome is WebKit and will not work.

The sender and the dongle must be on the same LAN. Chromecast uses Google DNS,
so a hostname the dongle cannot resolve will still fail even with a correct
file format.

## Settings

- **Enable Chromecast** — Cast button on the scene player.
- **Enable AirPlay** — separate AirPlay button. Users who already had
  Chromecast enabled keep AirPlay until they toggle it off
  (`enableAirPlay` defaults to `enableChromecast`).

## Plugin vs native

A UI plugin can overlay a working Cast button (CAF + safe URL + LAN rewrite).
It cannot change what Video.js's Chromecast *tech* sends — that tech always
loads the current player source (usually Direct stream). Native Cast therefore
does not use that tech. The local player stays on HTML5; `stashChromecast`
talks to CAF itself (`castMedia.ts`, `chromecast-button.ts`).

`systemStatus.localIPs` is the list of this machine's reachable IPv4 addresses
used to rewrite localhost stream URLs for the dongle.
