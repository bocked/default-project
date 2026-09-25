import { bus } from "./bus.js";
import { sendNewFeatureMessage } from "./telegram.js";

/** Alerts the SUPER_ADMIN about a newly registered module: admin-panel socket
 *  broadcast + Telegram PUSH. Never throws. */
export async function notifyNewFeature(feature: { key: string; label: string; group: string }): Promise<void> {
  try {
    await bus.publish("admin:feature:new", { key: feature.key, label: feature.label, group: feature.group });
  } catch {
    /* non-fatal */
  }
  try {
    await sendNewFeatureMessage(feature);
  } catch {
    /* Telegram must never break feature registration */
  }
}