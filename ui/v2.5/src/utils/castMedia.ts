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

export interface IPickedCastStream {
  url: string;
  contentType: string;
  label: string;
  transcode: boolean;
}

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

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

export function isCastCapableBrowser(userAgent = navigator.userAgent): boolean {
  if (/CriOS|FxiOS/i.test(userAgent)) return false;
  return /Chrome|Chromium|Edg\/|OPR\//.test(userAgent);
}

export function pickLanIPv4(ips: string[] | null | undefined): string {
  if (!ips?.length) return "";
  return ips.find(isPrivateIPv4) ?? ips[0] ?? "";
}

function pathnameOf(streamUrl: string): string {
  try {
    return new URL(streamUrl, window.location.href).pathname;
  } catch {
    return "";
  }
}

function isDirectFriendly(file?: ICastFile): boolean {
  if (!file) return false;
  const codec = file.video_codec.toLowerCase();
  const audio = file.audio_codec.toLowerCase();
  const path = file.path.toLowerCase();
  const h264 = /h264|avc/.test(codec);
  const aac = /^(aac|mp3|mp4a)/.test(audio);
  const mp4 = /\.(mp4|m4v|mov)$/.test(path);
  return h264 && aac && mp4;
}

export function pickCastStream(
  streams: ICastStream[],
  file?: ICastFile,
  preferHls = false
): IPickedCastStream | null {
  const findBy = (test: (s: ICastStream) => boolean) =>
    streams.find(test) ?? null;

  if (preferHls) {
    const hls =
      findBy(
        (s) =>
          pathnameOf(s.url).includes(".m3u8") && /original/i.test(s.label || "")
      ) || findBy((s) => pathnameOf(s.url).includes(".m3u8"));
    if (hls) {
      return {
        url: hls.url,
        contentType: "application/x-mpegURL",
        label: hls.label || "HLS",
        transcode: true,
      };
    }
  }

  if (isDirectFriendly(file)) {
    const direct = findBy((s) => {
      const path = pathnameOf(s.url);
      return /(^|\/)stream$/.test(path) || s.label === "Direct stream";
    });
    if (direct) {
      return {
        url: direct.url,
        contentType: "video/mp4",
        label: direct.label || "Direct stream",
        transcode: false,
      };
    }
  }

  const mp4 =
    findBy(
      (s) =>
        pathnameOf(s.url).includes(".mp4") && /original/i.test(s.label || "")
    ) || findBy((s) => pathnameOf(s.url).includes(".mp4"));
  if (mp4) {
    return {
      url: mp4.url,
      contentType: "video/mp4",
      label: mp4.label || "MP4",
      transcode: true,
    };
  }

  const hls = findBy((s) => pathnameOf(s.url).includes(".m3u8"));
  if (hls) {
    return {
      url: hls.url,
      contentType: "application/x-mpegURL",
      label: hls.label || "HLS",
      transcode: true,
    };
  }

  return null;
}

export function rewriteCastUrl(
  rawUrl: string,
  lanIp: string,
  stashPort: string | number = DEFAULT_STASH_PORT
): string {
  const url = new URL(rawUrl, window.location.href);
  if (!isLocalHost(url.hostname) || !lanIp) {
    return url.toString();
  }

  url.hostname = lanIp;
  if (!url.port || url.port === DEV_UI_PORT) {
    url.port = String(stashPort);
  }
  return url.toString();
}

export function warmupCastUrl(url: string, isHls: boolean): Promise<boolean> {
  const opts: RequestInit = { method: "GET", credentials: "include" };
  if (!isHls) {
    opts.headers = { Range: "bytes=0-2047" };
  }
  return fetch(url, opts)
    .then((res) => {
      void res.body?.cancel?.();
      return res.ok || res.status === 206;
    })
    .catch(() => false);
}
