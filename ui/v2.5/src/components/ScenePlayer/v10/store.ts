import React, { useContext, useEffect, useRef, useState } from "react";

// The subset of the Video.js 10 player store that Stash uses.
export interface IPlayerStore {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  started: boolean;
  waiting: boolean;
  seeking: boolean;
  volume: number;
  muted: boolean;
  isFullscreen: boolean;
  controlsVisible: boolean;
  remotePlaybackState: "disconnected" | "connecting" | "connected";
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => Promise<number>;
  setVolume: (volume: number) => number;
  setMuted: (muted: boolean) => boolean;
  requestFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  dismissError: () => void;
  subscribe: (listener: () => void) => () => void;
}

export interface IAbLoopApi {
  getOptions: () => { start: number; end: number | false; enabled?: boolean };
  setOptions: (options: {
    start: number;
    end: number | false;
    enabled?: boolean;
  }) => void;
}

export type PlayerElement = HTMLElement & {
  store?: IPlayerStore;
  stashAbLoop?: IAbLoopApi;
};

export const PlayerStoreContext = React.createContext<IPlayerStore | undefined>(
  undefined
);

export const usePlayerStore = () => useContext(PlayerStoreContext);

// Selectors should return primitives so unrelated store changes don't re-render.
export function usePlayerState<T>(
  select: (store: IPlayerStore) => T,
  fallback: T
): T {
  const store = usePlayerStore();
  const selectRef = useRef(select);
  selectRef.current = select;
  const [value, setValue] = useState(() => (store ? select(store) : fallback));

  useEffect(() => {
    if (!store) return;
    const update = () => setValue(selectRef.current(store));
    update();
    return store.subscribe(update);
  }, [store]);

  return value;
}

export function seekBy(store: IPlayerStore, seconds: number) {
  const time = Math.min(
    Math.max(store.currentTime + seconds, 0),
    store.duration || Infinity
  );
  return store.seek(time);
}
