import { describe, expect, it } from "vitest";
import {
  DISMISS_TTL_MS,
  STORAGE_PREFIX,
  bannerDismissKey,
  encodeBannerDismissal,
  isBannerDismissed,
  purgeStaleDismissals,
  type StorageLike,
} from "../banner-dismiss";

const HOUR = 60 * 60 * 1000;

class FakeStorage implements StorageLike {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe("banner dismiss TTL", () => {
  it("never dismisses when nothing was persisted", () => {
    expect(isBannerDismissed(null)).toBe(false);
  });

  it("treats legacy permanent dismissal as expired (banner reappears)", () => {
    expect(isBannerDismissed("1")).toBe(false);
  });

  it("hides the banner while inside the 24h window", () => {
    const now = Date.now();
    expect(isBannerDismissed(encodeBannerDismissal(now - 1 * HOUR), now)).toBe(true);
    expect(isBannerDismissed(encodeBannerDismissal(now - HOUR), now)).toBe(true);
  });

  it("re-shows the banner after 24h have passed", () => {
    const now = Date.now();
    const justBefore = DISMISS_TTL_MS - 1;
    expect(isBannerDismissed(encodeBannerDismissal(now - justBefore), now)).toBe(true);
    expect(isBannerDismissed(encodeBannerDismissal(now - DISMISS_TTL_MS), now)).toBe(false);
    expect(isBannerDismissed(encodeBannerDismissal(now - 25 * HOUR), now)).toBe(false);
  });

  it("ignores malformed payloads", () => {
    expect(isBannerDismissed("banana", Date.now())).toBe(false);
    expect(isBannerDismissed("1:not-a-number", Date.now())).toBe(false);
  });

  it("scopes dismissal storage by slot and content signature", () => {
    const keyA = bannerDismissKey("banner.top", "image|https://a.jpg|/about");
    const keyB = bannerDismissKey("banner.top", "image|https://b.jpg|/about");
    const keyOther = bannerDismissKey("banner.left", "image|https://a.jpg|/about");
    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyOther);
    expect(keyA).toContain(STORAGE_PREFIX);
  });
});

describe("purgeStaleDismissals (admin override)", () => {
  it("cancels old signatures of the same slot so an edited banner reappears", () => {
    const now = Date.now();
    const storage = new FakeStorage();
    const oldKey = bannerDismissKey("banner.top", "image|https://old.jpg|/about");
    const newKey = bannerDismissKey("banner.top", "image|https://new.jpg|/about");
    storage.setItem(oldKey, encodeBannerDismissal(now - HOUR)); // dismissed <24h ago
    storage.setItem(newKey, encodeBannerDismissal(now - 10 * HOUR)); // active dismissal

    // Rendering the NEW banner: the old content's dismissal must be invalidated.
    purgeStaleDismissals(storage, "banner.top", newKey, now);

    expect(storage.getItem(oldKey)).toBeNull();
    expect(storage.getItem(newKey)).toBe(encodeBannerDismissal(now - 10 * HOUR));
  });

  it("keeps dismissals of other slots untouched", () => {
    const now = Date.now();
    const storage = new FakeStorage();
    const topKey = bannerDismissKey("banner.top", "image|https://a.jpg|/about");
    const leftKey = bannerDismissKey("banner.left", "image|https://a.jpg|/about");
    storage.setItem(topKey, encodeBannerDismissal(now - HOUR));
    storage.setItem(leftKey, encodeBannerDismissal(now - HOUR));

    purgeStaleDismissals(storage, "banner.top", topKey, now);

    expect(storage.getItem(topKey)).toBe(encodeBannerDismissal(now - HOUR));
    expect(storage.getItem(leftKey)).toBe(encodeBannerDismissal(now - HOUR));
  });

  it("drops the current signature's entry once its 24h window lapses", () => {
    const now = Date.now();
    const storage = new FakeStorage();
    const key = bannerDismissKey("banner.feed", "image|https://feed.jpg|/about");
    storage.setItem(key, encodeBannerDismissal(now - 25 * HOUR)); // expired

    purgeStaleDismissals(storage, "banner.feed", key, now);

    expect(storage.getItem(key)).toBeNull();
  });

  it("purges legacy permanent dismissal keys", () => {
    const now = Date.now();
    const storage = new FakeStorage();
    const oldKey = bannerDismissKey("banner.right", "image|https://legacy.jpg|/about");
    const newKey = bannerDismissKey("banner.right", "image|https://current.jpg|/about");
    storage.setItem(oldKey, "1"); // close-once, never-again rule
    storage.setItem(newKey, encodeBannerDismissal(now - HOUR));

    purgeStaleDismissals(storage, "banner.right", newKey, now);

    expect(storage.getItem(oldKey)).toBeNull();
    expect(storage.getItem(newKey)).toBe(encodeBannerDismissal(now - HOUR));
  });

  it("is a no-op when nothing is stored", () => {
    const storage = new FakeStorage();
    const key = bannerDismissKey("banner.bottom", "image|https://b.jpg|/about");
    purgeStaleDismissals(storage, "banner.bottom", key, Date.now());
    expect(storage.length).toBe(0);
  });
});