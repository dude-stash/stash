import videojs, { VideoJsPlayer } from "video.js";
import {
  type ICastFile,
  type ICastStream,
  isLocalHost,
  pickCastSource,
  rewriteCastUrl,
  warmupCastUrl,
} from "src/utils/castMedia";
import { isCastSenderOriginAllowed, isCastSenderSupported } from "./sdk";
import { CastSession } from "./session";

export interface IChromecastScene {
  id: string;
  title: string;
  streams: ICastStream[];
  file?: ICastFile;
}

export interface IChromecastOptions {
  enabled?: boolean;
  // Address the device should fetch from, from systemStatus.localIPs.
  lanIp?: string;
  scene?: IChromecastScene | null;
  onError?: (message: string) => void;
}

class ChromecastButton extends videojs.getComponent("Button") {
  public onCastClick: () => void = () => undefined;

  buildCSSClass() {
    // The same class the previous Cast button used, so the control bar rules
    // in styles.scss keep applying unchanged.
    return `vjs-chromecast-button ${super.buildCSSClass()}`;
  }

  handleClick() {
    this.onCastClick();
  }
}

/**
 * Casts the current scene to a Chromecast.
 *
 * Google's Cast Application Framework is driven directly rather than through a
 * Video.js tech: a tech would hand the device whatever the browser is playing,
 * which is a stream chosen for a browser, at an address only this machine can
 * resolve.
 */
class ChromecastPlugin extends videojs.getPlugin("plugin") {
  private button: ChromecastButton;
  private session = new CastSession();
  private options: IChromecastOptions = {};
  private busy = false;

  constructor(player: VideoJsPlayer, options?: IChromecastOptions) {
    super(player, options);

    this.options = options ?? {};

    this.button = new ChromecastButton(player);
    this.button.onCastClick = () => {
      void this.toggleCast();
    };

    // Registered before ready() so a device that connects while the player is
    // still setting up is not missed.
    this.session.onConnectionChange(() => this.updateButton());

    player.ready(() => {
      const { controlBar } = player;
      controlBar.addChild(this.button);

      // Sit immediately left of the fullscreen toggle, where the button has
      // always been.
      const fullscreenToggle = controlBar.getChild("fullscreenToggle");
      if (fullscreenToggle) {
        controlBar.el().insertBefore(this.button.el(), fullscreenToggle.el());
      }

      this.applyOptions();
    });

    player.on("dispose", () => this.session.destroy());
  }

  /** Called by the scene player whenever the config or the scene changes. */
  public configure(options: IChromecastOptions) {
    this.options = { ...this.options, ...options };
    this.applyOptions();
  }

  private applyOptions() {
    const enabled = this.options.enabled === true;

    if (enabled) {
      this.button.show();
      void this.session.watch();
    } else {
      this.button.hide();
    }

    this.updateButton();
  }

  private updateButton() {
    const casting = this.session.isConnected();

    this.button.toggleClass("vjs-chromecast-casting", casting);
    this.button.controlText(
      this.player.localize(casting ? "Stop casting" : "Cast")
    );
  }

  /**
   * Explains why casting cannot start, or an empty string when it can. Checked
   * before opening the device picker so the user gets a reason instead of a
   * device that connects and then sits there.
   */
  private blockedReason(source: ReturnType<typeof pickCastSource>): string {
    if (!isCastSenderSupported()) {
      return this.player.localize("Casting needs Chrome, Edge, or Opera");
    }

    if (!isCastSenderOriginAllowed()) {
      return this.player.localize(
        "Casting needs Stash to be open over HTTPS or as http://localhost"
      );
    }

    if (!source) {
      return this.player.localize(
        "This scene has no stream a Chromecast can play"
      );
    }

    try {
      const { hostname } = new URL(source.url, window.location.href);
      if (isLocalHost(hostname) && !this.options.lanIp) {
        return this.player.localize(
          "A Chromecast cannot fetch localhost, and Stash found no LAN address for this machine"
        );
      }
    } catch {
      return this.player.localize(
        "This scene has no stream a Chromecast can play"
      );
    }

    return "";
  }

  private async toggleCast() {
    if (this.busy) return;

    if (this.session.isConnected()) {
      this.session.disconnect();
      return;
    }

    const source = this.currentSource();
    const reason = this.blockedReason(source);
    if (reason) {
      this.options.onError?.(reason);
      return;
    }

    this.busy = true;
    try {
      await this.session.connect();
      await this.loadCurrentScene();
    } catch (err) {
      this.reportError(err);
    } finally {
      this.busy = false;
      this.updateButton();
    }
  }

  private currentSource() {
    const scene = this.options.scene;
    if (!scene) return null;
    return pickCastSource(scene.streams, scene.file);
  }

  private async loadCurrentScene() {
    const scene = this.options.scene;
    const source = this.currentSource();
    if (!scene || !source) return;

    // Start the transcode before the device asks for it, so it is not waiting
    // on a cold ffmpeg.
    if (source.transcode) {
      await warmupCastUrl(source.url);
    }

    await this.session.load({
      url: rewriteCastUrl(source.url, this.options.lanIp ?? ""),
      contentType: source.contentType,
      title: scene.title,
      duration: scene.file?.duration,
      startTime: this.player.currentTime() || 0,
      autoplay: !this.player.paused(),
    });
  }

  private reportError(err: unknown) {
    const message =
      (err as { message?: string })?.message ??
      (err as { description?: string })?.description ??
      String(err);

    // Dismissing the device picker rejects too; that is not an error.
    if (/cancel/i.test(message)) return;

    this.options.onError?.(message);
  }
}

videojs.registerComponent("ChromecastButton", ChromecastButton);
videojs.registerPlugin("chromecast", ChromecastPlugin);

declare module "video.js" {
  interface VideoJsPlayer {
    chromecast: () => ChromecastPlugin;
  }
  interface VideoJsPlayerPluginOptions {
    chromecast?: IChromecastOptions;
  }
}

export default ChromecastPlugin;
