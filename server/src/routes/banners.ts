import { Router } from "express";
import { clientIp } from "../lib/ip.js";
import { countBannerEvent, isBannerSlot, isBotUserAgent } from "../lib/bannerAnalytics.js";
import { bannerTrackLimiter } from "../lib/rateLimit.js";

export const bannersRouter = Router();

bannersRouter.use(bannerTrackLimiter);

/**
 * POST /api/banners/track
 * Public endpoint fired by the frontend when a banner was actually seen
 * (≥50% visible for ≥1000ms) or clicked. Body: { slot, type: "view"|"click" }.
 * Bots and missing User-Agents are rejected (403); the 1h per-visitor dedupe
 * keeps every slot counting at most once per hour per IP+UA combination.
 */
bannersRouter.post("/track", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const slot = body.slot;
  const type = body.type;
  if (!isBannerSlot(slot)) {
    res.status(400).json({ error: "Invalid slot" });
    return;
  }
  if (type !== "view" && type !== "click") {
    res.status(400).json({ error: "Invalid type" });
    return;
  }

  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
  if (isBotUserAgent(userAgent)) {
    res.status(403).json({ error: "Blocked" });
    return;
  }

  const ip = clientIp(req.headers);
  const counted = await countBannerEvent(slot, type, ip, userAgent ?? "");
  res.status(200).json({ ok: true, counted });
});