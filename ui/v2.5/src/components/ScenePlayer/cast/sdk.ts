import { UAParser } from "ua-parser-js";

// Fallback for the Default Media Receiver, in case the SDK constant is missing.
const DEFAULT_RECEIVER_ID = "CC1AD845";

// The sender SDK announces itself through window.__onGCastApiAvailable, which
// fires exactly once per page. Every caller therefore shares one promise.
let loadPromise: Promise<CastContext | null> | null = null;

/**
 * Reports whether this browser can run the Cast sender SDK at all. Only
 * Chromium-based desktop browsers can; on iOS every browser is WebKit, so none
 * can, whatever the name says.
 */
export function isCastSenderSupported(): boolean {
  const { browser, os } = UAParser();

  if (os.name?.includes("iOS")) {
    return false;
  }

  const name = browser.name ?? "";
  return (
    name.includes("Chrome") ||
    name.includes("Chromium") ||
    name.includes("Edge") ||
    name.includes("Opera")
  );
}

/**
 * Reports whether the page is served from an origin the SDK will initialise
 * on. Google requires HTTPS or localhost; casting from http://192.168.x.x
 * silently does nothing.
 */
export function isCastSenderOriginAllowed(): boolean {
  return window.isSecureContext;
}

/** The context, if the SDK is already loaded and configured. */
export function getCastContext(): CastContext | null {
  return window.cast?.framework.CastContext.getInstance() ?? null;
}

function configure(): CastContext | null {
  const context = getCastContext();
  const chromeCast = window.chrome?.cast;
  if (!context || !chromeCast) {
    return null;
  }

  context.setOptions({
    receiverApplicationId:
      chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID || DEFAULT_RECEIVER_ID,
    // Only join sessions this origin started, so Stash does not take over a
    // cast someone else on the network is running.
    autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
  });

  return context;
}

/**
 * Resolves a configured CastContext, or null when the SDK is unavailable -
 * unsupported browser, blocked script, or an origin the SDK refuses.
 *
 * Never rejects: callers treat a missing context as "cannot cast", which is
 * also what an unsupported browser looks like.
 */
export function loadCastSdk(): Promise<CastContext | null> {
  if (window.cast?.framework) {
    return Promise.resolve(configure());
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<CastContext | null>((resolve) => {
    window.__onGCastApiAvailable = (available) => {
      resolve(available ? configure() : null);
    };
  });

  return loadPromise;
}
