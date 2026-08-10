/**
 * Escape the LINE in-app browser.
 *
 * Links shared in LINE open inside LINE's own webview, which is a poor host for this site:
 * there is no address bar, no saved logins or autofill for the donation form, and the file
 * picker for balloon photos is unreliable. LINE's answer is a documented query parameter —
 * a URL carrying `openExternalBrowser=1` is handed to the phone's default browser instead
 * of being loaded in the webview — so the page bounces itself out on first paint.
 *
 * Android gets a second attempt through an `intent:` URL for the LINE versions that ignore
 * the parameter. iOS has no equivalent escape hatch, so if the parameter is not honoured the
 * visitor simply stays put and the site keeps working; nothing here is load-bearing.
 */

const FLAG = 'openExternalBrowser';
/** Set before the redirect so a webview that stays open does not bounce a second time. */
const ATTEMPTED_KEY = 'externalBrowserAttempted';
/** Long enough for LINE to take over the navigation, short enough not to be noticed if it did not. */
const INTENT_FALLBACK_MS = 1200;

/** LINE's webview appends `Line/<version>`; the slash keeps this clear of "Linux". */
function isLineBrowser(userAgent: string): boolean {
  return /\bLine\//i.test(userAgent);
}

/** Drops the marker once the default browser has the page, so shared URLs stay clean. */
function stripFlag(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(FLAG)) return;
  url.searchParams.delete(FLAG);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

export function escapeInAppBrowser(): void {
  const url = new URL(window.location.href);

  // Arriving with the flag means the hand-off already happened — in the default browser, where
  // the marker is only litter, or in a webview that ignored it and must not be sent round again.
  if (url.searchParams.has(FLAG)) {
    stripFlag();
    return;
  }

  if (!isLineBrowser(navigator.userAgent)) return;

  let attempted = false;
  try {
    attempted = sessionStorage.getItem(ATTEMPTED_KEY) === '1';
    sessionStorage.setItem(ATTEMPTED_KEY, '1');
  } catch {
    // Private mode without storage: one attempt per page load is still safe.
  }
  if (attempted) return;

  url.searchParams.set(FLAG, '1');
  window.location.replace(url.toString());

  // Older LINE builds on Android load the URL in place instead. `intent:` reaches the default
  // browser directly there; it is a no-op on iOS and never runs if the redirect above took.
  if (/android/i.test(navigator.userAgent)) {
    const target = new URL(window.location.href);
    target.searchParams.delete(FLAG);
    const withoutScheme = target.host + target.pathname + target.search + target.hash;
    setTimeout(() => {
      window.location.href = `intent://${withoutScheme}#Intent;scheme=${target.protocol.replace(':', '')};end`;
    }, INTENT_FALLBACK_MS);
  }
}
