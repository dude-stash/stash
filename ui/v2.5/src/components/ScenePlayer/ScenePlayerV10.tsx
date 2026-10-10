import React, {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "@videojs/html/video/player";
import "@videojs/html/extensions/google-cast";
import cx from "classnames";
import { FormattedMessage } from "react-intl";
import * as GQL from "src/core/generated-graphql";
import { objectTitle } from "src/core/files";
import { useConfigurationContext } from "src/hooks/Config";
import { PatchFunction } from "src/patch";
import { languageMap } from "src/utils/caption";
import ScreenUtils from "src/utils/screen";
import { ScenePlayerScrubber } from "./ScenePlayerScrubber";
import { VIDEO_PLAYER_ID } from "./util";
import { Skin } from "./v10/Skin";
import { SkipButton } from "./v10/controls";
import { PlayerElement, seekBy } from "./v10/store";

type StreamKind = "direct" | "hls" | "dash";

interface IStream {
  kind: StreamKind;
  url: string;
  label: string;
}

const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

const FALLBACK_ORDER: StreamKind[] = ["direct", "hls", "dash"];

// hls.js and dash.js are only downloaded once a scene needs them.
const loadMediaElement: Record<StreamKind, () => Promise<unknown>> = {
  direct: () => Promise.resolve(),
  hls: () => import("@videojs/html/media/hlsjs-video"),
  dash: () => import("@videojs/html/media/dash-video"),
};

function getStreamKind(url: string): StreamKind | undefined {
  const { pathname } = new URL(url, window.location.href);
  if (pathname.endsWith("/stream")) return "direct";
  if (pathname.endsWith("/stream.m3u8")) return "hls";
  if (pathname.endsWith("/stream.mpd")) return "dash";
  return undefined;
}

// MP4, WebM and MKV transcodes can only seek with an offset like v7's live.ts, so they are left out.
function getStreams(scene: GQL.SceneDataFragment): IStream[] {
  return scene.sceneStreams.flatMap((stream) => {
    const kind = getStreamKind(stream.url);
    return kind ? [{ kind, url: stream.url, label: stream.label ?? kind }] : [];
  });
}

// A media error looks the same for a missing file and an unsupported one, so ask the server.
async function isFileMissing(url: string) {
  const controller = new AbortController();
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.status === 404;
  } catch {
    return false;
  } finally {
    controller.abort();
  }
}

function getFallback(streams: IStream[], current: IStream) {
  const kinds = FALLBACK_ORDER.slice(FALLBACK_ORDER.indexOf(current.kind) + 1);
  for (const kind of kinds) {
    const stream = streams.find((s) => s.kind === kind);
    if (stream) return stream;
  }
  return undefined;
}

interface IScenePlayerProps {
  scene: GQL.SceneDataFragment;
  hideScrubberOverride: boolean;
  autoplay?: boolean;
  permitLoop?: boolean;
  initialTimestamp: number;
  sendSetTimestamp: (setTimestamp: (value: number) => void) => void;
  onComplete: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

const ScenePlayerV10Component: React.FC<IScenePlayerProps> = ({
  scene,
  hideScrubberOverride,
  sendSetTimestamp,
  onNext,
  onPrevious,
}) => {
  const { configuration } = useConfigurationContext();
  const castEnabled = configuration?.ui.enableChromecast ?? false;

  const [player, setPlayer] = useState<PlayerElement | null>(null);
  const store = player?.store;
  const containerRef = useRef<HTMLElement>(null);
  const [media, setMedia] = useState<HTMLVideoElement | null>(null);
  const mediaRef = useCallback(
    (el: HTMLElement | null) => setMedia(el as HTMLVideoElement | null),
    []
  );

  const [stream, setStream] = useState<IStream>();
  const [missingFile, setMissingFile] = useState(false);
  const [loadedKinds, setLoadedKinds] = useState<StreamKind[]>(["direct"]);
  const [time, setTime] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showScrubber, setShowScrubber] = useState(false);

  const sceneId = useRef<string>();
  // Where and whether to play once the next source has loaded, so a fallback carries on from the same point.
  const pendingStart = useRef<number>();
  const pendingPlay = useRef(false);
  const pausedBeforeScrubber = useRef(true);

