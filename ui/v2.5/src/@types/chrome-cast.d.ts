export {};

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean, error?: unknown) => void;
    chrome?: {
      cast?: {
        AutoJoinPolicy: { ORIGIN_SCOPED: string };
        media: {
          DEFAULT_MEDIA_RECEIVER_APP_ID: string;
          MediaInfo: new (url: string, contentType: string) => ChromeCastMediaInfo;
          GenericMediaMetadata: new () => ChromeCastMetadata;
          LoadRequest: new (info: ChromeCastMediaInfo) => ChromeCastLoadRequest;
          StreamType: { BUFFERED: string };
          MetadataType: { GENERIC: number };
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
      };
    };
  }
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

interface CastFrameworkSession {
  loadMedia: (request: ChromeCastLoadRequest) => Promise<void>;
  getCastDevice: () => { friendlyName: string };
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
