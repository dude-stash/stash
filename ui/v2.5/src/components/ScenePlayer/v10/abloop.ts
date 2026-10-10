import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayer } from "@videojs/react/video";
import { setVideoJs10AbLoop } from "../util";

export interface IAbLoopOptions {
  start: number;
  end: number | false;
  enabled: boolean;
  pauseBeforeLooping: boolean;
  pauseAfterLooping: boolean;
}

const initialOptions: IAbLoopOptions = {
  start: 0,
  end: false,
  enabled: false,
  pauseBeforeLooping: false,
  pauseAfterLooping: false,
};

// The start margin and minimum loop length of videojs-abloop, which v7 uses; its end margin never applies with v7's options.
const START_MARGIN = 0.5;
const MIN_LOOP_MS = 200;

const isNumber = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);

function validate(options: IAbLoopOptions, duration: number): IAbLoopOptions {
  const start =
    isNumber(options.start) && options.start >= 0 ? options.start : 0;
  let end = options.end;
  if (!isNumber(end) || end < 0) end = false;
  else if (duration && end > duration) end = duration;
  return {
    start,
    end,
    enabled: !!options.enabled,
    pauseBeforeLooping: !!options.pauseBeforeLooping,
    pauseAfterLooping: !!options.pauseAfterLooping,
  };
}

// Whether playback has left the loop, as videojs-abloop decides it with v7's options; a start after the end loops around the end of the video.
function loopRequired(time: number, duration: number, options: IAbLoopOptions) {
  const start = options.start;
  // Until the length is known, a loop without an end has nowhere to end.
  const end = options.end === false ? duration || Infinity : options.end;
  if (start > end) return time < start - START_MARGIN && time > end;
  return time < start - START_MARGIN || time >= end;
}

// Seconds as videojs-abloop shows them on its buttons, such as 1:23.4.
export function formatLoopTime(seconds: number) {
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor(whole / 60) % 60;
  const s = whole % 60;
  const mins = h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`;
  const tenths = Math.floor((seconds % 1) * 10);
  return `${mins}:${String(s).padStart(2, "0")}.${tenths}`;
}

export interface IAbLoop {
  options: IAbLoopOptions;
  setOptions: (options: Partial<IAbLoopOptions>) => void;
  setPoint: (point: "start" | "end") => void;
  adjustPoint: (point: "start" | "end", seconds: number) => void;
  goToPoint: (point: "start" | "end") => void;
  toggle: () => void;
  cyclePauseModes: () => void;
}

// Port of videojs-abloop as v7 configures it, with the same getOptions/setOptions for util.getAbLoopPlugin.
export function useAbLoop(sceneId: string): IAbLoop {
  const store = usePlayer();

  // A loop belongs to the scene it was set on, so a new scene starts without one.
  const [loop, setLoop] = useState({ sceneId, options: initialOptions });
  const options = loop.sceneId === sceneId ? loop.options : initialOptions;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const sceneIdRef = useRef(sceneId);
  sceneIdRef.current = sceneId;

  const setOptions = useCallback(
    (next: Partial<IAbLoopOptions>) => {
      setLoop({
        sceneId: sceneIdRef.current,
        options: validate({ ...optionsRef.current, ...next }, store.duration),
      });
    },
    [store]
  );

  useEffect(() => {
    setVideoJs10AbLoop({
      getOptions: () => ({ ...optionsRef.current }),
      setOptions,
    });
    return () => setVideoJs10AbLoop(null);
  }, [setOptions]);

  useEffect(() => {
    if (!options.enabled) return;
    let looping = false;
    let pausedBeforeLoop = false;
    let timer: number | undefined;

    function goToStart() {
      if (options.pauseBeforeLooping && !pausedBeforeLoop) {
        store.pause();
        pausedBeforeLoop = true;
        return;
      }
      pausedBeforeLoop = false;
      store.seek(options.start);
      if (options.pauseAfterLooping) store.pause();
    }

    const unsubscribe = store.subscribe(() => {
      if (looping || store.paused || store.seeking) return;
      if (!loopRequired(store.currentTime, store.duration, options)) return;
      // A seek can land just short of the start, so loops are kept a moment apart.
      looping = true;
      timer = window.setTimeout(() => {
        looping = false;
      }, MIN_LOOP_MS);
      goToStart();
    });

    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [store, options]);

  // Looping around the end of the video carries on from its start once it ends.
  useEffect(() => {
    if (!options.enabled) return;
    const end = options.end === false ? Infinity : options.end;
    if (options.start <= end) return;

    let ended = store.ended;
    return store.subscribe(() => {
      if (store.ended && !ended) store.play().catch(() => {});
      ended = store.ended;
    });
  }, [store, options]);

  const setPoint = useCallback(
    (point: "start" | "end") => {
      setOptions({ [point]: store.currentTime });
    },
    [store, setOptions]
  );

  const adjustPoint = useCallback(
    (point: "start" | "end", seconds: number) => {
      const current = optionsRef.current[point];
      if (isNumber(current)) setOptions({ [point]: current + seconds });
    },
    [setOptions]
  );

  const goToPoint = useCallback(
    (point: "start" | "end") => {
      const time = optionsRef.current[point];
      if (isNumber(time)) store.seek(time);
    },
    [store]
  );

  const toggle = useCallback(
    () => setOptions({ enabled: !optionsRef.current.enabled }),
    [setOptions]
  );

  // Off, pause after looping, pause before looping, both, as videojs-abloop cycles them.
  const cyclePauseModes = useCallback(() => {
    const { pauseAfterLooping: after, pauseBeforeLooping: before } =
      optionsRef.current;
    if (!after && !before) {
      setOptions({ pauseAfterLooping: true, pauseBeforeLooping: false });
    } else if (after && !before) {
      setOptions({ pauseAfterLooping: false, pauseBeforeLooping: true });
    } else if (!after && before) {
      setOptions({ pauseAfterLooping: true, pauseBeforeLooping: true });
    } else {
      setOptions({ pauseAfterLooping: false, pauseBeforeLooping: false });
    }
  }, [setOptions]);

  return {
    options,
    setOptions,
    setPoint,
    adjustPoint,
    goToPoint,
    toggle,
    cyclePauseModes,
  };
}
