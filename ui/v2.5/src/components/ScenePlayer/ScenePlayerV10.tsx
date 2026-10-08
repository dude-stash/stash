import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "@videojs/html/video/player";
import "@videojs/html/video/skin";
import "@videojs/html/extensions/google-cast";
import cx from "classnames";
import * as GQL from "src/core/generated-graphql";
import { objectTitle } from "src/core/files";
import { useSystemStatus } from "src/core/StashService";
import { useConfigurationContext } from "src/hooks/Config";
import { languageMap } from "src/utils/caption";
import {
  pickCastSource,
  pickLanIPv4,
  rewriteCastUrl,
} from "src/utils/castMedia";
import ScreenUtils from "src/utils/screen";
import { ScenePlayerScrubber } from "./ScenePlayerScrubber";
import { VIDEO_PLAYER_ID } from "./util";

type StreamKind = "direct" | "hls" | "dash";

interface IStream {
  kind: StreamKind;
  url: string;
  label: string;
}

interface IPlayerStore {
  currentTime: number;
  paused: boolean;
  ended: boolean;
  started: boolean;
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => Promise<number>;
  subscribe: (listener: () => void) => () => void;
}

type PlayerElement = HTMLElement & { store?: IPlayerStore };

type MarkerFragment = GQL.SceneDataFragment["scene_markers"][number];

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

// MP4 and WebM transcodes can only seek through the v7 offset middleware in live.ts, so they are left out.
function getStreams(scene: GQL.SceneDataFragment): IStream[] {
  return scene.sceneStreams.flatMap((stream) => {
    const kind = getStreamKind(stream.url);
    return kind ? [{ kind, url: stream.url, label: stream.label ?? kind }] : [];
  });
}

function getFallback(streams: IStream[], current: IStream) {
  const kinds = FALLBACK_ORDER.slice(FALLBACK_ORDER.indexOf(current.kind) + 1);
  for (const kind of kinds) {
    const stream = streams.find((s) => s.kind === kind);
    if (stream) return stream;
  }
  return undefined;
}

function getMarkerTitle(marker: MarkerFragment) {
  if (marker.title) return marker.title;
  return [marker.primary_tag, ...marker.tags].map((t) => t.name).join(", ");
}

function formatCueTime(seconds: number) {
  return new Date(seconds * 1000).toISOString().slice(11, 23);
}

