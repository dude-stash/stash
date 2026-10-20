import videojs, { VideoJsPlayer } from "video.js";
import type { DocumentNode } from "graphql";
import { getClient } from "src/core/StashService";
import * as GQL from "src/core/generated-graphql";

type Status = GQL.ChromecastStatusDataFragment;

interface IDevice {
  name: string;
  address: string;
}

interface IChromecastServerOptions {
  enabled?: boolean;
}

interface ITechOptions {
  playerId: string;
  poster?: string;
  source: videojs.Tech.SourceObject;
}

// lets a seek that follows a new source straight away become its start time
const castDelay = 50;
const noticeDuration = 6000;

// Video.js only asks techs whether they can play a source, so the casting player is tracked here
let castingPlayerId: string | null = null;

const Tech = videojs.getComponent("Tech") as unknown as new (
  options: ITechOptions,
  ready?: () => void
) => videojs.Component;

function sceneIdFromSource(source?: videojs.Tech.SourceObject) {
  if (!source?.src) return;
  return /\/scene\/(\d+)\/stream/.exec(source.src)?.[1];
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

const State = GQL.ChromecastPlaybackState;

class ChromecastServerTech extends Tech {
  private plugin: ChromecastServerPlugin;
  private sceneId?: string;
  private status?: Status;
  private statusAt = 0;
  // true until the device starts playing the scene sent to it
  private loading = false;
  private pendingTime = 0;
  private castTimeout?: number;
  private played = false;
  // the scene couldn't be cast, but the device is still connected for the next one
  private failed = false;
  // the player gives a new tech the browser's volume, which shouldn't change the device's
  private acceptVolume = false;

  constructor(options: ITechOptions, ready?: () => void) {
    super(options, ready);

    this.plugin = videojs.getPlayer(options.playerId)!.chromecastServer();
    this.plugin.attachTech(this);
    this.setPoster(options.poster ?? "");

    // the player only listens to the tech's events once it has been constructed
    this.ready(() => {
      this.setSource(options.source);
      this.setTimeout(() => {
        this.acceptVolume = true;
      }, 0);
    });
    this.triggerReady();
  }

  // runs inside the base constructor, before this class's fields exist
  createEl() {
    const el = videojs.dom.createEl("div", {
      className: "vjs-tech vjs-chromecast-server-tech",
    });
    el.appendChild(
      videojs.dom.createEl("div", {
        className: "vjs-chromecast-server-poster",
      })
    );
    const info = videojs.dom.createEl("div", {
      className: "vjs-chromecast-server-info",
    });
    info.appendChild(
      videojs.dom.createEl("div", { className: "vjs-chromecast-server-title" })
    );
    info.appendChild(
      videojs.dom.createEl("div", { className: "vjs-chromecast-server-state" })
    );
    el.appendChild(info);
    return el;
  }

  dispose() {
    window.clearTimeout(this.castTimeout);
    this.plugin.detachTech(this);
    super.dispose();
  }

  setSource(source?: videojs.Tech.SourceObject) {
    const sceneId = sceneIdFromSource(source);
    if (!sceneId || sceneId === this.sceneId) return;
    this.sceneId = sceneId;

    const status = this.plugin.deviceStatus();
    if (status?.scene_id === sceneId && status.state !== State.Idle) {
      // already casting this scene, such as after reloading the page
      this.onStatus(status);
      return;
    }

    this.castScene(this.plugin.takeStartTime());
  }

  private castScene(time: number) {
    const { sceneId } = this;
    if (!sceneId) return;

    this.loading = true;
    this.played = false;
    this.failed = false;
    this.status = undefined;
    this.pendingTime = time;
    this.updateInfo();
    this.trigger("waiting");
    this.trigger("play");

    window.clearTimeout(this.castTimeout);
    this.castTimeout = window.setTimeout(() => {
      this.plugin.castScene(sceneId, this.pendingTime);
    }, castDelay);
  }

  onStatus(status: Status) {
    const prev = this.status;
    this.status = status;
    this.statusAt = performance.now();

    if (!status.connected) {
      this.plugin.end(status.error ?? undefined);
      return;
    }

    if (status.scene_id !== this.sceneId) {
      // statuses from before the device took the scene
      if (!this.loading) {
        this.plugin.end(`${status.name} is playing something else`);
      }
      return;
    }

    if (status.error) {
      this.fail();
      return;
    }

    if (this.loading) {
      if (status.state === State.Idle || status.state === State.Buffering) {
        return;
      }
      this.loading = false;
      this.trigger("canplay");
    }

    if (status.duration !== prev?.duration) this.trigger("durationchange");
    if (status.volume !== prev?.volume || status.muted !== prev?.muted) {
      this.trigger("volumechange");
    }

    if (status.state !== prev?.state) {
      switch (status.state) {
        case State.Playing:
          this.played = true;
          this.trigger("play");
          this.trigger("playing");
          break;
        case State.Buffering:
          this.trigger("waiting");
          break;
        case State.Paused:
          this.trigger("pause");
          break;
        case State.Finished:
          this.trigger("pause");
          this.trigger("ended");
          break;
        case State.Idle:
          if (this.played) {
            // closed on the device, such as with the TV's remote
            this.plugin.end(`${status.name} stopped playing`);
            return;
          }
          break;
      }
    }

    this.trigger("timeupdate");
    this.updateInfo();
  }

  private fail() {
    this.loading = false;
    this.failed = true;
    this.trigger("pause");
    this.plugin.stopWaiting();
    this.updateInfo();
  }

  updateInfo() {
    const el = this.el();
    const title = el.querySelector(".vjs-chromecast-server-title");
    const state = el.querySelector(".vjs-chromecast-server-state");
    const device = this.plugin.getDevice();

    if (title) {
      title.textContent = device ? `Casting to ${device.name}` : "";
    }
    if (state) {
      let text = "";
      if (this.loading) text = "Loading…";
      else if (this.failed) text = this.status?.error ?? "";
      else if (this.status?.state === State.Finished) text = "Finished";
      else if (this.status?.state === State.Paused) text = "Paused";
      state.textContent = text;
      state.classList.toggle("vjs-chromecast-server-error", this.failed);
    }
  }

  play() {
    if (!this.paused()) return;

    if (this.failed) {
      this.castScene(this.pendingTime);
      return;
    }
    if (this.ended()) {
      this.castScene(0);
      return;
    }

    this.plugin.command(GQL.ChromecastResumeDocument);
    this.setOptimisticState(State.Playing);
    this.trigger("play");
  }

  pause() {
    if (this.paused()) return;

    this.plugin.command(GQL.ChromecastPauseDocument);
    this.setOptimisticState(State.Paused);
    this.trigger("pause");
  }

  private setOptimisticState(state: GQL.ChromecastPlaybackState) {
    if (!this.status) return;
    this.status = { ...this.status, time: this.currentTime(), state };
    this.statusAt = performance.now();
    this.updateInfo();
  }

  paused() {
    if (this.loading) return false;
    const state = this.status?.state;
    return state !== State.Playing && state !== State.Buffering;
  }

  ended() {
    return this.status?.state === State.Finished;
  }

  currentTime() {
    if (this.loading || this.failed || !this.status) return this.pendingTime;

    let { time } = this.status;
    if (this.status.state === State.Playing) {
      time += (performance.now() - this.statusAt) / 1000;
    }
    const duration = this.duration();
    return duration > 0 ? Math.min(time, duration) : time;
  }

  setCurrentTime(seconds: number) {
    if (this.loading || this.failed || this.ended()) {
      // the device can't seek before it has loaded the scene or after it has stopped, so start there instead
      this.castScene(seconds);
      return;
    }

    this.plugin.command(GQL.ChromecastSeekDocument, { time: seconds });
    if (this.status) {
      this.status = { ...this.status, time: seconds };
      this.statusAt = performance.now();
    }
    this.trigger("timeupdate");
  }

  duration() {
    return this.status?.duration || NaN;
  }

  buffered() {
    return videojs.createTimeRanges(0, this.duration() || 0);
  }

  seekable() {
    return videojs.createTimeRanges(0, this.duration() || 0);
  }

  volume() {
    return this.status?.volume ?? 1;
  }

  setVolume(volume: number) {
    if (!this.acceptVolume) return;

    this.plugin.command(GQL.ChromecastSetVolumeDocument, { volume });
    if (this.status) this.status = { ...this.status, volume };
    this.trigger("volumechange");
  }

  muted() {
    return this.status?.muted ?? false;
  }

  setMuted(muted: boolean) {
    if (!this.acceptVolume || muted === this.muted()) return;

    this.plugin.command(GQL.ChromecastSetMutedDocument, { muted });
    if (this.status) this.status = { ...this.status, muted };
    this.trigger("volumechange");
  }

  defaultMuted() {
    return false;
  }

  poster() {
    const el = this.el().querySelector<HTMLElement>(
      ".vjs-chromecast-server-poster"
    );
    return el?.dataset.poster ?? "";
  }

  setPoster(poster: string) {
    const el = this.el().querySelector<HTMLElement>(
      ".vjs-chromecast-server-poster"
    );
    if (!el) return;
    el.dataset.poster = poster;
    el.style.backgroundImage = poster ? `url("${poster}")` : "";
  }

  currentSrc() {
    return "";
  }

  readyState() {
    return this.loading ? 0 : 4;
  }

  networkState() {
    return 1;
  }

  seeking() {
    return false;
  }

  playbackRate() {
    return 1;
  }

  setPlaybackRate() {}

  defaultPlaybackRate() {
    return 1;
  }

  preload() {
    return "none";
  }

  setPreload() {}

  autoplay() {
    return false;
  }

  setAutoplay() {}

  loop() {
    return false;
  }

  setLoop() {}

  controls() {
    return false;
  }

  setControls() {}

  playsinline() {
    return true;
  }

  supportsFullScreen() {
    return true;
  }

  videoWidth() {
    return 0;
  }

  videoHeight() {
    return 0;
  }

  load() {}

  reset() {}

  // the player loads the first supported tech before it has a source
  static isSupported() {
    return castingPlayerId !== null;
  }

  static canPlaySource() {
    return castingPlayerId !== null ? "probably" : "";
  }

  static canPlayType() {
    return castingPlayerId !== null ? "probably" : "";
  }
}

class ChromecastServerMenuItem extends videojs.getComponent("MenuItem") {
  constructor(player: VideoJsPlayer, label: string, onSelect?: () => void) {
    super(player, { label, selectable: false } as videojs.MenuItemOptions);

    if (onSelect) {
      this.on("click", onSelect);
    } else {
      this.disable();
    }
  }

  handleClick() {}
}

class ChromecastServerButton extends videojs.getComponent("MenuButton") {
  private plugin?: ChromecastServerPlugin;
  private devices?: IDevice[];
  private searching = false;
  private searchError?: string;

  constructor(player: VideoJsPlayer, plugin: ChromecastServerPlugin) {
    super(player);
    this.plugin = plugin;
    this.menuButton_.controlText("Cast");
    this.update();
  }

  createEl() {
    return videojs.dom.createEl("div", {
      className:
        "vjs-chromecast-server-button vjs-menu-button vjs-menu-button-popup vjs-control vjs-button",
    });
  }

  createItems() {
    const { plugin } = this;
    if (!plugin) return [];

    const player = this.player();
    const device = plugin.getDevice();
    if (device) {
      return [
        new ChromecastServerMenuItem(
          player,
          `Stop casting to ${device.name}`,
          () => plugin.stop()
        ),
      ];
    }

    const items = (this.devices ?? []).map(
      (d) => new ChromecastServerMenuItem(player, d.name, () => plugin.start(d))
    );
    if (this.searching) {
      items.push(new ChromecastServerMenuItem(player, "Searching…"));
    } else if (this.searchError) {
      items.push(
        new ChromecastServerMenuItem(
          player,
          `Couldn't search for Chromecasts: ${this.searchError}`
        )
      );
    } else if (items.length === 0) {
      items.push(new ChromecastServerMenuItem(player, "No Chromecasts found"));
    }
    return items;
  }

  update() {
    super.update();
    this.toggleClass(
      "vjs-chromecast-server-casting",
      !!this.plugin?.getDevice()
    );
  }

  private isOpen() {
    return !!this.menu?.hasClass("vjs-lock-showing");
  }

  handleClick(event: videojs.EventTarget.Event) {
    const opening = !this.isOpen();
    super.handleClick(event);
    if (opening && this.plugin && !this.plugin.getDevice()) this.search();
  }

  // update replaces the menu, and the menu closes when its focused item goes, so focus the button first
  private refresh() {
    const open = this.isOpen();
    if (open) this.menuButton_.focus();
    this.update();
    if (open) this.pressButton();
  }

  private async search() {
    if (this.searching) return;
    this.searching = true;
    this.searchError = undefined;
    this.refresh();

    try {
      const result = await getClient().query<GQL.ChromecastDevicesQuery>({
        query: GQL.ChromecastDevicesDocument,
        fetchPolicy: "network-only",
      });
      this.devices = result.data.chromecastDevices;
    } catch (err) {
      this.searchError = errorMessage(err);
    }

    this.searching = false;
    this.refresh();
  }
}

class ChromecastServerPlugin extends videojs.getPlugin("plugin") {
  private enabled = false;
  private button?: ChromecastServerButton;
  private tech?: ChromecastServerTech;
  private device: IDevice | null = null;
  private sessions: Status[] = [];
  private sceneId?: string;
  private sceneStartTime = 0;
  private startTime = 0;
  private browserVolume = 1;
  private browserMuted = false;
  private notice?: HTMLElement;
  private noticeTimeout?: number;

  constructor(player: VideoJsPlayer, options?: IChromecastServerOptions) {
    super(player, options);

    this.enabled = options?.enabled ?? false;
    if (!this.enabled) return;

    const button = new ChromecastServerButton(player, this);
    this.button = button;

    player.ready(() => {
      const { controlBar } = player;
      const fullscreenToggle = controlBar.getChild("fullscreenToggle")!.el();
      controlBar.addChild(button);
      controlBar.el().insertBefore(button.el(), fullscreenToggle);
    });

    const subscription = getClient()
      .subscribe<GQL.ChromecastSubscribeSubscription>({
        query: GQL.ChromecastSubscribeDocument,
      })
      .subscribe({
        next: (result) => {
          const status = result.data?.chromecastSubscribe;
          if (status) this.onStatus(status);
        },
      });

    getClient()
      .query<GQL.ChromecastSessionsQuery>({
        query: GQL.ChromecastSessionsDocument,
        fetchPolicy: "network-only",
      })
      .then((result) => {
        for (const s of result.data.chromecastSessions) this.updateSession(s);
        this.resume();
      })
      .catch(() => {});

    player.on("dispose", () => {
      subscription.unsubscribe();
      if (castingPlayerId === player.id()) castingPlayerId = null;
    });
  }

  // picks up a cast that is already playing the scene, such as after reloading the page, or casts the scene to a device that is playing another one
  setScene(sceneId: string, startTime: number) {
    this.sceneId = sceneId;
    this.sceneStartTime = startTime;
    this.resume();
  }

  private resume() {
    if (!this.enabled || this.device || !this.sceneId) return;

    // a scene that couldn't be cast leaves the device idle, but still in use
    const playing = (s: Status) =>
      !!s.scene_id && (s.state !== State.Idle || !!s.error);

    const session = this.sessions.find(
      (s) => s.scene_id === this.sceneId && playing(s)
    );
    if (session) {
      this.start(session, session.time);
      return;
    }

    // sessions without a scene were taken over by another sender, so they're left alone
    const casting = this.sessions.find(playing);
    if (casting) this.start(casting, this.sceneStartTime);
  }

  private updateSession(status: Status) {
    this.sessions = this.sessions.filter((s) => s.address !== status.address);
    if (status.connected) this.sessions.push(status);
  }

  private onStatus(status: Status) {
    this.updateSession(status);
    if (status.address === this.device?.address) {
      this.tech?.onStatus(status);
    }
  }

  getDevice() {
    return this.device;
  }

  stopWaiting() {
    this.player.removeClass("vjs-waiting");
  }

  deviceStatus() {
    return this.sessions.find((s) => s.address === this.device?.address);
  }

  attachTech(tech: ChromecastServerTech) {
    this.tech = tech;
  }

  detachTech(tech: ChromecastServerTech) {
    if (this.tech === tech) this.tech = undefined;
  }

  takeStartTime() {
    const time = this.startTime;
    this.startTime = 0;
    return time;
  }

  start(device: IDevice, time = this.player.currentTime()) {
    const { player } = this;

    this.device = { name: device.name, address: device.address };
    this.startTime = time;
    this.browserVolume = player.volume();
    this.browserMuted = player.muted();
    player.persistVolume().enabled = false;
    castingPlayerId = player.id();
    this.button?.update();

    // reloading the source makes Video.js pick the casting tech
    player.src(player.currentSources());
  }

  // returns to playing in the browser, paused where the device was
  end(message?: string) {
    if (!this.device) return;

    const { player } = this;
    const time = player.currentTime();
    this.device = null;
    castingPlayerId = null;
    this.button?.update();
    if (message) this.showNotice(message);

    const volume = this.browserVolume;
    const muted = this.browserMuted;
    // the browser's tech starts paused, so clear the cast's playing and loading state
    this.tech?.trigger("pause");
    player.removeClass("vjs-waiting");
    player.src(player.currentSources());
    // the player fires ready again once the browser's tech has loaded
    player.one("ready", () => {
      player.volume(volume);
      player.muted(muted);
      player.persistVolume().enabled = true;
      // the player counts the source as changing until the next tick, and would only seek once playback starts
      player.setTimeout(() => player.currentTime(time), 1);
    });
  }

  stop() {
    const { device } = this;
    this.end();
    if (device) this.command(GQL.ChromecastStopDocument, {}, device.address);
  }

  castScene(sceneId: string, time: number) {
    const { device } = this;
    if (!device) return;

    getClient()
      .mutate({
        mutation: GQL.ChromecastPlayDocument,
        variables: {
          input: { address: device.address, scene_id: sceneId, time },
        },
      })
      .catch((err) =>
        this.end(`Couldn't cast to ${device.name}: ${errorMessage(err)}`)
      );
  }

  command(
    mutation: DocumentNode,
    variables: Record<string, unknown> = {},
    address = this.device?.address
  ) {
    if (!address) return;

    getClient()
      .mutate({ mutation, variables: { address, ...variables } })
      .catch((err) => this.showNotice(`Chromecast: ${errorMessage(err)}`));
  }

  private showNotice(message: string) {
    if (!this.notice) {
      this.notice = videojs.dom.createEl("div", {
        className: "vjs-chromecast-server-notice",
      }) as HTMLElement;
      this.player.el().appendChild(this.notice);
    }

    this.notice.textContent = message;
    this.notice.classList.add("vjs-chromecast-server-notice-visible");
    window.clearTimeout(this.noticeTimeout);
    this.noticeTimeout = window.setTimeout(() => {
      this.notice?.classList.remove("vjs-chromecast-server-notice-visible");
    }, noticeDuration);
  }
}

videojs.registerTech("ChromecastServer", ChromecastServerTech);
videojs.registerPlugin("chromecastServer", ChromecastServerPlugin);

declare module "video.js" {
  interface VideoJsPlayer {
    chromecastServer: () => ChromecastServerPlugin;
  }
  interface VideoJsPlayerPluginOptions {
    chromecastServer?: IChromecastServerOptions;
  }
}

export default ChromecastServerPlugin;
