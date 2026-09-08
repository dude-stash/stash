// Minimal typings for the Google Cast sender SDK (Cast Application Framework).
//
// The SDK is loaded at runtime from gstatic.com by the scene player, so these
// declarations cover only the surface Stash uses. See
// https://developers.google.com/cast/docs/reference/web_sender

export {};

declare global {
  interface Window {
    // Called by the sender SDK once it has finished loading.
    __onGCastApiAvailable?: (available: boolean, error?: unknown) => void;

    chrome?: {
      cast?: {
        AutoJoinPolicy: { ORIGIN_SCOPED: string };
        media: {
          DEFAULT_MEDIA_RECEIVER_APP_ID: string;
        };
      };
    };

    cast?: {
      framework: {
        CastContext: { getInstance: () => CastContext };
        CastContextEventType: {
          CAST_STATE_CHANGED: string;
          SESSION_STATE_CHANGED: string;
        };
      };
    };
  }

  interface CastContextOptions {
    receiverApplicationId: string;
    autoJoinPolicy: string;
  }

  interface CastContext {
    setOptions: (options: CastContextOptions) => void;
    getCastState: () => string;
    getCurrentSession: () => CastSession | null;
    requestSession: () => Promise<void>;
    endCurrentSession: (stopCasting: boolean) => void;
    addEventListener: (type: string, handler: () => void) => void;
    removeEventListener: (type: string, handler: () => void) => void;
  }

  // Populated by later work; the context hands these back but this module does
  // not read into them.
  interface CastSession {
    getSessionId: () => string;
  }
}
