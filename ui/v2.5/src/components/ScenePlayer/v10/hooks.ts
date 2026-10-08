import { useCallback, useContext, useEffect, useRef, useState } from "react";
import localForage from "localforage";
import * as GQL from "src/core/generated-graphql";
import {
  ConnectionState,
  InteractiveContext,
} from "src/hooks/Interactive/context";
import { IPlayerStore, PlayerElement } from "./store";

const isPlaying = (store: IPlayerStore) =>
  !store.paused && !store.waiting && !store.ended;

interface ITrackActivityOptions {
  store?: IPlayerStore;
  sceneId: string;
  enabled: boolean;
  minimumPlayPercent: number;
  saveActivity: (
    sceneId: string,
    resumeTime: number,
    playDuration: number
  ) => void;
  incrementPlayCount: (sceneId: string) => void;
}

// Port of track-activity.ts: counts seconds played, saves the resume point every 10s and bumps the play count once.
export function useTrackActivity(options: ITrackActivityOptions) {
  const { store, sceneId, enabled } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!store || !enabled) return;
    const activeStore = store;

    let totalPlayDuration = 0;
    let currentPlayDuration = 0;
    let playCountIncremented = false;
    let lastTime = store.currentTime;
    let lastDuration = store.duration;
    let interval: number | undefined;

    function send() {
      if (totalPlayDuration <= 0 || !lastDuration) return;
      const { saveActivity, incrementPlayCount, minimumPlayPercent } =
        optionsRef.current;

      const percentPlayed = (100 / lastDuration) * totalPlayDuration;
      if (!playCountIncremented && percentPlayed >= minimumPlayPercent) {
        incrementPlayCount(sceneId);
        playCountIncremented = true;
      }

      const percentCompleted = (100 / lastDuration) * lastTime;
      saveActivity(
        sceneId,
        percentCompleted >= 98 ? 0 : lastTime,
        currentPlayDuration
      );
      currentPlayDuration = 0;
    }

    function update() {
      if (!isPlaying(activeStore)) {
        if (!interval) return;
        window.clearInterval(interval);
        interval = undefined;
        send();
        return;
      }

      // Only playing positions are kept, so a new scene's source resetting to 0 can't overwrite this scene's resume point.
      lastTime = activeStore.currentTime;
      lastDuration = activeStore.duration;
      interval ??= window.setInterval(() => {
        totalPlayDuration += 1;
        currentPlayDuration += 1;
        if (totalPlayDuration % 10 === 0) send();
      }, 1000);
    }

    update();
    const unsubscribe = store.subscribe(update);
    return () => {
      unsubscribe();
      if (interval) {
        window.clearInterval(interval);
        send();
      }
    };
  }, [store, sceneId, enabled]);
}

const levelKey = "volume-level";
const mutedKey = "volume-muted";

// Port of persist-volume.ts, using the same storage keys so v7 and v10 share the setting.
export function usePersistVolume(
  store: IPlayerStore | undefined,
  autoplayMuted: { current: boolean }
) {
  useEffect(() => {
    if (!store) return;

    let restored = false;
    let last = { volume: store.volume, muted: store.muted };

    Promise.all([
      localForage.getItem<number>(levelKey),
      localForage.getItem<boolean>(mutedKey),
    ]).then(([level, muted]) => {
      if (level !== null) store.setVolume(level);
      if (muted !== null && !autoplayMuted.current) store.setMuted(muted);
      restored = true;
    });

    return store.subscribe(() => {
      // The Chromecast's volume is its own, and an autoplay mute isn't the viewer's choice, so neither is saved.
      if (!restored || autoplayMuted.current) return;
      if (store.remotePlaybackState !== "disconnected") return;
      if (store.volume === last.volume && store.muted === last.muted) return;

      last = { volume: store.volume, muted: store.muted };
      localForage.setItem(levelKey, store.volume);
      localForage.setItem(mutedKey, store.muted);
    });
  }, [store, autoplayMuted]);
}

const rateKey = "playback-rate";

interface ICastMedia {
  playbackRate: number;
}

type CastGlobal = {
  cast?: {
    framework?: {
      CastContext: {
        getInstance(): {
          getCurrentSession(): { getMediaSession(): ICastMedia | null } | null;
        };
      };
    };
  };
};

