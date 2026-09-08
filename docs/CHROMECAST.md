# Chromecast

Fixes [stashapp/stash#4136](https://github.com/stashapp/stash/issues/4136):
the Cast button connected, then the TV sat on a Cast icon and never played.

Chromecast is implemented in the Stash app. A UI plugin cannot do this on its
own. The dongle loads a URL itself (no cookies, Google DNS, no `localhost`),
and the old Video.js Chromecast *tech* always sent whatever the player was
playing — usually Direct stream, often MKV labeled `video/mp4`.

## Why it hung

The Default Media Receiver fetches the media URL. It does not send the
browser's session cookie, it infers type from the path, and it does not play
MKV.

`/scene/{id}/stream` is frequently Matroska. The sender page may be
`http://localhost` (required by the Cast SDK). The dongle cannot fetch
`127.0.0.1`. Hostnames often fail because Chromecast uses Google DNS, so a
LAN-only name never resolves. Issue comments that "fixed" it with NAT/DNS or
by casting the raw IP were working around that last part, not the MKV/cookie
bugs.

## What the app has to provide

| Piece | Why a plugin is not enough |
| --- | --- |
| `systemStatus.localIPs` | The browser cannot list this machine's reachable IPv4. Stash enumerates interfaces (no loopback/link-local) so localhost stream URLs can be rewritten to a LAN address the dongle can fetch. |
| Chromecast-safe source | Native Video.js Cast always sent the current source. Stash picks Direct only for H.264/AAC in `.mp4` / `.m4v` / `.mov`; otherwise Original `stream.mp4`, else HLS. |
| Signed URLs | `cid`, `expires`, `signature` are already on stream URLs so auth works without cookies. See `signed_url_expiry` in [Configuration](../ui/v2.5/src/docs/en/Manual/Configuration.md). |
| CAF, not the Video.js tech | `@silvermine/videojs-chromecast` is gone. HTML5 plays locally; `stashChromecast` talks to Google's Cast Application Framework (`castMedia.ts`, `chromecast-button.ts`). |
| Remote control | Play, pause, seek, skip, and scene changes must wrap Video.js. A plugin overlay cannot own those APIs. |

## Localhost and LAN

Open Stash at **HTTPS** or **`http://localhost`**. The Cast SDK will not run on
`http://192.168.x.x`. Stream URLs are rewritten to the first address in
`systemStatus.localIPs`. The Vite UI port `3000` is rewritten to `9999`.

If you open Stash by a custom hostname, the dongle must resolve that name
(Google DNS). Prefer the automatic LAN IP rewrite, or use a hostname that
public DNS (or a DNS NAT toward your resolver) can answer.

The sender and the dongle must be on the same LAN.

## Browser support

Chrome, Edge, and Opera. Safari and Firefox do not run the Cast sender SDK.
iOS Chrome is WebKit and will not work.

## Remote control

While connected, the scene player is the remote: `play` / `pause` /
`currentTime` go to CAF `RemotePlayer`. Changing scene calls `loadMedia`
again. The local `<video>` stays paused; the poster stays up. When Cast
finishes (`idleReason` `FINISHED`), the player fires `ended` so playlists
continue.

## Settings

- **Enable Chromecast** — Cast button on the scene player.
- **Enable AirPlay** — separate AirPlay button. If unset, it follows
  Chromecast (`enableAirPlay` defaults to `enableChromecast`).
