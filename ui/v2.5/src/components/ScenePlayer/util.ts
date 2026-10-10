import type { VideoPlayerStore } from "@videojs/core/dom";
import videojs, { VideoJsPlayer } from "video.js";

export const VIDEO_PLAYER_ID = "VideoJsPlayer";

export const getPlayer = () => videojs.getPlayer(VIDEO_PLAYER_ID);

// The experimental Video.js 10 player's store, while that player is mounted.
let videoJs10Player: VideoPlayerStore | null = null;

export const setVideoJs10Player = (store: VideoPlayerStore | null) => {
  videoJs10Player = store;
};

export const getVideoJs10Player = () => videoJs10Player;

export const getPlayerPosition = () =>
  getPlayer()?.currentTime() ?? videoJs10Player?.currentTime;

export type AbLoopOptions = {
  start: number;
  end: number | false;
  enabled?: boolean;
};

export type AbLoopPluginApi = {
  getOptions: () => AbLoopOptions;
  setOptions: (options: AbLoopOptions) => void;
};

// The new player's A/B loop, while that player is mounted.
let videoJs10AbLoop: AbLoopPluginApi | null = null;

export const setVideoJs10AbLoop = (abLoop: AbLoopPluginApi | null) => {
  videoJs10AbLoop = abLoop;
};

export const getAbLoopPlugin = () => {
  const player = getPlayer();
  if (!player) return videoJs10AbLoop;
  const { abLoopPlugin } = player as VideoJsPlayer & {
    abLoopPlugin?: AbLoopPluginApi;
  };
  return abLoopPlugin ?? null;
};