const getCastMedia = () =>
  (window as unknown as CastGlobal).cast?.framework?.CastContext.getInstance()
    .getCurrentSession()
    ?.getMediaSession() ?? undefined;

// Remembers the playback speed across scenes, reloads and casts, which v7 didn't do.
export function usePersistPlaybackRate(
  media: HTMLMediaElement | null,
  store: IPlayerStore | undefined
) {
  const [rate, setRate] = useState<number>();
  const remember = useCallback((value: number) => {
    setRate(value);
    localForage.setItem(rateKey, value);
  }, []);

  useEffect(() => {
    localForage.getItem<number>(rateKey).then((value) => setRate(value ?? 1));
  }, []);

  useEffect(() => {
    if (!media || rate === undefined) return;
    const el = media;
    const saved = rate;

    function apply() {
      el.defaultPlaybackRate = saved;
      el.playbackRate = saved;
    }

    // Loading a source resets the speed, which isn't the viewer's choice, so only changes on loaded media are kept.
    function onRateChange() {
      if (el.readyState < 1 || el.playbackRate === saved) return;
      remember(el.playbackRate);
    }

    apply();
    el.addEventListener("loadedmetadata", apply);
    el.addEventListener("ratechange", onRateChange);
    return () => {
      el.removeEventListener("loadedmetadata", apply);
      el.removeEventListener("ratechange", onRateChange);
    };
  }, [media, rate, remember]);

  // The Chromecast starts each load at 1x, so it is sent the remembered speed, and a speed picked while casting is remembered too.
  useEffect(() => {
    if (!store || rate === undefined) return;
    // Google's receivers play 0.5x to 2x, so a slower remembered speed casts at 0.5x without being forgotten.
    const castRate = Math.min(Math.max(rate, 0.5), 2);
    let castMedia: ICastMedia | undefined;
    let lastRate = 0;

    return store.subscribe(() => {
      const current =
        store.remotePlaybackState === "connected" ? getCastMedia() : undefined;
      if (!current) {
        castMedia = undefined;
        return;
      }

      if (current !== castMedia) {
        castMedia = current;
        lastRate = current.playbackRate;
        if (lastRate !== castRate) store.setPlaybackRate(castRate);
        return;
      }

      // v10 only re-reads the speed on a ratechange, and doesn't send one when a cast loads.
      if (store.playbackRate !== current.playbackRate) {
        media?.dispatchEvent(new Event("ratechange"));
      }

      // A refused speed leaves the rate unchanged, so it can't overwrite the remembered one.
      if (current.playbackRate === lastRate) return;
      lastRate = current.playbackRate;
      if (lastRate !== castRate) remember(lastRate);
    });
  }, [store, media, rate, remember]);
}

interface IMediaSessionOptions {
  title: string;
  artist: string;
  artwork: string;
  onNext: () => void;
  onPrevious: () => void;
}

// Port of media-session.ts.
export function useMediaSession(
  store: IPlayerStore | undefined,
  options: IMediaSessionOptions
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { title, artist, artwork } = options;

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      artwork: artwork ? [{ src: artwork, type: "image/jpeg" }] : [],
    });
  }, [title, artist, artwork]);

  useEffect(() => {
    if (!store || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;

    session.setActionHandler("play", () => store.play());
    session.setActionHandler("pause", () => store.pause());
    session.setActionHandler("nexttrack", () => optionsRef.current.onNext());
    session.setActionHandler("previoustrack", () =>
      optionsRef.current.onPrevious()
    );

    const unsubscribe = store.subscribe(() => {
      session.playbackState = store.paused ? "paused" : "playing";
    });

    return () => {
      unsubscribe();
      for (const action of [
        "play",
        "pause",
        "nexttrack",
        "previoustrack",
      ] as const) {
        session.setActionHandler(action, null);
      }
    };
  }, [store]);
}