  const file = useMemo(
    () => (scene.files.length > 0 ? scene.files[0] : undefined),
    [scene]
  );
  const streams = useMemo(() => getStreams(scene), [scene]);

  const captions = useMemo(() => {
    const captionPath = scene.paths.caption;
    if (!captionPath || !scene.captions?.length) return [];

    const languageCode = window.navigator.language.split(/[-_]/)[0];
    let hasDefault = false;

    return scene.captions.map((caption) => {
      const lang = caption.language_code;
      const url = new URL(captionPath, window.location.href);
      url.searchParams.set("lang", lang);
      url.searchParams.set("type", caption.caption_type);

      const isDefault = !hasDefault && lang === languageCode;
      hasDefault ||= isDefault;

      return {
        src: url.toString(),
        srcLang: lang,
        label: `${languageMap.get(lang) ?? lang} (${caption.caption_type})`,
        isDefault,
      };
    });
  }, [scene]);

  // Only a new scene resets the stream, not a config or prop change.
  useEffect(() => {
    if (scene.id === sceneId.current) return;
    sceneId.current = scene.id;

    pendingStart.current = undefined;
    pendingPlay.current = false;
    setTime(0);
    setMissingFile(false);
    setStream(streams[0]);
    containerRef.current?.focus({ preventScroll: true });
  }, [scene, streams]);

  useEffect(() => {
    if (!stream || loadedKinds.includes(stream.kind)) return;

    const { kind } = stream;
    let cancelled = false;
    loadMediaElement[kind]().then(() => {
      if (!cancelled) setLoadedKinds((kinds) => [...kinds, kind]);
    });
    return () => {
      cancelled = true;
    };
  }, [stream, loadedKinds]);

  useEffect(() => {
    // Right after a source or scene change the old media is still loaded, and must not use up the new source's pending seek and play.
    if (!media || !stream || media.getAttribute("src") !== stream.url) return;
    if (!streams.some((s) => s.url === stream.url)) return;
    const el = media;
    const current = stream;
    let active = true;

    function fallBack() {
      const next = getFallback(streams, current);
      if (!next) return;
      pendingStart.current = el.currentTime || pendingStart.current;
      pendingPlay.current ||= !el.paused;
      setStream(next);
    }

    function onLoadedMetadata() {
      // A direct stream whose video codec the browser can't decode loads as audio only.
      if (current.kind === "direct" && el.videoWidth === 0) {
        fallBack();
        return;
      }

      if (pendingStart.current) {
        el.currentTime = pendingStart.current;
        pendingStart.current = undefined;
      }
      if (pendingPlay.current) {
        pendingPlay.current = false;
        el.play().catch(() => {});
      }
    }

    async function onError() {
      const code = el.error?.code;
      if (code !== MEDIA_ERR_DECODE && code !== MEDIA_ERR_SRC_NOT_SUPPORTED) {
        return;
      }

      // Every other stream is transcoded from the same file, so there is nothing to fall back to.
      if (current.kind === "direct" && (await isFileMissing(current.url))) {
        if (!active) return;
        store?.dismissError();
        setMissingFile(true);
        return;
      }

      if (active) fallBack();
    }

    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.addEventListener("error", onError);
    if (el.readyState >= 1) onLoadedMetadata();

    return () => {
      active = false;
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
      el.removeEventListener("error", onError);
    };
  }, [media, stream, streams, store]);

  useEffect(() => {
    if (!store) return;

    return store.subscribe(() => {
      setFullscreen(store.isFullscreen);
      if (!store.paused) setTime(store.currentTime);
    });
  }, [store]);

  useEffect(() => {
    sendSetTimestamp((value: number) => {
      if (!store || value < 0) return;
      store.seek(value);
      if (!store.started || !store.paused) store.play().catch(() => {});
    });
  }, [sendSetTimestamp, store]);

