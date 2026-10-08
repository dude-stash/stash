import videojs, { VideoJsPlayer } from "video.js";
import localForage from "localforage";

const levelKey = "volume-level";
const mutedKey = "volume-muted";

interface IPersistVolumeOptions {
  enabled?: boolean;
}

// While casting, the volume controls move the device, whose level is not the one chosen for this browser.
function isCasting(player: VideoJsPlayer) {
  return !!player.el()?.querySelector(".vjs-tech-chromecast");
}

class PersistVolumePlugin extends videojs.getPlugin("plugin") {
  enabled: boolean;

  constructor(player: VideoJsPlayer, options?: IPersistVolumeOptions) {
    super(player, options);

    this.enabled = options?.enabled ?? true;

    player.on("volumechange", () => {
      if (this.enabled && !isCasting(player)) {
        localForage.setItem(levelKey, player.volume());
        localForage.setItem(mutedKey, player.muted());
      }
    });

    player.ready(() => {
      this.ready();
    });

    // Video.js hands each new tech the volume it last set, which would force the browser's level onto the device.
    player.on("chromecastConnected", () => {
      player.getCache().volume = undefined;
    });

    // The player comes back from casting with the device's volume.
    player.on("chromecastDisconnected", () => {
      player.one("loadstart", () => this.ready());
    });
  }

  private ready() {
    localForage.getItem<number>(levelKey).then((value) => {
      if (value !== null && !isCasting(this.player)) {
        this.player.volume(value);
      }
    });

    localForage.getItem<boolean>(mutedKey).then((value) => {
      if (value !== null && !isCasting(this.player)) {
        this.player.muted(value);
      }
    });
  }
}

// Register the plugin with video.js.
videojs.registerPlugin("persistVolume", PersistVolumePlugin);

declare module "video.js" {
  interface VideoJsPlayer {
    persistVolume: () => PersistVolumePlugin;
  }
  interface VideoJsPlayerPluginOptions {
    persistVolume?: IPersistVolumeOptions;
  }
}

export default PersistVolumePlugin;
