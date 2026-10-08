import videojs, { VideoJsPlayer } from "video.js";

export const VIDEO_PLAYER_ID = "VideoJsPlayer";

export const getPlayer = () => videojs.getPlayer(VIDEO_PLAYER_ID);

type V10PlayerElement = HTMLElement & {
  store?: { currentTime: number };
  stashAbLoop?: AbLoopPluginApi;
};

const getV10Player = () =>
  document.querySelector<V10PlayerElement>("video-player");

export const getPlayerPosition = () =>
  getPlayer()?.currentTime() ?? getV10Player()?.store?.currentTime;

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
  if (!player) return getV10Player()?.stashAbLoop ?? null;
  const { abLoopPlugin } = player as VideoJsPlayer & {
    abLoopPlugin?: AbLoopPluginApi;
  };
  return abLoopPlugin ?? null;
};
