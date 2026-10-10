import videojs, { VideoJsPlayer } from "video.js";

export const VIDEO_PLAYER_ID = "VideoJsPlayer";

export const getPlayer = () => videojs.getPlayer(VIDEO_PLAYER_ID);

const getV10Video = () =>
  document.querySelector<HTMLVideoElement>(".VideoPlayer.videojs-10 video");

export const getPlayerPosition = () =>
  getPlayer()?.currentTime() ?? getV10Video()?.currentTime;

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
