/**
 * Banner dismiss (close) state.
 *
 * Dismissals live in localStorage keyed by the banner slot id AND a content
 * signature: `iqtibosim_banner_closed:<id>:<hash(contentKey)>`. A dismissal
 * only hides the banner for a rolling 24-hour window, so a banner never leans
 * on a permanent "close once, never again" rule.
 *
 * The content-signature scoping doubles as the admin override: when the admin
 * edits a banner's html/image/href the signature changes, the dismissal is
 * evaluated against a new key and the updated banner reappears. When the
 * current banner renders, `purgeStaleDismissals` physically drops the leftover
 * keys of previous signatures for the same slot and any expired entries, so
 * old dismissals are invalidated immediately and localStorage stays tidy.
 */

export const STORAGE_PREFIX = "iqtibosim_banner_closed:";
// Dynamic dismiss TTL: a closed banner stays hidden for one rolling day.
export const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

/** Minimal Storage-like surface (works with window.localStorage and mocks). */
export interface StorageLike {
  readonly length: number;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

/** Full localStorage key for a slot + content signature. */
export function bannerDismissKey(id: string, contentKey: string): string {
  return `${STORAGE_PREFIX}${id}:${shortHash(contentKey)}`;
}

/**
 * True when a stored dismissal is still inside its 24h window. Legacy "1"
 * (permanent-dismiss) and malformed values count as expired, so banners hidden
 * by the old rule reappear.
 */
export function isBannerDismissed(stored: string | null, now = Date.now()): boolean {
  if (!stored?.startsWith("1:")) return false;
  const ts = Number(stored.slice(2));
  if (!Number.isFinite(ts)) return false;
  return now - ts < DISMISS_TTL_MS;
}

/** Value persisted when the close button is pressed. */
export function encodeBannerDismissal(now = Date.now()): string {
  return `1:${now}`;
}

/**
 * Invalidates dismissals that no longer apply:
 *  - sibling keys of the same slot with a different content signature (the
 *    banner was changed in the admin panel → the old dismissal is cancelled);
 *  - any entry already outside the 24h window (incl. legacy "1").
 * The current signature's key is left untouched when still within the window.
 */
export function purgeStaleDismissals(
  storage: StorageLike,
  id: string,
  keepKey: string,
  now = Date.now(),
): void {
  const prefix = `${STORAGE_PREFIX}${id}:`;
  const stale: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key == null || !key.startsWith(prefix)) continue;
    if (key === keepKey) {
      // Expire the current signature's own entry once its window lapses.
      if (!isBannerDismissed(storage.getItem(key), now)) stale.push(key);
      continue;
    }
    // A different signature means the banner content changed → old dismissal
    // is cancelled, regardless of how recently it was written.
    stale.push(key);
  }
  for (const key of stale) storage.removeItem(key);
}

function shortHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}