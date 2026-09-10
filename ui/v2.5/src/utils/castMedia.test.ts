import { describe, expect, it } from "vitest";
import {
  type ICastFile,
  type ICastStream,
  isLocalHost,
  pickCastSource,
  pickLanIPv4,
  rewriteCastUrl,
} from "./castMedia";

const BASE = "http://localhost:9999/scenes/42";

function stream(path: string, label: string): ICastStream {
  return { url: `http://localhost:9999${path}`, label };
}

// The endpoint list Stash builds, in the order it builds it. Every endpoint
// claims video/mp4, including the Matroska one.
const STREAMS: ICastStream[] = [
  stream("/scene/42/stream", "Direct stream"),
  stream("/scene/42/stream.mp4?resolution=ORIGINAL", "MP4"),
  stream("/scene/42/stream.mp4?resolution=FULL_HD", "MP4 Full HD (1080p)"),
  stream("/scene/42/stream.m3u8?resolution=ORIGINAL", "HLS"),
  stream("/scene/42/stream.m3u8?resolution=STANDARD", "HLS Standard (480p)"),
];

const MKV: ICastFile = {
  format: "matroska",
  video_codec: "h264",
  audio_codec: "aac",
  duration: 600,
};

const MP4: ICastFile = {
  format: "mp4",
  video_codec: "h264",
  audio_codec: "aac",
  duration: 600,
};

describe("pickCastSource", () => {
  it("refuses Direct stream for a Matroska file", () => {
    // The reported bug: the endpoint says video/mp4, the file is MKV, and the
    // Default Media Receiver sits on the splash screen forever.
    const picked = pickCastSource(STREAMS, MKV, BASE);

    expect(picked?.url).toContain("stream.mp4?resolution=ORIGINAL");
  });

  it("uses Direct stream for H.264 + AAC in an mp4", () => {
    const picked = pickCastSource(STREAMS, MP4, BASE);

    expect(picked?.url).toContain("/scene/42/stream");
    expect(picked?.url).not.toContain(".mp4?");
    expect(picked?.contentType).toBe("video/mp4");
  });

  it.each([
    ["video codec", { ...MP4, video_codec: "hevc" }],
    ["video codec", { ...MP4, video_codec: "vp9" }],
    ["audio codec", { ...MP4, audio_codec: "opus" }],
    ["container", { ...MP4, format: "avi" }],
  ])("transcodes when the %s is unsupported", (_what, file) => {
    expect(pickCastSource(STREAMS, file, BASE)?.url).toContain(".mp4?");
  });

  it("does not trust the extension over the scanned container", () => {
    // A Matroska file named .mp4 is exactly the case that used to hang: the
    // endpoint claims video/mp4 and the name agrees, but the device cannot
    // demux it.
    const mislabelled = { ...MKV, format: "matroska" };

    expect(pickCastSource(STREAMS, mislabelled, BASE)?.url).toContain(".mp4?");
  });

  it("prefers the original resolution over a downscale", () => {
    const downscaledFirst = [STREAMS[2], STREAMS[1]];

    expect(pickCastSource(downscaledFirst, MKV, BASE)?.url).toContain(
      "resolution=ORIGINAL"
    );
  });

  it("falls back to HLS when there is no mp4 endpoint", () => {
    const hlsOnly = [STREAMS[3], STREAMS[4]];
    const picked = pickCastSource(hlsOnly, MKV, BASE);

    expect(picked?.contentType).toBe("application/x-mpegURL");
    expect(picked?.url).toContain("resolution=ORIGINAL");
  });

  it("falls back to a downscaled endpoint when no original is offered", () => {
    expect(pickCastSource([STREAMS[2]], MKV, BASE)?.url).toContain("FULL_HD");
  });

  it("returns null when nothing is playable", () => {
    const webmOnly = [stream("/scene/42/stream.webm", "WEBM")];

    expect(pickCastSource(webmOnly, MKV, BASE)).toBeNull();
    expect(pickCastSource([], MKV, BASE)).toBeNull();
  });

  it("skips a stream whose url cannot be parsed", () => {
    const broken = [
      { url: ":://nonsense", label: "Direct stream" },
      STREAMS[1],
    ];

    expect(pickCastSource(broken, MKV, BASE)?.url).toContain(".mp4");
  });
});

describe("rewriteCastUrl", () => {
  it("swaps localhost for the LAN address", () => {
    const url = rewriteCastUrl(
      "http://localhost:9999/scene/42/stream.mp4",
      "192.168.1.20",
      BASE
    );

    expect(url).toBe("http://192.168.1.20:9999/scene/42/stream.mp4");
  });

  it("keeps the port the server served the url on", () => {
    const url = rewriteCastUrl(
      "http://localhost:8080/scene/42/stream.mp4",
      "192.168.1.20",
      BASE
    );

    expect(url).toBe("http://192.168.1.20:8080/scene/42/stream.mp4");
  });

  it("leaves a routable host untouched", () => {
    const lan = "http://192.168.1.20:9999/scene/42/stream.mp4";
    const public_ = "https://stash.example.com/scene/42/stream.mp4";

    expect(rewriteCastUrl(lan, "10.0.0.5", BASE)).toBe(lan);
    expect(rewriteCastUrl(public_, "10.0.0.5", BASE)).toBe(public_);
  });

  it("leaves the url alone when the server reported no LAN address", () => {
    const url = "http://localhost:9999/scene/42/stream.mp4";

    expect(rewriteCastUrl(url, "", BASE)).toBe(url);
  });

  it("keeps the signature a cookie-less device needs", () => {
    const signed =
      "http://localhost:9999/scene/42/stream.mp4?resolution=ORIGINAL&cid=1&expires=123&signature=abc";

    const url = new URL(rewriteCastUrl(signed, "192.168.1.20", BASE));

    expect(url.hostname).toBe("192.168.1.20");
    expect(url.searchParams.get("signature")).toBe("abc");
    expect(url.searchParams.get("expires")).toBe("123");
    expect(url.searchParams.get("cid")).toBe("1");
    expect(url.searchParams.get("resolution")).toBe("ORIGINAL");
  });
});

describe("pickLanIPv4", () => {
  it("prefers a private address over a public one", () => {
    expect(pickLanIPv4(["203.0.113.9", "192.168.1.20"])).toBe("192.168.1.20");
    expect(pickLanIPv4(["203.0.113.9", "10.1.2.3"])).toBe("10.1.2.3");
    expect(pickLanIPv4(["203.0.113.9", "172.16.4.5"])).toBe("172.16.4.5");
  });

  it("does not mistake 172.32 for a private range", () => {
    expect(pickLanIPv4(["172.32.0.1", "10.0.0.1"])).toBe("10.0.0.1");
  });

  it("falls back to the first address when none are private", () => {
    expect(pickLanIPv4(["203.0.113.9", "198.51.100.4"])).toBe("203.0.113.9");
  });

  it("returns an empty string when the server reported nothing", () => {
    expect(pickLanIPv4([])).toBe("");
    expect(pickLanIPv4(null)).toBe("");
    expect(pickLanIPv4(undefined)).toBe("");
  });
});

describe("isLocalHost", () => {
  it.each(["localhost", "127.0.0.1", "[::1]", "::1"])("matches %s", (host) => {
    expect(isLocalHost(host)).toBe(true);
  });

  it.each([
    "192.168.1.20",
    "stash.example.com",
    "localhost.example.com",
  ])("does not match %s", (host) => {
    expect(isLocalHost(host)).toBe(false);
  });
});
