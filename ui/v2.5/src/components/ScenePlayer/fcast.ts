import videojs, { VideoJsPlayer } from "video.js";
import type { DocumentNode } from "graphql";
import { getClient } from "src/core/StashService";
import * as GQL from "src/core/generated-graphql";

type Status = GQL.FCastStatusDataFragment;

interface IReceiver {
  name: string;
  address: string;
}

interface IFCastOptions {
  enabled?: boolean;
}

interface ITechOptions {
  playerId: string;
  poster?: string;
  source: videojs.Tech.SourceObject;
}

// receivers report the end of a video as paused or idle at its duration
const endedMargin = 1;
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

class FCastTech extends Tech {
  private plugin: FCastPlugin;
  private sceneId?: string;
  private status?: Status;
  private statusAt = 0;
  // true until the receiver reports playing the scene sent to it
  private loading = false;
  private pendingTime = 0;
  private castTimeout?: number;
  private played = false;
  private hasEnded = false;
  private isMuted = false;
  private unmutedVolume = 1;
  // the player gives a new tech the browser's volume, which shouldn't change the receiver's
  private acceptVolume = false;

  constructor(options: ITechOptions, ready?: () => void) {
    super(options, ready);

    this.plugin = videojs.getPlayer(options.playerId)!.fcast();
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
      className: "vjs-tech vjs-fcast-tech",
    });
    el.appendChild(
      videojs.dom.createEl("div", { className: "vjs-fcast-poster" })
    );
    const info = videojs.dom.createEl("div", { className: "vjs-fcast-info" });
    info.appendChild(
      videojs.dom.createEl("div", { className: "vjs-fcast-title" })
    );
    info.appendChild(
      videojs.dom.createEl("div", { className: "vjs-fcast-state" })
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

    const status = this.plugin.receiverStatus();
    if (status?.scene_id === sceneId) {
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
    this.hasEnded = false;
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
    const prevTime = this.currentTime();
    this.status = status;
    this.statusAt = performance.now();

    if (!status.connected) {
      this.plugin.end(status.error ?? undefined);
      return;
    }

    // statuses from before the receiver took the play request
    if (status.scene_id !== this.sceneId) {
      if (!this.loading) {
        this.plugin.end(`${status.name} is playing something else`);
      }
      return;
    }

    if (status.error) {
      this.plugin.end(
        `${status.name} couldn't play the scene: ${status.error}`
      );
      return;
    }

    if (this.loading) {
      if (status.state === GQL.FCastPlaybackState.Idle) return;
      this.loading = false;
      this.trigger("canplay");
    }

    if (status.duration !== prev?.duration) this.trigger("durationchange");
    if (status.volume !== prev?.volume) this.trigger("volumechange");

    const nearEnd = (time: number) =>
      status.duration > 0 && time >= status.duration - endedMargin;

    switch (status.state) {
      case GQL.FCastPlaybackState.Playing:
        this.played = true;
        this.hasEnded = false;
        if (prev?.state !== status.state) {
          this.trigger("play");
          this.trigger("playing");
        }
        break;
      case GQL.FCastPlaybackState.Paused:
        if (prev?.state !== status.state) this.trigger("pause");
        if (this.played && !this.hasEnded && nearEnd(status.time)) {
          this.setEnded();
        }
        break;
      case GQL.FCastPlaybackState.Idle:
        if (!this.played || this.hasEnded) break;
        if (nearEnd(prevTime)) {
          this.setEnded();
        } else {
          // closed on the receiver
          this.plugin.end(`${status.name} stopped playing`);
          return;
        }
        break;
    }

    this.trigger("timeupdate");
    this.updateInfo();
  }

  private setEnded() {
    this.hasEnded = true;
    this.trigger("pause");
    this.trigger("ended");
  }

  updateInfo() {
    const el = this.el();
    const title = el.querySelector(".vjs-fcast-title");
    const state = el.querySelector(".vjs-fcast-state");
    const receiver = this.plugin.getReceiver();

    if (title) {
      title.textContent = receiver ? `Casting to ${receiver.name}` : "";
    }
    if (state) {
      let text = "";
      if (this.loading) text = "Loading…";
      else if (this.hasEnded) text = "Finished";
      else if (this.status?.state === GQL.FCastPlaybackState.Paused) {
        text = "Paused";
      }
      state.textContent = text;
    }
  }

  play() {
    if (!this.paused()) return;

    if (this.hasEnded) {
      this.castScene(0);
      return;
    }

    this.plugin.command(GQL.FCastResumeDocument);
    this.setOptimisticState(GQL.FCastPlaybackState.Playing);
    this.trigger("play");
  }

  pause() {
    if (this.paused()) return;

    this.plugin.command(GQL.FCastPauseDocument);
    this.setOptimisticState(GQL.FCastPlaybackState.Paused);
    this.trigger("pause");
  }

  private setOptimisticState(state: GQL.FCastPlaybackState) {
    if (!this.status) return;
    this.status = { ...this.status, time: this.currentTime(), state };
    this.statusAt = performance.now();
    this.updateInfo();
  }

  paused() {
    if (this.loading) return false;
    return this.status?.state !== GQL.FCastPlaybackState.Playing;
  }

  ended() {
    return this.hasEnded;
  }

  currentTime() {
    if (this.loading || !this.status) return this.pendingTime;

    let { time } = this.status;
    if (this.status.state === GQL.FCastPlaybackState.Playing) {
      time += (performance.now() - this.statusAt) / 1000;
    }
    const duration = this.duration();
    return duration > 0 ? Math.min(time, duration) : time;
  }

  setCurrentTime(seconds: number) {
    if (this.loading) {
      // the receiver can't seek before it has loaded the scene, so start there instead
      this.castScene(seconds);
      return;
    }

    this.plugin.command(GQL.FCastSeekDocument, { time: seconds });
    if (this.status) {
      this.status = { ...this.status, time: seconds };
      this.statusAt = performance.now();
    }
    this.hasEnded = false;
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

    this.plugin.command(GQL.FCastSetVolumeDocument, { volume });
    if (this.status) this.status = { ...this.status, volume };
    if (volume > 0) this.isMuted = false;
    this.trigger("volumechange");
  }

  // receivers have no mute, so muting sets the volume to 0
  muted() {
    return this.isMuted;
  }

  setMuted(muted: boolean) {
    if (!this.acceptVolume || muted === this.isMuted) return;

    if (muted) {
      this.unmutedVolume = this.volume() || 1;
      this.setVolume(0);
      this.isMuted = true;
    } else {
      this.isMuted = false;
      this.setVolume(this.unmutedVolume);
    }
    this.trigger("volumechange");
  }

  defaultMuted() {
    return false;
  }

  poster() {
    const el = this.el().querySelector<HTMLElement>(".vjs-fcast-poster");
    return el?.dataset.poster ?? "";
  }

  setPoster(poster: string) {
    const el = this.el().querySelector<HTMLElement>(".vjs-fcast-poster");
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

class FCastMenuItem extends videojs.getComponent("MenuItem") {
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

class FCastButton extends videojs.getComponent("MenuButton") {
  private plugin?: FCastPlugin;
  private receivers?: IReceiver[];
  private searching = false;
  private searchError?: string;

  constructor(player: VideoJsPlayer, plugin: FCastPlugin) {
    super(player);
    this.plugin = plugin;
    this.menuButton_.controlText("FCast");
    this.update();
  }

  createEl() {
    return videojs.dom.createEl("div", {
      className:
        "vjs-fcast-button vjs-menu-button vjs-menu-button-popup vjs-control vjs-button",
    });
  }

  createItems() {
    const { plugin } = this;
    if (!plugin) return [];

    const player = this.player();
    const receiver = plugin.getReceiver();
    if (receiver) {
      return [
        new FCastMenuItem(player, `Stop casting to ${receiver.name}`, () =>
          plugin.stop()
        ),
      ];
    }

    const items = (this.receivers ?? []).map(
      (r) => new FCastMenuItem(player, r.name, () => plugin.start(r))
    );
    if (this.searching) {
      items.push(new FCastMenuItem(player, "Searching for receivers…"));
    } else if (this.searchError) {
      items.push(
        new FCastMenuItem(
          player,
          `Couldn't search for receivers: ${this.searchError}`
        )
      );
    } else if (items.length === 0) {
      items.push(new FCastMenuItem(player, "No FCast receivers found"));
    }
    return items;
  }

  update() {
    super.update();
    this.toggleClass("vjs-fcast-casting", !!this.plugin?.getReceiver());
  }

  private isOpen() {
    return !!this.menu?.hasClass("vjs-lock-showing");
  }

  handleClick(event: videojs.EventTarget.Event) {
    const opening = !this.isOpen();
    super.handleClick(event);
    if (opening && this.plugin && !this.plugin.getReceiver()) this.search();
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
      const result = await getClient().query<GQL.FCastReceiversQuery>({
        query: GQL.FCastReceiversDocument,
        fetchPolicy: "network-only",
      });
      this.receivers = result.data.fcastReceivers;
    } catch (err) {
      this.searchError = errorMessage(err);
    }

    this.searching = false;
    this.refresh();
  }
}

class FCastPlugin extends videojs.getPlugin("plugin") {
  private enabled = false;
  private button?: FCastButton;
  private tech?: FCastTech;
  private receiver: IReceiver | null = null;
  private sessions: Status[] = [];
  private sceneId?: string;
  private sceneStartTime = 0;
  private startTime = 0;
  private browserVolume = 1;
  private browserMuted = false;
  private notice?: HTMLElement;
  private noticeTimeout?: number;

  constructor(player: VideoJsPlayer, options?: IFCastOptions) {
    super(player, options);

    this.enabled = options?.enabled ?? false;
    if (!this.enabled) return;

    const button = new FCastButton(player, this);
    this.button = button;

    player.ready(() => {
      const { controlBar } = player;
      const fullscreenToggle = controlBar.getChild("fullscreenToggle")!.el();
      controlBar.addChild(button);
      controlBar.el().insertBefore(button.el(), fullscreenToggle);
    });

    const subscription = getClient()
      .subscribe<GQL.FCastSubscribeSubscription>({
        query: GQL.FCastSubscribeDocument,
      })
      .subscribe({
        next: (result) => {
          const status = result.data?.fcastSubscribe;
          if (status) this.onStatus(status);
        },
      });

    getClient()
      .query<GQL.FCastSessionsQuery>({
        query: GQL.FCastSessionsDocument,
        fetchPolicy: "network-only",
      })
      .then((result) => {
        for (const s of result.data.fcastSessions) this.updateSession(s);
        this.resume();
      })
      .catch(() => {});

    player.on("dispose", () => {
      subscription.unsubscribe();
      if (castingPlayerId === player.id()) castingPlayerId = null;
    });
  }

  // picks up a cast that is already playing the scene, such as after reloading the page, or casts the scene to a receiver that is playing another one
  setScene(sceneId: string, startTime: number) {
    this.sceneId = sceneId;
    this.sceneStartTime = startTime;
    this.resume();
  }

  private resume() {
    if (!this.enabled || this.receiver || !this.sceneId) return;

    const session = this.sessions.find((s) => s.scene_id === this.sceneId);
    if (session) {
      this.start(session, session.time);
      return;
    }

    // sessions without a scene were taken over by another sender, so they're left alone
    const casting = this.sessions.find((s) => s.scene_id);
    if (casting) this.start(casting, this.sceneStartTime);
  }

  private updateSession(status: Status) {
    this.sessions = this.sessions.filter((s) => s.address !== status.address);
    if (status.connected) this.sessions.push(status);
  }

  private onStatus(status: Status) {
    this.updateSession(status);
    if (status.address === this.receiver?.address) {
      this.tech?.onStatus(status);
    }
  }

  getReceiver() {
    return this.receiver;
  }

  receiverStatus() {
    return this.sessions.find((s) => s.address === this.receiver?.address);
  }

  attachTech(tech: FCastTech) {
    this.tech = tech;
  }

  detachTech(tech: FCastTech) {
    if (this.tech === tech) this.tech = undefined;
  }

  takeStartTime() {
    const time = this.startTime;
    this.startTime = 0;
    return time;
  }

  start(receiver: IReceiver, time = this.player.currentTime()) {
    const { player } = this;

    this.receiver = { name: receiver.name, address: receiver.address };
    this.startTime = time;
    this.browserVolume = player.volume();
    this.browserMuted = player.muted();
    player.persistVolume().enabled = false;
    castingPlayerId = player.id();
    this.button?.update();

    // reloading the source makes Video.js pick the FCast tech
    player.src(player.currentSources());
  }

  // returns to playing in the browser, paused where the receiver was
  end(message?: string) {
    if (!this.receiver) return;

    const { player } = this;
    const time = player.currentTime();
    this.receiver = null;
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
    const { receiver } = this;
    this.end();
    if (receiver) this.command(GQL.FCastStopDocument, {}, receiver.address);
  }

  castScene(sceneId: string, time: number) {
    const { receiver } = this;
    if (!receiver) return;

    getClient()
      .mutate({
        mutation: GQL.FCastPlayDocument,
        variables: {
          input: { address: receiver.address, scene_id: sceneId, time },
        },
      })
      .catch((err) =>
        this.end(`Couldn't cast to ${receiver.name}: ${errorMessage(err)}`)
      );
  }

  command(
    mutation: DocumentNode,
    variables: Record<string, unknown> = {},
    address = this.receiver?.address
  ) {
    if (!address) return;

    getClient()
      .mutate({ mutation, variables: { address, ...variables } })
      .catch((err) => this.showNotice(`FCast: ${errorMessage(err)}`));
  }

  private showNotice(message: string) {
    if (!this.notice) {
      this.notice = videojs.dom.createEl("div", {
        className: "vjs-fcast-notice",
      }) as HTMLElement;
      this.player.el().appendChild(this.notice);
    }

    this.notice.textContent = message;
    this.notice.classList.add("vjs-fcast-notice-visible");
    window.clearTimeout(this.noticeTimeout);
    this.noticeTimeout = window.setTimeout(() => {
      this.notice?.classList.remove("vjs-fcast-notice-visible");
    }, noticeDuration);
  }
}

videojs.registerTech("Fcast", FCastTech);
videojs.registerPlugin("fcast", FCastPlugin);

declare module "video.js" {
  interface VideoJsPlayer {
    fcast: () => FCastPlugin;
  }
  interface VideoJsPlayerPluginOptions {
    fcast?: IFCastOptions;
  }
}

export default FCastPlugin;