// Port of wake-sentinel.ts: keeps the screen on while a scene plays.
export function useWakeLock(store?: IPlayerStore) {
  useEffect(() => {
    if (!store || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | undefined;
    let requesting = false;

    async function sync() {
      if (!store) return;
      const wanted =
        !store.paused && !store.ended && document.visibilityState === "visible";

      if (wanted && !sentinel && !requesting) {
        requesting = true;
        sentinel = await navigator.wakeLock.request("screen").catch(() => {
          return undefined;
        });
        requesting = false;
      } else if (!wanted && sentinel) {
        const released = sentinel;
        sentinel = undefined;
        await released.release();
      }
    }

    const unsubscribe = store.subscribe(sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", sync);
      sentinel?.release();
    };
  }, [store]);
}

// A menu choice remembered in the browser like the volume, such as the VR mode or the cast source.
export function useRememberedChoice(
  key: string,
  fallback: string
): [string, (value: string) => void] {
  const [choice, setChoice] = useState(fallback);

  useEffect(() => {
    localForage.getItem<string>(key).then((value) => {
      if (value) setChoice(value);
    });
  }, [key]);

  const remember = useCallback(
    (value: string) => {
      setChoice(value);
      localForage.setItem(key, value);
    },
    [key]
  );

  return [choice, remember];
}

export interface IAbLoopOptions {
  start: number;
  end: number | false;
  enabled: boolean;
}

export interface IAbLoop {
  options: IAbLoopOptions;
  setOptions: (options: IAbLoopOptions) => void;
}

const noLoop: IAbLoopOptions = { start: 0, end: false, enabled: false };

// Replaces videojs-abloop, and exposes the same getOptions/setOptions on the player element for util.getAbLoopPlugin.
export function useAbLoop(
  store: IPlayerStore | undefined,
  player: PlayerElement | null,
  sceneId: string
): IAbLoop {
  // Points belong to the scene they were set on, so a new scene starts without a loop.
  const [loop, setLoop] = useState({ sceneId, options: noLoop });
  const options = loop.sceneId === sceneId ? loop.options : noLoop;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const sceneIdRef = useRef(sceneId);
  sceneIdRef.current = sceneId;

  const setOptions = useCallback(
    (next: IAbLoopOptions) =>
      setLoop({ sceneId: sceneIdRef.current, options: next }),
    []
  );

  useEffect(() => {
    if (!player) return;
    player.stashAbLoop = {
      getOptions: () => ({ ...optionsRef.current }),
      setOptions: (next) =>
        setOptions({ ...noLoop, ...next, enabled: next.enabled ?? false }),
    };
  }, [player, setOptions]);

  useEffect(() => {
    const { start, end, enabled } = options;
    if (!store || !enabled || end === false || end <= start) return;

    return store.subscribe(() => {
      if (store.seeking) return;
      const time = store.currentTime;
      if (time >= end || time < start) store.seek(start);
    });
  }, [store, options]);

  return { options, setOptions };
}

const DELAY_FOR_SECOND_PLAY_MS = 1000;

// Port of the interactive (Handy) handling in ScenePlayer.tsx.
export function useInteractiveSync(
  media: HTMLMediaElement | null,
  scene: GQL.SceneDataFragment,
  looping: boolean
) {
  const {
    interactive: client,
    uploadScript,
    currentScript,
    initialised,
    state,
  } = useContext(InteractiveContext);
  const scriptReady = useRef(false);

  useEffect(() => {
    // A new scene stops the device until its own script is uploaded.
    client.pause();
    if (!scene.interactive || !initialised) return;
    scriptReady.current = false;
    uploadScript(scene.paths.funscript || "").then(() => {
      scriptReady.current = true;
    });
  }, [
    client,
    uploadScript,
    initialised,
    scene.interactive,
    scene.paths.funscript,
  ]);

  // Play the script if the video started before the upload finished.
  useEffect(() => {
    if (state !== ConnectionState.Ready || !media || media.paused) return;
    client.ensurePlaying(media.currentTime);
  }, [state, media, client]);

  useEffect(() => {
    if (!media || !scene.interactive) return;
    const el = media;
    let timer: number | undefined;

    function onPlaying() {
      if (!scriptReady.current) return;
      client.play(el.currentTime);
      // A second play event adjusts for the video player's start-up drift.
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!el.paused) client.play(el.currentTime);
      }, DELAY_FOR_SECOND_PLAY_MS);
    }

    function onPause() {
      client.pause();
    }

    el.addEventListener("playing", onPlaying);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("pause", onPause);
      window.clearTimeout(timer);
    };
  }, [media, client, scene.interactive]);

  useEffect(() => {
    client.setLooping(looping);
  }, [client, looping]);

  useEffect(() => () => void client.pause(), [client]);

  return {
    state,
    waitingForScript:
      !!scene.interactive &&
      !!client.handyKey &&
      currentScript !== scene.paths.funscript,
  };
}
