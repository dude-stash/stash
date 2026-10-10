import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { faFilm } from "@fortawesome/free-solid-svg-icons";
import { GoogleCast } from "@videojs/react/extensions/google-cast";
import { SpeedIcon } from "@videojs/react/icons/compat";
import { Video, VideoPlayer, usePlayer } from "@videojs/react/video";
import cx from "classnames";
import { FormattedMessage } from "react-intl";
import { Icon } from "src/components/Shared/Icon";
import * as GQL from "src/core/generated-graphql";
import { objectTitle } from "src/core/files";
import { useConfigureInterface } from "src/core/StashService";
import { useConfigurationContext } from "src/hooks/Config";
import { PatchFunction } from "src/patch";
import { languageMap } from "src/utils/caption";
import ScreenUtils from "src/utils/screen";
import { ScenePlayerScrubber } from "./ScenePlayerScrubber";
import { setVideoJs10Player, VIDEO_PLAYER_ID } from "./util";
import { useAbLoop } from "./v10/abloop";
import { useTrackActivity } from "./v10/activity";
import { usePersistVolume } from "./v10/volume";
import {
  AbLoopButtons,
  AutostartMenuItem,
  RadioSubmenu,
  SkipButton,
} from "./v10/controls";
import { Markers } from "./v10/Markers";
import { Skin } from "./v10/Skin";
import {
  ControlBarSlot,
  OverlaySlot,
  SeekBarSlot,
  SettingsMenuSlot,
} from "./v10/slots";

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

// The v7 player's speeds, rather than Video.js 10's 0.2, 0.7, 1.2 and 1.7.
const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

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

