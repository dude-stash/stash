import { getCastContext, loadCastSdk } from "./sdk";

export interface ICastMedia {
  url: string;
  contentType: string;
  title: string;
  // Lets the receiver draw a scrubber before it has buffered the whole file.
  duration?: number;
  startTime?: number;
  autoplay?: boolean;
}

const CONNECTED = "CONNECTED";

/**
 * Owns this page's connection to a cast device: whether one is connected, and
 * what is playing on it.
 *
 * The Cast SDK keeps a single context per page, so the listeners registered
 * here are removed again on destroy - a scene player that has been disposed
 * must not keep reacting to the device.
 */
export class CastSession {
  private watching: CastContext | null = null;

  /** Called whenever the device connects or disconnects. */
  public onConnectionChange: () => void = () => undefined;

  public isConnected(): boolean {
    return getCastContext()?.getCastState() === CONNECTED;
  }

  /**
   * Loads the SDK and starts reporting connection changes. Safe to call more
   * than once: the SDK is only entered on the first call.
   */
  public async watch(): Promise<void> {
    if (this.watching) return;

    const context = await loadCastSdk();
    // Another call may have finished while this one awaited.
    if (!context || this.watching) return;
    this.watching = context;

    const events = window.cast?.framework.CastContextEventType;
    if (events) {
      context.addEventListener(events.CAST_STATE_CHANGED, this.syncState);
      context.addEventListener(events.SESSION_STATE_CHANGED, this.syncState);
    }

    this.syncState();
  }

  /**
   * Opens the device picker and connects. Rejects if the SDK is unavailable;
   * the picker being dismissed also arrives here as a rejection.
   */
  public async connect(): Promise<void> {
    const context = await loadCastSdk();
    if (!context) {
      throw new Error("Cast SDK did not load");
    }

    if (!context.getCurrentSession()) {
      await context.requestSession();
    }

    this.syncState();
  }

  /** Disconnects and stops playback on the device. */
  public disconnect(): void {
    getCastContext()?.endCurrentSession(true);
    this.syncState();
  }

  /** Plays media on the connected device. */
  public async load(media: ICastMedia): Promise<void> {
    const chromeCast = window.chrome?.cast;
    const session = getCastContext()?.getCurrentSession();

    if (!chromeCast || !session) {
      throw new Error("No Cast session");
    }

    const info = new chromeCast.media.MediaInfo(media.url, media.contentType);
    info.streamType = chromeCast.media.StreamType.BUFFERED;
    if (media.duration) {
      info.duration = media.duration;
    }

    const metadata = new chromeCast.media.GenericMediaMetadata();
    metadata.metadataType = chromeCast.media.MetadataType.GENERIC;
    metadata.title = media.title;
    info.metadata = metadata;

    const request = new chromeCast.media.LoadRequest(info);
    request.autoplay = media.autoplay ?? true;
    request.currentTime = media.startTime ?? 0;

    await session.loadMedia(request);
  }

  /** Stops listening. The device keeps playing. */
  public destroy(): void {
    const events = window.cast?.framework.CastContextEventType;
    if (this.watching && events) {
      this.watching.removeEventListener(
        events.CAST_STATE_CHANGED,
        this.syncState
      );
      this.watching.removeEventListener(
        events.SESSION_STATE_CHANGED,
        this.syncState
      );
    }

    this.watching = null;
    this.onConnectionChange = () => undefined;
  }

  private syncState = () => this.onConnectionChange();
}