  useEffect(() => {
    if (hideScrubberOverride || fullscreen) {
      setShowScrubber(false);
      return;
    }

    const onResize = () => {
      setShowScrubber(window.innerHeight >= 450 && !ScreenUtils.isMobile());
    };
    onResize();

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [hideScrubberOverride, fullscreen]);

  function onScrubberScroll() {
    if (!store?.started) return;
    pausedBeforeScrubber.current = store.paused;
    store.pause();
  }

  function onScrubberSeek(seconds: number) {
    if (!store) return;
    store.seek(seconds);
    setTime(seconds);
    if (store.started && !pausedBeforeScrubber.current) {
      store.play().catch(() => {});
    }
  }

  // Space always plays or pauses, even with a control focused, as in v7.
  function onKeyDownCapture(event: KeyboardEvent) {
    if (event.key !== " " || !store) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (store.paused) store.play().catch(() => {});
    else store.pause();
  }

  // The rest of v7's shortcuts are declared on the skin's media-hotkey elements.
  function onKeyDown(event: KeyboardEvent) {
    if (!store) return;

    if (event.key === "MediaTrackNext") onNext();
    if (event.key === "MediaTrackPrevious") onPrevious();

    if (event.shiftKey && event.key.toLowerCase() === "l") {
      media?.toggleAttribute("loop", !media.loop);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    switch (event.key) {
      case "]":
        if (store.currentTime + store.duration * 0.1 < store.duration) {
          seekBy(store, store.duration * 0.1);
        }
        break;
      case "[":
        seekBy(store, -store.duration * 0.1);
        break;
    }
  }

  const poster = scene.paths.screenshot ?? undefined;
  const tracks = (
    <>
      {captions.map((caption) => (
        <track
          key={caption.src}
          kind="captions"
          src={caption.src}
          srcLang={caption.srcLang}
          label={caption.label}
          default={caption.isDefault}
        />
      ))}
      {scene.paths.vtt && (
        <track
          kind="metadata"
          label="thumbnails"
          src={scene.paths.vtt}
          default
        />
      )}
    </>
  );

  function renderMedia() {
    if (!stream || !loadedKinds.includes(stream.kind)) return null;

    switch (stream.kind) {
      case "hls":
        return (
          <hlsjs-video
            key="hls"
            ref={mediaRef}
            src={stream.url}
            poster={poster}
            crossorigin="anonymous"
            playsinline=""
          >
            {tracks}
          </hlsjs-video>
        );
      case "dash":
        return (
          <dash-video
            key="dash"
            ref={mediaRef}
            src={stream.url}
            poster={poster}
            crossorigin="anonymous"
            playsinline=""
          >
            {tracks}
          </dash-video>
        );
      default:
        return (
          <video
            key="direct"
            ref={mediaRef}
            src={stream.url}
            poster={poster}
            crossOrigin="anonymous"
            playsInline
            preload="metadata"
          >
            {tracks}
          </video>
        );
    }
  }

  const isPortrait = file?.height && file?.width && file.height > file.width;

  return (
    <div
      className={cx("VideoPlayer", "videojs-10", {
        portrait: isPortrait,
        "no-file": !file,
      })}
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={onKeyDown}
    >
      <div id={VIDEO_PLAYER_ID} className="video-wrapper">
        <video-player ref={setPlayer} content-title={objectTitle(scene)}>
          <Skin
            containerRef={containerRef}
            remotePlayback={castEnabled}
            media={renderMedia()}
            controlsBeforePlay={
              <SkipButton direction="previous" onClick={onPrevious} />
            }
            controlsAfterPlay={<SkipButton direction="next" onClick={onNext} />}
          >
            {missingFile && (
              <div className="videojs-10-missing-file">
                <h5>
                  <FormattedMessage id="errors.file_not_found" />
                </h5>
                <span>{file?.path}</span>
              </div>
            )}
          </Skin>
          {castEnabled && <google-cast />}
        </video-player>
      </div>
      {file && showScrubber && (
        <ScenePlayerScrubber
          file={file}
          scene={scene}
          time={time}
          onSeek={onScrubberSeek}
          onScroll={onScrubberScroll}
        />
      )}
    </div>
  );
};

// Plugin patches to ScenePlayer apply to whichever player is on; the name stays registered to the v7 player.
export const ScenePlayerV10 = PatchFunction(
  "ScenePlayer",
  ScenePlayerV10Component
);

export default ScenePlayerV10;
