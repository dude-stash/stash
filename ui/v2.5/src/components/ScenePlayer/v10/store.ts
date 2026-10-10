// The subset of the Video.js 10 player store that Stash uses.
export interface IPlayerStore {
  currentTime: number;
  paused: boolean;
  started: boolean;
  isFullscreen: boolean;
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => Promise<number>;
  dismissError: () => void;
  subscribe: (listener: () => void) => () => void;
}

export type PlayerElement = HTMLElement & {
  store?: IPlayerStore;
};
