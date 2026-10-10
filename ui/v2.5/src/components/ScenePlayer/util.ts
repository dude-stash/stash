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

export const getAbLoopPlugin = () => {
  const player = getPlayer();
  if (!player) return null;
  const { abLoopPlugin } = player as VideoJsPlayer & {
    abLoopPlugin?: AbLoopPluginApi;
  };
  return abLoopPlugin ?? null;
};
