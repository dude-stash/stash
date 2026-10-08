import videojs, { VideoJsPlayer } from "video.js";

export const VIDEO_PLAYER_ID = "VideoJsPlayer";

export const getPlayer = () => videojs.getPlayer(VIDEO_PLAYER_ID);

type V10PlayerElement = HTMLElement & { store?: { currentTime: number } };

export const getPlayerPosition = () =>
  getPlayer()?.currentTime() ??
  document.querySelector<V10PlayerElement>("video-player")?.store?.currentTime;

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
