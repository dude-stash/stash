import videojs, { VideoJsPlayer } from "video.js";

export const VIDEO_PLAYER_ID = "VideoJsPlayer";

export const getPlayer = () => videojs.getPlayer(VIDEO_PLAYER_ID);

export type AbLoopOptions = {
  start: number;
  end: number | false;
  enabled?: boolean;
};

export type AbLoopPluginApi = {
  getOptions: () => AbLoopOptions;
  setOptions: (options: AbLoopOptions) => void;
};

type V10PlayerElement = HTMLElement & {
  store?: { currentTime: number };
  stashAbLoop?: AbLoopPluginApi;
};

// The experimental Video.js 10 player element, when it is in use.
export const getVideoJs10Player = () =>
  document.querySelector<V10PlayerElement>("video-player");

export const getPlayerPosition = () =>
  getPlayer()?.currentTime() ?? getVideoJs10Player()?.store?.currentTime;

export const getAbLoopPlugin = () => {
  const player = getPlayer();
  if (!player) return getVideoJs10Player()?.stashAbLoop ?? null;
  const { abLoopPlugin } = player as VideoJsPlayer & {
    abLoopPlugin?: AbLoopPluginApi;
  };
  return abLoopPlugin ?? null;
};
