import crypto from "node:crypto";
import { bus } from "./bus.js";
import type { AdminLogEntry } from "../types/index.js";

const MAX_LOGS = 500;
const logs: AdminLogEntry[] = [];

export function addLog(level: AdminLogEntry["level"], message: string): AdminLogEntry {
  const entry: AdminLogEntry = {
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    level,
    message,
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);

  // Forward to every connected admin socket (via the bus so it also works
  // across instances).
  bus.publish("admin:log", entry).catch(() => {});

  return entry;
}

export function recentLogs(limit = 100): AdminLogEntry[] {
  return logs.slice(-limit).reverse();
}
