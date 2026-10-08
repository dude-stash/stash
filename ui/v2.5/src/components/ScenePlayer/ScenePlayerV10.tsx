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
import {
  useConfigureInterface,
  useSceneIncrementPlayCount,
  useSceneSaveActivity,
  useSystemStatus,
} from "src/core/StashService";
import { useConfigurationContext } from "src/hooks/Config";
import { ConnectionState } from "src/hooks/Interactive/context";
import { SceneInteractiveStatus } from "src/hooks/Interactive/status";
import { languageMap } from "src/utils/caption";
import {
  pickCastSource,
  pickLanIPv4,
  rewriteCastUrl,
} from "src/utils/castMedia";
import ScreenUtils from "src/utils/screen";
import { ScenePlayerScrubber } from "./ScenePlayerScrubber";
import { VIDEO_PLAYER_ID } from "./util";
import { Skin } from "./v10/Skin";
import { Markers } from "./v10/Markers";
import {
  AbLoopButtons,
  AutostartMenuItem,
  BigButtons,
  RadioSubmenu,
  SeekButton,
  SkipButton,
  VrMenuButton,
} from "./v10/controls";
import {
  useAbLoop,
  useInteractiveSync,
  useMediaSession,
  usePersistPlaybackRate,
  usePersistVolume,
  useRememberedVrProjection,
  useTrackActivity,
  useWakeLock,
} from "./v10/hooks";
import { PlayerElement, PlayerStoreContext, seekBy } from "./v10/store";
import type { VRProjection } from "./v10/vr";

type StreamKind = "direct" | "hls" | "dash";

interface IStream {
  kind: StreamKind;
  url: string;
  label: string;
}

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

const vrOptions: { value: VRProjection | "off"; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "180_LR", label: "180 LR" },
  { value: "360_TB", label: "360 TB" },
  { value: "360", label: "360 Mono" },
];

// VR headset browsers play VR video natively, so v7 left them alone too.
const isVrDevice = () => /oculusbrowser|\svr\s/i.test(navigator.userAgent);

function getMarkerTitle(marker: MarkerFragment) {
  if (marker.title) return marker.title;
  return [marker.primary_tag, ...marker.tags].map((t) => t.name).join(", ");
}

function formatCueTime(seconds: number) {
  return new Date(seconds * 1000).toISOString().slice(11, 23);
}