// v10 has no marker plugin, but it shows chapter titles on the time slider.
function getChaptersVtt(markers: MarkerFragment[], duration: number) {
  const sorted = [...markers].sort((a, b) => a.seconds - b.seconds);
  const cues = sorted.flatMap((marker, i) => {
    const end = sorted[i + 1]?.seconds ?? duration;
    if (end <= marker.seconds) return [];
    const timing = `${formatCueTime(marker.seconds)} --> ${formatCueTime(end)}`;
    return [`${timing}\n${getMarkerTitle(marker)}`];
  });
  return cues.length ? `WEBVTT\n\n${cues.join("\n\n")}\n` : undefined;
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

export const ScenePlayerV10: React.FC<IScenePlayerProps> = ({
  scene,
  hideScrubberOverride,
  autoplay,
  permitLoop = true,
  initialTimestamp,
  sendSetTimestamp,
  onComplete,
}) => {
  const { configuration } = useConfigurationContext();
  const interfaceConfig = configuration?.interface;
  const uiConfig = configuration?.ui;
  const castEnabled = uiConfig?.enableChromecast ?? false;
  const { data: systemStatus } = useSystemStatus();
  const lanIp = pickLanIPv4(systemStatus?.systemStatus.localIPs);

  const playerRef = useRef<PlayerElement>(null);
  const [media, setMedia] = useState<HTMLVideoElement | null>(null);
  const mediaRef = useCallback(
    (el: HTMLElement | null) => setMedia(el as HTMLVideoElement | null),
    []
  );

  const [stream, setStream] = useState<IStream>();
  const [loadedKinds, setLoadedKinds] = useState<StreamKind[]>(["direct"]);
  const [time, setTime] = useState(0);
  const [showScrubber, setShowScrubber] = useState(false);

  const sceneId = useRef<string>();
  const pendingStart = useRef<number>();
  const pendingPlay = useRef(false);
  const pausedBeforeScrubber = useRef(true);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const getStore = useCallback(() => playerRef.current?.store, []);

  const file = useMemo(
    () => (scene.files.length > 0 ? scene.files[0] : undefined),
    [scene]
  );
  const streams = useMemo(() => getStreams(scene), [scene]);

  const maxLoopDuration = interfaceConfig?.maximumLoopDuration ?? 0;
  const looping =
    !!file?.duration &&
    permitLoop &&
    maxLoopDuration !== 0 &&
    file.duration < maxLoopDuration;

  const castSource = useMemo(() => {
    const source = pickCastSource(scene.sceneStreams, file);
    if (!source) return undefined;
    return {
      url: rewriteCastUrl(source.url, lanIp),
      contentType: source.contentType,
    };
  }, [scene, file, lanIp]);

  // The Chromecast fetches caption tracks itself, so they need the LAN address too.
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
        src: castEnabled
          ? rewriteCastUrl(url.toString(), lanIp)
          : url.toString(),
        srcLang: lang,
        label: `${languageMap.get(lang) ?? lang} (${caption.caption_type})`,
        isDefault,
      };
    });
  }, [scene, castEnabled, lanIp]);

  const [chaptersUrl, setChaptersUrl] = useState<string>();
  useEffect(() => {
    const vtt = getChaptersVtt(scene.scene_markers, file?.duration ?? 0);
    if (!vtt) {
      setChaptersUrl(undefined);
      return;
    }

    const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
    setChaptersUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [scene.scene_markers, file]);

  // Only a new scene resets the stream and start position, not a config or prop change.
  useEffect(() => {
    if (scene.id === sceneId.current) return;
    sceneId.current = scene.id;

    const resumeTime = scene.resume_time ?? 0;
    let start = initialTimestamp;
    if (
      !start &&
      !uiConfig?.alwaysStartFromBeginning &&
      (file?.duration ?? 0) > resumeTime
    ) {
      start = resumeTime;
    }

    pendingStart.current = start || undefined;
    pendingPlay.current =
      !!autoplay ||
      (interfaceConfig?.autostartVideo ?? false) ||
      initialTimestamp > 0;
    setTime(start);
    setStream(streams[0]);
  }, [
    scene,
    file,
    streams,
    initialTimestamp,
    autoplay,
    interfaceConfig?.autostartVideo,
    uiConfig?.alwaysStartFromBeginning,
  ]);

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
    if (!media || !stream) return;
    const el = media;
    const current = stream;

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

      const store = getStore();
      if (pendingStart.current) {
        if (store) store.seek(pendingStart.current);
        else el.currentTime = pendingStart.current;
        pendingStart.current = undefined;
      }
      if (pendingPlay.current) {
        pendingPlay.current = false;
        (store ?? el).play().catch(() => {});
      }
    }

    function onError() {
      const code = el.error?.code;
      if (code === MEDIA_ERR_DECODE || code === MEDIA_ERR_SRC_NOT_SUPPORTED) {
        fallBack();
      }
    }

    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.addEventListener("error", onError);
    if (el.readyState >= 1) onLoadedMetadata();

    return () => {
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
      el.removeEventListener("error", onError);
    };
  }, [media, stream, streams, getStore]);

  // The store keeps reflecting playback while casting, unlike the media element's events.
  useEffect(() => {
    const store = getStore();
    if (!store) return;

    let ended = store.ended;
    return store.subscribe(() => {
      if (!store.paused) setTime(store.currentTime);
      if (store.ended && !ended) onCompleteRef.current();
      ended = store.ended;
    });
  }, [getStore]);

  useEffect(() => {
    media?.toggleAttribute("loop", looping);
  }, [media, looping]);

  useEffect(() => {
    sendSetTimestamp((value: number) => {
      const store = getStore();
      if (!store || value < 0) return;
      store.seek(value);
      if (!store.started || !store.paused) store.play().catch(() => {});
    });
  }, [sendSetTimestamp, getStore]);

  useEffect(() => {
    if (hideScrubberOverride) {
      setShowScrubber(false);
      return;
    }

    const onResize = () => {
      setShowScrubber(window.innerHeight >= 450 && !ScreenUtils.isMobile());
    };
    onResize();

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [hideScrubberOverride]);

  function onScrubberScroll() {
    const store = getStore();
    if (!store?.started) return;
    pausedBeforeScrubber.current = store.paused;
    store.pause();
  }

  function onScrubberSeek(seconds: number) {
    const store = getStore();
    if (!store) return;
    store.seek(seconds);
    setTime(seconds);
    if (store.started && !pausedBeforeScrubber.current) {
      store.play().catch(() => {});
    }
  }

  function onSelectStream(url: string) {
    const next = streams.find((s) => s.url === url);
    if (!next || !media) return;
    pendingStart.current = getStore()?.currentTime ?? media.currentTime;
    pendingPlay.current = !media.paused;
    setStream(next);
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
      {chaptersUrl && <track kind="chapters" src={chaptersUrl} default />}
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
    >
      <div id={VIDEO_PLAYER_ID} className="video-wrapper">
        <video-player ref={playerRef} content-title={objectTitle(scene)}>
          <video-skin class="videojs-10-skin">{renderMedia()}</video-skin>
          {castEnabled && (
            <google-cast
              src={castSource?.url}
              content-type={castSource?.contentType}
            />
          )}
        </video-player>
        {streams.length > 1 && (
          <select
            className="videojs-10-source-select form-control form-control-sm"
            value={stream?.url}
            onChange={(e) => onSelectStream(e.currentTarget.value)}
          >
            {streams.map((s) => (
              <option key={s.url} value={s.url}>
                {s.label}
              </option>
            ))}
          </select>
        )}
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

export default ScenePlayerV10;
