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
  id: string;
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
  private wrapped = false;
  private loadedMediaId: string | null = null;
  private remotePlayer: CastRemotePlayer | null = null;
  private remoteController: CastRemotePlayerController | null = null;
  private originalPlay: VideoJsPlayer["play"] | null = null;
  private originalPause: VideoJsPlayer["pause"] | null = null;
  private originalPaused: VideoJsPlayer["paused"] | null = null;
  private originalCurrentTime: VideoJsPlayer["currentTime"] | null = null;

  constructor(player: VideoJsPlayer, options?: IStashChromecastOptions) {
    super(player, options);
    this.pluginOptions = options ?? {};
    this.button = new StashChromecastButton(player);
    this.button.controlText("Cast");
    this.button.onCastClick = () => {
      void this.handleCastClick();
    };

    player.ready(() => {
      this.wrapPlayerApi();
      const { controlBar } = player;
      const fullscreenToggle = controlBar.getChild("fullscreenToggle");
      controlBar.addChild(this.button);
      if (fullscreenToggle) {
        controlBar.el().insertBefore(this.button.el(), fullscreenToggle.el());
      }
      this.syncEnabled();
      void this.watchCastState();
    });

    player.on("dispose", () => {
      this.unwrapPlayerApi();
    });
  }

  public configure(options: IStashChromecastOptions) {
    this.pluginOptions = { ...this.pluginOptions, ...options };
    this.syncEnabled();
    void this.watchCastState();
  }

  public isCasting() {
    return this.connected;
  }

  public async loadCurrentMedia(startTime?: number) {
    if (!this.connected || this.busy) return;
    const media = this.pluginOptions.getMedia?.();
    const picked = media ? pickCastStream(media.streams, media.file) : null;
    if (!media || !picked) {
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

      const session = castCtx.getCurrentSession();
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
      const wasPlaying =
        !this.remotePlayer?.isMediaLoaded || !this.remotePlayer.isPaused;
      request.autoplay = wasPlaying;
      request.currentTime =
        startTime ??
        (this.originalCurrentTime
          ? Number(this.originalCurrentTime()) || 0
          : this.player.currentTime() || 0);
      this.pauseLocalTech();
      await session.loadMedia(request);
      this.loadedMediaId = media.id;
      if (wasPlaying) {
        this.player.trigger("playing");
      }
    } catch (err) {
      this.reportError(err);
    } finally {
      this.busy = false;
    }
  }

  private wrapPlayerApi() {
    if (this.wrapped) return;
    this.wrapped = true;
    this.originalPlay = this.player.play.bind(this.player);
    this.originalPause = this.player.pause.bind(this.player);
    this.originalPaused = this.player.paused.bind(this.player);
    this.originalCurrentTime = this.player.currentTime.bind(this.player);

    this.player.play = (() => {
      if (!this.connected) return this.originalPlay!();
      this.pauseLocalTech();
      void this.onLocalPlay();
      return Promise.resolve();
    }) as VideoJsPlayer["play"];

    this.player.pause = (() => {
      if (!this.connected) {
        this.originalPause!();
        return;
      }
      this.remotePause();
      this.player.trigger("pause");
    }) as VideoJsPlayer["pause"];

    this.player.paused = (() => {
      if (this.connected && this.remotePlayer?.isMediaLoaded) {
        return this.remotePlayer.isPaused;
      }
      return this.originalPaused!();
    }) as VideoJsPlayer["paused"];

    this.player.currentTime = ((value?: number) => {
      if (!this.connected || !this.remotePlayer) {
        if (typeof value !== "number") return this.originalCurrentTime!();
        return this.originalCurrentTime!(value);
      }
      if (typeof value !== "number") {
        return this.remotePlayer.isMediaLoaded
          ? this.remotePlayer.currentTime
          : this.originalCurrentTime!();
      }
      this.remoteSeek(value);
      this.originalCurrentTime!(value);
      return value;
    }) as VideoJsPlayer["currentTime"];
  }

  private unwrapPlayerApi() {
    if (!this.wrapped) return;
    this.player.play = this.originalPlay as VideoJsPlayer["play"];
    this.player.pause = this.originalPause as VideoJsPlayer["pause"];
    this.player.paused = this.originalPaused as VideoJsPlayer["paused"];
    this.player.currentTime = this
      .originalCurrentTime as VideoJsPlayer["currentTime"];
    this.wrapped = false;
  }

  private pauseLocalTech() {
    const el = this.player.tech(true)?.el();
    if (el instanceof HTMLMediaElement && !el.paused) {
      el.pause();
    }
  }

  private async onLocalPlay() {
    const media = this.pluginOptions.getMedia?.();
    if (!media) return;
    if (this.loadedMediaId !== media.id || !this.remotePlayer?.isMediaLoaded) {
      await this.loadCurrentMedia();
      return;
    }
    this.remotePlay();
    this.player.trigger("playing");
  }

  private remotePlay() {
    if (this.remotePlayer?.isPaused) {
      this.remoteController?.playOrPause();
    }
  }

  private remotePause() {
    if (this.remotePlayer && !this.remotePlayer.isPaused) {
      this.remoteController?.playOrPause();
    }
  }

  private remoteSeek(time: number) {
    if (!this.remotePlayer || !this.remoteController) return;
    this.remotePlayer.currentTime = time;
    this.remoteController.seek();
  }

  private syncEnabled() {
    const enabled = this.pluginOptions.enabled === true;
    this.button[enabled ? "show" : "hide"]();
    this.updateButton();
  }

  private updateButton() {
    this.button.toggleClass("vjs-stash-chromecast-connected", this.connected);
    this.button.controlText(this.connected ? "Stop casting" : "Cast");
    this.player.toggleClass("vjs-stash-chromecasting", this.connected);
    const name = this.remotePlayer?.displayName;
    if (this.connected && name) {
      this.player.el().setAttribute("data-cast-device", name);
    } else {
      this.player.el().removeAttribute("data-cast-device");
    }
  }

  private bindRemotePlayer() {
    const framework = window.cast?.framework;
    if (!framework?.RemotePlayer || this.remotePlayer) return;
    this.remotePlayer = new framework.RemotePlayer();
    this.remoteController = new framework.RemotePlayerController(
      this.remotePlayer
    );
    const type = framework.RemotePlayerEventType;
    this.remoteController.addEventListener(
      type.CURRENT_TIME_CHANGED,
      this.onRemoteTime
    );
    this.remoteController.addEventListener(
      type.IS_PAUSED_CHANGED,
      this.onRemotePaused
    );
    this.remoteController.addEventListener(
      type.PLAYER_STATE_CHANGED,
      this.onRemotePlayerState
    );
  }

  private onRemoteTime = () => {
    if (!this.connected || !this.remotePlayer || !this.originalCurrentTime) {
      return;
    }
    this.originalCurrentTime(this.remotePlayer.currentTime);
    this.player.trigger("timeupdate");
  };

  private onRemotePaused = () => {
    if (!this.connected || !this.remotePlayer) return;
    this.player.trigger(this.remotePlayer.isPaused ? "pause" : "playing");
  };

  private onRemotePlayerState = () => {
    if (!this.connected || !this.remotePlayer) return;
    const finished =
      this.remotePlayer.playerState === "IDLE" &&
      getCastContext()?.getCurrentSession()?.getMediaSession()?.idleReason ===
        "FINISHED";
    if (finished) {
      this.loadedMediaId = null;
      this.player.trigger("ended");
    }
  };

  private async watchCastState() {
    if (this.pluginOptions.enabled !== true || !isCastCapableBrowser()) return;
    const ok = await initCastSdk();
    const ctx = getCastContext();
    if (!ok || !ctx || !window.cast) return;
    this.bindRemotePlayer();

    const sync = () => {
      const next = ctx.getCastState() === "CONNECTED";
      if (this.connected && !next) {
        this.loadedMediaId = null;
      }
      this.connected = next;
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

    this.busy = true;
    try {
      const ok = await initCastSdk();
      const castCtx = getCastContext();
      if (!ok || !castCtx) {
        throw new Error("Cast SDK did not load");
      }
      if (!castCtx.getCurrentSession()) {
        await castCtx.requestSession();
      }
      if (!castCtx.getCurrentSession()) throw new Error("No Cast session");
      this.connected = true;
      this.updateButton();
      this.busy = false;
      await this.loadCurrentMedia();
    } catch (err) {
      this.busy = false;
      this.reportError(err);
    }
  }

  private reportError(err: unknown) {
    const message =
      (err as { message?: string; description?: string }).message ||
      (err as { description?: string }).description ||
      String(err);
    if (!/cancel/i.test(message)) {
      this.pluginOptions.onError?.(message);
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
