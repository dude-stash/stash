import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GoogleCast } from "@videojs/react/extensions/google-cast";
import { Video, VideoPlayer, usePlayer } from "@videojs/react/video";
import cx from "classnames";
import { FormattedMessage } from "react-intl";
import * as GQL from "src/core/generated-graphql";
import { objectTitle } from "src/core/files";
import { PatchFunction } from "src/patch";
import { languageMap } from "src/utils/caption";
import ScreenUtils from "src/utils/screen";
import { ScenePlayerScrubber } from "./ScenePlayerScrubber";
import { VIDEO_PLAYER_ID } from "./util";
import { Skin } from "./v10/Skin";

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
const HlsJsVideo = lazy(() =>
  import("@videojs/react/media/hlsjs-video").then((m) => ({
    default: m.HlsJsVideo,
  }))
);
const DashVideo = lazy(() =>
  import("@videojs/react/media/dash-video").then((m) => ({
    default: m.DashVideo,
  }))
);

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

const ScenePlayerContent: React.FC<IScenePlayerProps> = ({
  scene,
  hideScrubberOverride,
  sendSetTimestamp,
}) => {
  const store = usePlayer();
  const error = usePlayer((s) => s.error);
  const fullscreen = usePlayer((s) => s.isFullscreen);
  const time = usePlayer((s) => s.currentTime);
  const containerRef = useRef<HTMLDivElement>(null);

  const [stream, setStream] = useState<IStream>();
  const [missingFile, setMissingFile] = useState(false);
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
    store.dismissError();
    setMissingFile(false);
    setStream(streams[0]);
    containerRef.current?.focus({ preventScroll: true });
  }, [scene, streams, store]);

  const fallBack = useCallback(
    (current: IStream) => {
      const next = getFallback(streams, current);
      if (!next) return;
      pendingStart.current = store.currentTime || pendingStart.current;
      pendingPlay.current ||= !store.paused;
      // The next stream starts without the error, so it isn't taken for its own.
      store.dismissError();
      setStream(next);
    },
    [streams, store]
  );

  useEffect(() => {
    const code = error?.code;
    if (!stream) return;
    if (code !== MEDIA_ERR_DECODE && code !== MEDIA_ERR_SRC_NOT_SUPPORTED) {
      return;
    }

    const current = stream;
    let active = true;

    (async () => {
      // Every other stream is transcoded from the same file, so there is nothing to fall back to.
      if (current.kind === "direct" && (await isFileMissing(current.url))) {
        if (!active) return;
        store.dismissError();
        setMissingFile(true);
        return;
      }

      if (active) fallBack(current);
    })();

    return () => {
      active = false;
    };
  }, [error, stream, store, fallBack]);

  function onLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
    const el = e.currentTarget;

    // A direct stream whose video codec the browser can't decode loads as audio only.
    if (stream?.kind === "direct" && el.videoWidth === 0) {
      fallBack(stream);
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

  useEffect(() => {
    sendSetTimestamp((value: number) => {
      if (value < 0) return;
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
    if (!store.started) return;
    pausedBeforeScrubber.current = store.paused;
    store.pause();
  }

  function onScrubberSeek(seconds: number) {
    store.seek(seconds);
    if (store.started && !pausedBeforeScrubber.current) {
      store.play().catch(() => {});
    }
  }

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

  // Each stream gets a fresh media element, so nothing from the previous one carries over.
  function renderMedia() {
    if (!stream) return null;

    switch (stream.kind) {
      case "hls":
        return (
          <HlsJsVideo
            key={stream.url}
            src={stream.url}
            crossOrigin="anonymous"
            playsInline
            onLoadedMetadata={onLoadedMetadata}
          >
            {tracks}
          </HlsJsVideo>
        );
      case "dash":
        return (
          <DashVideo
            key={stream.url}
            src={stream.url}
            crossOrigin="anonymous"
            playsInline
            onLoadedMetadata={onLoadedMetadata}
          >
            {tracks}
          </DashVideo>
        );
      default:
        return (
          <Video
            key={stream.url}
            src={stream.url}
            crossOrigin="anonymous"
            playsInline
            preload="metadata"
            onLoadedMetadata={onLoadedMetadata}
          >
            {tracks}
          </Video>
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
    >
      <div id={VIDEO_PLAYER_ID} className="video-wrapper">
        <Skin
          ref={containerRef}
          media={<Suspense fallback={null}>{renderMedia()}</Suspense>}
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
        <GoogleCast />
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

const ScenePlayerV10Component: React.FC<IScenePlayerProps> = (props) => (
  <VideoPlayer
    title={objectTitle(props.scene)}
    poster={props.scene.paths.screenshot ?? undefined}
  >
    <ScenePlayerContent {...props} />
  </VideoPlayer>
);

// Plugin patches to ScenePlayer apply to whichever player is on; the name stays registered to the v7 player.
export const ScenePlayerV10 = PatchFunction(
  "ScenePlayer",
  ScenePlayerV10Component
);

export default ScenePlayerV10;