function getMarkerTitle(marker: MarkerFragment) {
  if (marker.title) return marker.title;
  return [marker.primary_tag, ...marker.tags].map((t) => t.name).join(", ");
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
  autoplay,
  initialTimestamp,
  sendSetTimestamp,
  onNext,
  onPrevious,
}) => {
  const { configuration } = useConfigurationContext();
  const autostartVideo = configuration?.interface.autostartVideo ?? false;
  const alwaysStartFromBeginning =
    configuration?.ui.alwaysStartFromBeginning ?? false;
  const [updateInterfaceConfig] = useConfigureInterface();

  const store = usePlayer();
  const error = usePlayer((s) => s.error);
  const fullscreen = usePlayer((s) => s.isFullscreen);
  const time = usePlayer((s) => s.currentTime);
  const rate = usePlayer((s) => s.playbackRate);
  const containerRef = useRef<HTMLDivElement>(null);

  const [stream, setStream] = useState<IStream>();
  const [missingFile, setMissingFile] = useState(false);
  const [showScrubber, setShowScrubber] = useState(false);
  const [loop, setLoop] = useState(false);
  const [markerTitle, setMarkerTitle] = useState<string>();

  const sceneId = useRef<string>();
  // Where and whether to play once the next source has loaded, so a source switch carries on from the same point.
  const pendingStart = useRef<number>();
  const pendingPlay = useRef(false);
  // Mirrors pendingPlay so the skin can show it is still starting rather than a play button that looks ready.
  const [startPending, setStartPending] = useState(false);
  const setPendingPlay = useCallback((value: boolean) => {
    pendingPlay.current = value;
    setStartPending(value);
  }, []);
  const pausedBeforeScrubber = useRef(true);

  const file = useMemo(
    () => (scene.files.length > 0 ? scene.files[0] : undefined),
    [scene]
  );
  const streams = useMemo(() => getStreams(scene), [scene]);

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
  // As in v7, phones show range markers as dots.
  const showRangeMarkers =
    !ScreenUtils.isMobile() && (configuration?.ui.showRangeMarkers ?? true);

  const abLoop = useAbLoop(scene.id);

  useTrackActivity(
    scene.id,
    configuration?.ui.trackActivity ?? true,
    configuration?.ui.minimumPlayPercent ?? 0
  );

  const { applyVolume, onVolumeChange } = usePersistVolume();

  useEffect(() => {
    setVideoJs10Player(store);
    return () => setVideoJs10Player(null);
  }, [store]);

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

    // As in v7: the requested time, else where the scene was left off.
    const resumeTime = scene.resume_time ?? 0;
    let startPosition = initialTimestamp;
    if (
      !startPosition &&
      !alwaysStartFromBeginning &&
      (file?.duration ?? 0) > resumeTime
    ) {
      startPosition = resumeTime;
    }

    pendingStart.current = startPosition || undefined;
    setPendingPlay(!!autoplay || autostartVideo || initialTimestamp > 0);
    store.dismissError();
    setMissingFile(false);
    setMarkerTitle(undefined);
    setStream(streams[0]);
    containerRef.current?.focus({ preventScroll: true });
  }, [
    scene,
    file,
    streams,
    store,
    autoplay,
    autostartVideo,
    alwaysStartFromBeginning,
    initialTimestamp,
    setPendingPlay,
  ]);

  const fallBack = useCallback(
    (current: IStream) => {
      const next = getFallback(streams, current);
      if (!next) {
        setPendingPlay(false);
        return;
      }
      pendingStart.current = store.currentTime || pendingStart.current;
      if (!store.paused) setPendingPlay(true);
      // The next stream starts without the error, so it isn't taken for its own.
      store.dismissError();
      setStream(next);
    },
    [streams, store, setPendingPlay]
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
        setPendingPlay(false);
        return;
      }

      if (active) fallBack(current);
    })();

    return () => {
      active = false;
    };
  }, [error, stream, store, fallBack, setPendingPlay]);

  function onLoadedMetadata(e: React.SyntheticEvent<HTMLVideoElement>) {
    const el = e.currentTarget;
    applyVolume(el);

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
      setPendingPlay(false);
      // As in v7, a scene the browser won't let start on its own stays paused.
      el.play().catch(() => {});
    }
  }

  function onSelectStream(url: string) {
    const next = streams.find((s) => s.url === url);
    if (!next || next.url === stream?.url) return;
    pendingStart.current = store.currentTime;
    setPendingPlay(!store.paused);
    setStream(next);
  }

  function onAutostartToggle(enabled: boolean) {
    updateInterfaceConfig({
      variables: { input: { autostartVideo: enabled } },
    });
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

  // Space always plays or pauses, even with a control focused, as in v7.
  function onKeyDownCapture(event: React.KeyboardEvent) {
    if (event.key !== " ") return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (store.paused) store.play().catch(() => {});
    else store.pause();
  }

  // The rest of v7's shortcuts are the skin's hotkeys.
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "MediaTrackNext") onNext();
    if (event.key === "MediaTrackPrevious") onPrevious();

    if (event.shiftKey && event.key.toLowerCase() === "l") {
      setLoop((value) => !value);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const step = store.duration * 0.1;
    switch (event.key) {
      case "]":
        if (store.currentTime + step < store.duration) {
          store.seek(store.currentTime + step);
        }
        break;
      case "[":
        store.seek(Math.max(store.currentTime - step, 0));
        break;
      // As in v7: set the start, then the end and loop, then clear.
      case "l": {
        const { options, setOptions } = abLoop;
        if (!options.start) {
          setOptions({ start: store.currentTime });
        } else if (!options.end) {
          setOptions({ end: store.currentTime, enabled: true });
        } else {
          setOptions({ start: 0, end: false, enabled: false });
        }
        break;
      }
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
            loop={loop}
            onLoadedMetadata={onLoadedMetadata}
            onVolumeChange={onVolumeChange}
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
            loop={loop}
            onLoadedMetadata={onLoadedMetadata}
            onVolumeChange={onVolumeChange}
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
            loop={loop}
            onLoadedMetadata={onLoadedMetadata}
            onVolumeChange={onVolumeChange}
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
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={onKeyDown}
    >
      <div id={VIDEO_PLAYER_ID} className="video-wrapper">
        <Skin
          ref={containerRef}
          media={<Suspense fallback={null}>{renderMedia()}</Suspense>}
          controlsBeforePlay={
            <SkipButton direction="previous" onClick={onPrevious} />
          }
          controlsAfterPlay={<SkipButton direction="next" onClick={onNext} />}
          controlsEnd={
            <ControlBarSlot scene={scene} player={store}>
              {configuration?.ui.showAbLoopControls && (
                <AbLoopButtons abLoop={abLoop} />
              )}
            </ControlBarSlot>
          }
          settingsStart={
            <RadioSubmenu
              label="Source"
              icon={<Icon icon={faFilm} className="media-menu-trigger-icon" />}
              options={streams.map((s) => ({ value: s.url, label: s.label }))}
              value={stream?.url}
              onChange={onSelectStream}
            />
          }
          settingsSpeed={
            <RadioSubmenu
              label="Speed"
              icon={<SpeedIcon className="media-menu-trigger-icon" />}
              options={PLAYBACK_RATES.map((r) => ({
                value: String(r),
                label: `${r}×`,
              }))}
              value={String(rate)}
              onChange={(value) => store.setPlaybackRate(Number(value))}
            />
          }
          settingsEnd={
            <SettingsMenuSlot scene={scene} player={store}>
              <AutostartMenuItem
                enabled={autostartVideo}
                onToggle={onAutostartToggle}
              />
            </SettingsMenuSlot>
          }
          sliderLayer={
            <SeekBarSlot scene={scene} player={store}>
              <Markers
                markers={markers}
                duration={file?.duration ?? 0}
                showRanges={showRangeMarkers}
                onSeek={(seconds) => store.seek(seconds)}
                onHover={(marker) => setMarkerTitle(marker?.title)}
              />
            </SeekBarSlot>
          }
          sliderPreviewTitle={markerTitle}
          starting={startPending}
        >
          <OverlaySlot scene={scene} player={store}>
            {missingFile && (
              <div className="videojs-10-missing-file">
                <h5>
                  <FormattedMessage id="errors.file_not_found" />
                </h5>
                <span>{file?.path}</span>
              </div>
            )}
          </OverlaySlot>
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
