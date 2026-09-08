import videojs, { VideoJsPlayer } from "video.js";
import {
  ICastFile,
  ICastStream,
  isCastCapableBrowser,
  isLocalHost,
  pickCastStream,
  rewriteCastUrl,
  warmupCastUrl,
} from "src/utils/castMedia";

const DEFAULT_RECEIVER_ID = "CC1AD845";

export interface IStashChromecastMedia {
  streams: ICastStream[];
  file?: ICastFile;
  title: string;
}

export interface IStashChromecastOptions {
  enabled?: boolean;
  lanIp?: string;
  stashPort?: string | number;
  getMedia?: () => IStashChromecastMedia | null;
  onError?: (message: string) => void;
}

let initPromise: Promise<boolean> | null = null;

function getCastContext() {
  return window.cast?.framework
    ? window.cast.framework.CastContext.getInstance()
    : null;
}

export function initCastSdk(): Promise<boolean> {
  if (window.cast?.framework) {
    try {
      configureCastContext();
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve) => {
    const prev = window.__onGCastApiAvailable;
    window.__onGCastApiAvailable = (available, err) => {
      if (typeof prev === "function") {
        try {
          prev(available, err);
        } catch {
          /* ignore stock handlers */
        }
      }
      if (!available) {
        resolve(false);
        return;
      }
      try {
        configureCastContext();
        resolve(true);
      } catch {
        resolve(false);
      }
    };
  });

  return initPromise;
}

function configureCastContext() {
  const ctx = getCastContext();
  const chromeCast = window.chrome?.cast;
  if (!ctx || !chromeCast) throw new Error("Cast SDK not available");
  ctx.setOptions({
    receiverApplicationId:
      chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID || DEFAULT_RECEIVER_ID,
    autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
  });
}

class StashChromecastButton extends videojs.getComponent("Button") {
  onCastClick: () => void = () => undefined;

  buildCSSClass() {
    return `vjs-stash-chromecast-button ${super.buildCSSClass()}`;
  }

  handleClick() {
    this.onCastClick();
  }
}

class StashChromecastPlugin extends videojs.getPlugin("plugin") {
  private button: StashChromecastButton;
  private pluginOptions: IStashChromecastOptions;
  private connected = false;
  private busy = false;
  private watching = false;

  constructor(player: VideoJsPlayer, options?: IStashChromecastOptions) {
    super(player, options);
    this.pluginOptions = options ?? {};
    this.button = new StashChromecastButton(player);
    this.button.controlText("Cast");
    this.button.onCastClick = () => {
      void this.handleCastClick();
    };

    player.ready(() => {
      const { controlBar } = player;
      const fullscreenToggle = controlBar.getChild("fullscreenToggle");
      controlBar.addChild(this.button);
      if (fullscreenToggle) {
        controlBar.el().insertBefore(this.button.el(), fullscreenToggle.el());
      }
      this.syncEnabled();
      void this.watchCastState();
    });
  }

  public configure(options: IStashChromecastOptions) {
    this.pluginOptions = { ...this.pluginOptions, ...options };
    this.syncEnabled();
    void this.watchCastState();
  }

  private syncEnabled() {
    const enabled = this.pluginOptions.enabled === true;
    this.button[enabled ? "show" : "hide"]();
    this.updateButton();
  }

  private updateButton() {
    this.button.toggleClass("vjs-stash-chromecast-connected", this.connected);
    this.button.controlText(this.connected ? "Stop casting" : "Cast");
  }

  private async watchCastState() {
    if (this.pluginOptions.enabled !== true || !isCastCapableBrowser()) return;
    const ok = await initCastSdk();
    const ctx = getCastContext();
    if (!ok || !ctx || !window.cast) return;

    const sync = () => {
      this.connected = ctx.getCastState() === "CONNECTED";
      this.updateButton();
    };
    sync();
    if (this.watching) return;
    this.watching = true;
    ctx.addEventListener(
      window.cast.framework.CastContextEventType.CAST_STATE_CHANGED,
      sync
    );
    ctx.addEventListener(
      window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      sync
    );
  }

  private blockedReason(): string {
    if (!isCastCapableBrowser()) {
      return "Cast requires Chrome, Edge, or Opera";
    }
    if (!window.isSecureContext) {
      return "Cast requires HTTPS or localhost";
    }
    const media = this.pluginOptions.getMedia?.();
    const picked = media ? pickCastStream(media.streams, media.file) : null;
    if (!picked) {
      return "No Chromecast-safe MP4 or HLS stream";
    }
    try {
      const host = new URL(picked.url, window.location.href).hostname;
      if (isLocalHost(host) && !this.pluginOptions.lanIp) {
        return "Chromecast cannot fetch localhost";
      }
    } catch {
      /* ignore */
    }
    return "";
  }

  private async handleCastClick() {
    if (this.busy) return;
    const reason = this.blockedReason();
    if (reason && !this.connected) {
      this.pluginOptions.onError?.(reason);
      return;
    }

    const ctx = getCastContext();
    if (this.connected && ctx) {
      ctx.endCurrentSession(true);
      return;
    }

    const media = this.pluginOptions.getMedia?.();
    if (!media) {
      this.pluginOptions.onError?.("Nothing to cast");
      return;
    }
    const picked = pickCastStream(media.streams, media.file);
    if (!picked) {
      this.pluginOptions.onError?.("No Chromecast-safe MP4 or HLS stream");
      return;
    }

    this.busy = true;
    try {
      const ok = await initCastSdk();
      const castCtx = getCastContext();
      const chromeCast = window.chrome?.cast;
      if (!ok || !castCtx || !chromeCast) {
        throw new Error("Cast SDK did not load");
      }

      if (picked.transcode) {
        await warmupCastUrl(picked.url, picked.contentType.includes("mpegURL"));
      }

      let session = castCtx.getCurrentSession();
      if (!session) {
        await castCtx.requestSession();
        session = castCtx.getCurrentSession();
      }
      if (!session) throw new Error("No Cast session");

      const mediaUrl = rewriteCastUrl(
        picked.url,
        this.pluginOptions.lanIp ?? "",
        this.pluginOptions.stashPort
      );
      const mediaInfo = new chromeCast.media.MediaInfo(
        mediaUrl,
        picked.contentType
      );
      mediaInfo.streamType = chromeCast.media.StreamType.BUFFERED;
      if (media.file?.duration) mediaInfo.duration = media.file.duration;
      const metadata = new chromeCast.media.GenericMediaMetadata();
      metadata.metadataType = chromeCast.media.MetadataType.GENERIC;
      metadata.title = media.title;
      mediaInfo.metadata = metadata;

      const request = new chromeCast.media.LoadRequest(mediaInfo);
      request.autoplay = true;
      request.currentTime = this.player.currentTime() || 0;
      this.player.pause();
      await session.loadMedia(request);
    } catch (err) {
      const message =
        (err as { message?: string; description?: string }).message ||
        (err as { description?: string }).description ||
        String(err);
      if (!/cancel/i.test(message)) {
        this.pluginOptions.onError?.(message);
      }
    } finally {
      this.busy = false;
    }
  }
}

videojs.registerComponent("StashChromecastButton", StashChromecastButton);
videojs.registerPlugin("stashChromecast", StashChromecastPlugin);

declare module "video.js" {
  interface VideoJsPlayer {
    stashChromecast: () => StashChromecastPlugin;
  }
  interface VideoJsPlayerPluginOptions {
    stashChromecast?: IStashChromecastOptions;
  }
}

export default StashChromecastPlugin;
