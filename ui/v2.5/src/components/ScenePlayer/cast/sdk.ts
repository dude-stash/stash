import { UAParser } from "ua-parser-js";

// The sender SDK announces itself through window.__onGCastApiAvailable, which
// fires once per page, and setOptions re-triggers device discovery - so the
// configured context is resolved once and shared.
let contextPromise: Promise<CastContext | null> | null = null;

/**
 * Reports whether this browser can run the Cast sender SDK at all. Only
 * Chromium-based browsers can; on iOS every browser is WebKit, so none can,
 * whatever the name says.
 */
export function isCastSenderSupported(): boolean {
  const { browser, os } = UAParser();

  if (os.name?.includes("iOS")) return false;

  return /Chrome|Chromium|Edge|Opera/.test(browser.name ?? "");
}

/**
 * Reports whether the page is served from an origin the SDK will initialise
 * on. Google requires HTTPS or localhost; casting from http://192.168.x.x
 * silently does nothing.
 */
export function isCastSenderOriginAllowed(): boolean {
  return window.isSecureContext;
}

/** The context, if the SDK is already loaded. */
export function getCastContext(): CastContext | null {
  return window.cast?.framework.CastContext.getInstance() ?? null;
}

function configure(): CastContext | null {
  const context = getCastContext();
  const chromeCast = window.chrome?.cast;
  if (!context || !chromeCast) return null;

  context.setOptions({
    receiverApplicationId: chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
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
  contextPromise ??= new Promise<CastContext | null>((resolve) => {
    if (window.cast?.framework) {
      resolve(configure());
      return;
    }

    window.__onGCastApiAvailable = (available) => {
      resolve(available ? configure() : null);
    };
  });

  return contextPromise;
}
