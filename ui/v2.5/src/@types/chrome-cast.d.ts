export {};

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean, error?: unknown) => void;
    chrome?: {
      cast?: {
        AutoJoinPolicy: { ORIGIN_SCOPED: string };
        media: {
          DEFAULT_MEDIA_RECEIVER_APP_ID: string;
          MediaInfo: new (
            url: string,
            contentType: string
          ) => ChromeCastMediaInfo;
          GenericMediaMetadata: new () => ChromeCastMetadata;
          LoadRequest: new (info: ChromeCastMediaInfo) => ChromeCastLoadRequest;
          StreamType: { BUFFERED: string };
          MetadataType: { GENERIC: number };
          PlayerState: {
            IDLE: string;
            PLAYING: string;
            PAUSED: string;
            BUFFERING: string;
          };
          IdleReason: {
            CANCELLED: string;
            INTERRUPTED: string;
            FINISHED: string;
            ERROR: string;
          };
        };
      };
    };
    cast?: {
      framework: {
        CastContext: {
          getInstance: () => CastFrameworkContext;
        };
        CastContextEventType: {
          CAST_STATE_CHANGED: string;
          SESSION_STATE_CHANGED: string;
        };
        RemotePlayer: new () => CastRemotePlayer;
        RemotePlayerController: new (
          player: CastRemotePlayer
        ) => CastRemotePlayerController;
        RemotePlayerEventType: {
          CURRENT_TIME_CHANGED: string;
          IS_PAUSED_CHANGED: string;
          PLAYER_STATE_CHANGED: string;
          VOLUME_LEVEL_CHANGED: string;
          IS_MUTED_CHANGED: string;
        };
      };
    };
  }

  interface ChromeCastMediaInfo {
    streamType: string;
    duration?: number;
    metadata?: ChromeCastMetadata;
  }

  interface ChromeCastMetadata {
    metadataType: number;
    title?: string;
  }

  interface ChromeCastLoadRequest {
    autoplay: boolean;
    currentTime: number;
  }

  interface CastRemotePlayer {
    isPaused: boolean;
    currentTime: number;
    duration: number;
    volumeLevel: number;
    isMuted: boolean;
    playerState: string | null;
    isMediaLoaded: boolean;
    displayName: string;
    isConnected: boolean;
  }

  interface CastRemotePlayerController {
    playOrPause: () => void;
    seek: () => void;
    setVolumeLevel: () => void;
    muteOrUnmute: () => void;
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
  }

  interface CastFrameworkMedia {
    idleReason?: string | null;
  }

  interface CastFrameworkSession {
    loadMedia: (request: ChromeCastLoadRequest) => Promise<void>;
    getCastDevice: () => { friendlyName: string };
    getMediaSession: () => CastFrameworkMedia | null;
  }

  interface CastFrameworkContext {
    setOptions: (options: {
      receiverApplicationId: string;
      autoJoinPolicy: string;
    }) => void;
    requestSession: () => Promise<void>;
    getCurrentSession: () => CastFrameworkSession | null;
    getCastState: () => string;
    endCurrentSession: (stopCasting: boolean) => void;
    addEventListener: (type: string, listener: () => void) => void;
  }
}
