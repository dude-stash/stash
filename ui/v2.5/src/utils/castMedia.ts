// Choosing a stream for a cast device, and making its URL reachable.
//
// A cast device fetches the media itself, so it needs a URL that resolves from
// the network rather than from this browser, and a container it can actually
// decode. The scene player cannot simply forward what it is playing: Stash
// labels every direct stream video/mp4 even when the file is Matroska, which
// the browser tolerates and a Chromecast does not.
//
// Pure by design - no Video.js, no Cast SDK, no DOM beyond an injectable base
// URL - so the decisions here can be unit-tested.

export interface ICastStream {
  url: string;
  mime_type?: string | null;
  label?: string | null;
}

export interface ICastFile {
  path: string;
  video_codec: string;
  audio_codec: string;
  duration: number;
}

export interface ICastSource {
  url: string;
  contentType: string;
  label: string;
  // true when the server transcodes on demand, so the first fetch is slow
  transcode: boolean;
}

const MIME_MP4 = "video/mp4";
const MIME_HLS = "application/x-mpegURL";

// The Vite dev server runs the UI here while the backend stays on its own port.
const DEV_UI_PORT = "3000";
const DEFAULT_STASH_PORT = "9999";

export function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

/**
 * Picks the address to advertise to a cast device from the list the server
 * reports. A private LAN address is preferred: the device is on the same
 * network, so a public address would leave the LAN and come back, if at all.
 */
export function pickLanIPv4(ips: readonly string[] | null | undefined): string {
  if (!ips?.length) return "";
  return ips.find(isPrivateIPv4) ?? ips[0];
}

interface IParsedStream {
  stream: ICastStream;
  pathname: string;
  // "ORIGINAL", "FULL_HD", ... Absent on the direct stream.
  resolution: string | null;
}

function parseStreams(
  streams: readonly ICastStream[],
  base: string
): IParsedStream[] {
  const parsed: IParsedStream[] = [];

  for (const stream of streams) {
    try {
      const url = new URL(stream.url, base);
      parsed.push({
        stream,
        pathname: url.pathname,
        resolution: url.searchParams.get("resolution"),
      });
    } catch {
      // a stream we cannot parse is a stream we cannot cast
    }
  }

  return parsed;
}

/**
 * Whether the file plays on a cast device as-is. Only H.264 video with AAC-family
 * audio in an MP4 container is safe; anything else has to be transcoded, whatever
 * MIME type the endpoint claims.
 */
function isDirectFriendly(file?: ICastFile): boolean {
  if (!file) return false;

  const h264 = /h264|avc/i.test(file.video_codec);
  const aac = /^(aac|mp3|mp4a)/i.test(file.audio_codec);
  const mp4 = /\.(mp4|m4v|mov)$/i.test(file.path);

  return h264 && aac && mp4;
}

interface ICandidate {
  contentType: string;
  transcode: boolean;
  fallbackLabel: string;
  // Skips the candidate entirely when it returns false.
  applies?: (file?: ICastFile) => boolean;
  matches: (parsed: IParsedStream) => boolean;
}

// Tried in order. Original-resolution endpoints come before the downscaled ones
// so the device gets the best quality it can handle.
//
// Note the resolution check: the original-resolution endpoints are labelled
// plainly ("MP4", "HLS") with no suffix, and only the query string says
// ORIGINAL. Matching on label text would silently never fire.
const CANDIDATES: ICandidate[] = [
  {
    contentType: MIME_MP4,
    transcode: false,
    fallbackLabel: "Direct stream",
    applies: isDirectFriendly,
    matches: ({ pathname }) => pathname.endsWith("/stream"),
  },
  {
    contentType: MIME_MP4,
    transcode: true,
    fallbackLabel: "MP4",
    matches: ({ pathname, resolution }) =>
      pathname.endsWith(".mp4") && resolution === "ORIGINAL",
  },
  {
    contentType: MIME_MP4,
    transcode: true,
    fallbackLabel: "MP4",
    matches: ({ pathname }) => pathname.endsWith(".mp4"),
  },
  {
    contentType: MIME_HLS,
    transcode: true,
    fallbackLabel: "HLS",
    matches: ({ pathname, resolution }) =>
      pathname.endsWith(".m3u8") && resolution === "ORIGINAL",
  },
  {
    contentType: MIME_HLS,
    transcode: true,
    fallbackLabel: "HLS",
    matches: ({ pathname }) => pathname.endsWith(".m3u8"),
  },
];

/**
 * Chooses the stream to hand to a cast device, or null when none of them will
 * play there.
 */
export function pickCastSource(
  streams: readonly ICastStream[],
  file?: ICastFile,
  base: string = window.location.href
): ICastSource | null {
  const parsed = parseStreams(streams, base);

  for (const candidate of CANDIDATES) {
    if (candidate.applies && !candidate.applies(file)) continue;

    const found = parsed.find(candidate.matches);
    if (!found) continue;

    return {
      url: found.stream.url,
      contentType: candidate.contentType,
      label: found.stream.label || candidate.fallbackLabel,
      transcode: candidate.transcode,
    };
  }

  return null;
}

/**
 * Points a localhost URL at an address the cast device can reach. Anything
 * already on a routable host is returned untouched, as is everything when the
 * server reported no LAN address.
 *
 * Only the Vite dev port is corrected: a URL on any other port is already on
 * the port Stash serves from.
 */
export function rewriteCastUrl(
  rawUrl: string,
  lanIp: string,
  base: string = window.location.href
): string {
  const url = new URL(rawUrl, base);

  if (!lanIp || !isLocalHost(url.hostname)) {
    return url.toString();
  }

  url.hostname = lanIp;
  if (url.port === DEV_UI_PORT) {
    url.port = DEFAULT_STASH_PORT;
  }

  return url.toString();
}

/**
 * Asks Stash for the first bytes of a transcoded stream so ffmpeg is already
 * running when the device asks for it. Without this the device waits on a cold
 * transcode and often gives up first.
 *
 * Fire and forget: a failure here only costs the head start.
 */
export async function warmupCastUrl(url: string): Promise<void> {
  const isHls = url.includes(".m3u8");
  const init: RequestInit = { method: "GET", credentials: "include" };
  if (!isHls) {
    init.headers = { Range: "bytes=0-2047" };
  }

  try {
    const response = await fetch(url, init);
    await response.body?.cancel();
  } catch {
    // no head start, but the device can still fetch it itself
  }
}