// The time slider shows chapter titles while hovering, which stands in for v7's marker tooltips.
function getChaptersVtt(markers: MarkerFragment[], duration: number) {
  const sorted = markers
    .filter((m) => m.seconds < duration)
    .sort((a, b) => a.seconds - b.seconds);
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
  onNext,
  onPrevious,
}) => {
  const { configuration } = useConfigurationContext();
  const interfaceConfig = configuration?.interface;
  const uiConfig = configuration?.ui;
  const castEnabled = uiConfig?.enableChromecast ?? false;
  const autostartVideo = interfaceConfig?.autostartVideo ?? false;
  const { data: systemStatus } = useSystemStatus();
  const lanIp = pickLanIPv4(systemStatus?.systemStatus.localIPs);
  const [sceneSaveActivity] = useSceneSaveActivity();
  const [sceneIncrementPlayCount] = useSceneIncrementPlayCount();
  const [updateInterfaceConfig] = useConfigureInterface();

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
  const [paused, setPaused] = useState(true);
  const [showScrubber, setShowScrubber] = useState(false);

  const sceneId = useRef<string>();
  const pendingStart = useRef<number>();
  const pendingPlay = useRef(false);
  const pausedBeforeScrubber = useRef(true);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

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

  const showVr =
    !!uiConfig?.vrTag &&
    scene.tags.some((tag) => tag.name === uiConfig.vrTag) &&
    !isVrDevice();
  const [vrChoice, setVrChoice] = useRememberedVrProjection();
  const vrProjection = showVr ? vrChoice : "off";

  const interactive = useInteractiveSync(media, scene, looping);
  const abLoop = useAbLoop(store, player, scene.id);
  const autoplayMuted = useRef(false);
  usePersistVolume(store, autoplayMuted);
  usePersistPlaybackRate(media);
  useWakeLock(store);
  useTrackActivity({
    store,
    sceneId: scene.id,
    enabled: uiConfig?.trackActivity ?? true,
    minimumPlayPercent: uiConfig?.minimumPlayPercent ?? 0,
    saveActivity: (id, resumeTime, playDuration) =>
      sceneSaveActivity({
        variables: { id, playDuration, resume_time: resumeTime },
      }),
    incrementPlayCount: (id) => sceneIncrementPlayCount({ variables: { id } }),
  });
  useMediaSession(store, {
    title: objectTitle(scene),
    artist:
      scene.studio?.name ?? scene.performers.map((p) => p.name).join(", "),
    artwork: scene.paths.screenshot ?? "",
    onNext,
    onPrevious,
  });

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

  const markers = useMemo(
    () =>
      scene.scene_markers.map((marker) => ({
        title: getMarkerTitle(marker),
        seconds: marker.seconds,
        end_seconds: marker.end_seconds ?? null,
        primaryTag: marker.primary_tag,
      })),
    [scene.scene_markers]
  );

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
    pendingPlay.current = !!autoplay || autostartVideo || initialTimestamp > 0;
    setTime(start);
    setMissingFile(false);
    setStream(streams[0]);
    containerRef.current?.focus({ preventScroll: true });
  }, [
    scene,
    file,
    streams,
    initialTimestamp,
    autoplay,
    autostartVideo,
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

  // Autostart waits for an interactive scene's script, as in v7.
  const tryAutoplay = useCallback(() => {
    if (!pendingPlay.current || interactive.waitingForScript) return;
    if (!media || media.readyState < 1) return;
    pendingPlay.current = false;
    // The store attaches to a new media element a moment after it loads, so only a cast goes through it.
    if (store?.remotePlaybackState === "connected") {
      store.play().catch(() => {});
      return;
    }

    const el = media;
    el.play().catch((error: DOMException) => {
      // Browsers block autoplay with sound until the page has been interacted with, so it starts muted instead.
      if (error.name !== "NotAllowedError" || el.muted) return;
      autoplayMuted.current = true;
      el.muted = true;
      el.play().catch(() => {});
    });
  }, [media, store, interactive.waitingForScript]);

  useEffect(tryAutoplay, [tryAutoplay]);

  // The first interaction with the page lifts an autoplay mute, unless it was on the volume controls, which unmute by themselves.
  useEffect(() => {
    function onInteraction(event: Event) {
      if (!autoplayMuted.current) return;
      autoplayMuted.current = false;
      const target = event.target as Element | null;
      if (target?.closest?.("media-mute-button, media-volume-slider")) return;
      if (media) media.muted = false;
    }

    document.addEventListener("pointerdown", onInteraction, true);
    document.addEventListener("keydown", onInteraction, true);
    return () => {
      document.removeEventListener("pointerdown", onInteraction, true);
      document.removeEventListener("keydown", onInteraction, true);
    };
  }, [media]);

  useEffect(() => {
    // Right after a source change the old element is still in state, and must not use up the pending seek.
    if (!media || !stream || media.getAttribute("src") !== stream.url) return;
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
      tryAutoplay();
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
  }, [media, stream, streams, store, tryAutoplay]);

  // The store keeps reflecting playback while casting, unlike the media element's events.
  useEffect(() => {
    if (!store) return;

    let ended = store.ended;
    return store.subscribe(() => {
      setPaused(store.paused);
      if (!store.paused) setTime(store.currentTime);
      if (store.ended && !ended) onCompleteRef.current();
      ended = store.ended;
    });
  }, [store]);

  useEffect(() => {
    media?.toggleAttribute("loop", looping);
  }, [media, looping]);

  // three.js is only downloaded once a VR projection is picked.
  useEffect(() => {
    const container = containerRef.current;
    if (vrProjection === "off" || !media || !container) return;

    const video =
      media instanceof HTMLVideoElement
        ? media
        : (media as unknown as { target: HTMLVideoElement | null }).target;
    if (!video) return;

    let stop: (() => void) | undefined;
    let cancelled = false;
    import("./v10/vr").then(({ startVR }) => {
      if (!cancelled)
        stop = startVR(container, video, vrProjection as VRProjection);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [media, vrProjection]);

  useEffect(() => {
    sendSetTimestamp((value: number) => {
      if (!store || value < 0) return;
      store.seek(value);
      if (!store.started || !store.paused) store.play().catch(() => {});
    });
  }, [sendSetTimestamp, store]);

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

  function onSelectStream(url: string) {
    const next = streams.find((s) => s.url === url);
    if (!next || !media || next.url === stream?.url) return;
    pendingStart.current = store?.currentTime ?? media.currentTime;
    pendingPlay.current = !media.paused;
    setStream(next);
  }

  function onAutostartToggle(enabled: boolean) {
    updateInterfaceConfig({
      variables: { input: { autostartVideo: enabled } },
    });
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

  // The rest of v7's hotkeys are declared on the skin's media-hotkey elements.
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
      case "l": {
        const { options, setOptions } = abLoop;
        if (!options.start) {
          setOptions({ ...options, start: store.currentTime });
        } else if (!options.end) {
          setOptions({ ...options, end: store.currentTime, enabled: true });
        } else {
          setOptions({ start: 0, end: false, enabled: false });
        }
        break;
      }
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
  const showRangeMarkers =
    !ScreenUtils.isMobile() && (uiConfig?.showRangeMarkers ?? true);

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
        <PlayerStoreContext.Provider value={store}>
          <video-player ref={setPlayer} content-title={objectTitle(scene)}>
            <Skin
              containerRef={containerRef}
              media={renderMedia()}
              controlsStart={
                <SkipButton direction="previous" onClick={onPrevious} />
              }
              controlsAfterPlay={
                <>
                  <SkipButton direction="next" onClick={onNext} />
                  <SeekButton seconds={-10} />
                  <SeekButton seconds={10} />
                </>
              }
              controlsEnd={
                uiConfig?.showAbLoopControls && (
                  <AbLoopButtons abLoop={abLoop} />
                )
              }
              controlsSecondary={
                showVr && (
                  <VrMenuButton
                    options={vrOptions}
                    value={vrChoice}
                    onChange={setVrChoice}
                  />
                )
              }
              settingsItems={
                <>
                  <RadioSubmenu
                    id="stash-source-content"
                    label="Source"
                    icon={
                      <media-icon
                        name="switches"
                        class="media-menu-trigger-item-icon"
                      />
                    }
                    options={streams.map((s) => ({
                      value: s.url,
                      label: s.label,
                    }))}
                    value={stream?.url}
                    onChange={onSelectStream}
                  />
                  <AutostartMenuItem
                    enabled={autostartVideo}
                    onToggle={onAutostartToggle}
                  />
                </>
              }
              sliderLayer={
                <Markers
                  markers={markers}
                  duration={file?.duration ?? 0}
                  showRanges={showRangeMarkers}
                />
              }
            >
              <BigButtons />
              {missingFile && (
                <div className="videojs-10-missing-file">
                  <h5>
                    <FormattedMessage id="errors.file_not_found" />
                  </h5>
                  <span>{file?.path}</span>
                </div>
              )}
            </Skin>
            {castEnabled && (
              <google-cast
                src={castSource?.url}
                content-type={castSource?.contentType}
              />
            )}
          </video-player>
        </PlayerStoreContext.Provider>
      </div>
      {scene.interactive &&
        (interactive.state !== ConnectionState.Ready || paused) && (
          <SceneInteractiveStatus />
        )}
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
