import type { User } from "@prisma/client";

// Express namespace augmentation is the supported way to extend Request.
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      /** Populated by requireAuth for authenticated routes. */
      user?: User;
    }
  }
}

export interface BannedIpRecord {
  id: string;
  ipAddress: string;
  reason?: string | null;
  createdAt: string;
}

export interface AdminLogEntry {
  id: string;
  time: string;
  level: "info" | "warn" | "ban" | "delete";
  message: string;
}
