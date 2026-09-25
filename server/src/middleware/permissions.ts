import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { effectivePermissionsFor, hasPermission } from "../lib/permissionRegistry.js";

/** 403 body for a sub-admin without the required granular permission. */
export const PERMISSION_DENIED =
  "Ushbu bo'limga kirish uchun sizda yetarli huquq yo'q";

/**
 * Route guard that runs AFTER requireAdmin. The permission key is any
 * registered feature key from the dynamic registry (AdminFeature table). The
 * acting admin's effective permissions are read fresh from the DB on every
 * request, so a grant switch by the SUPER_ADMIN takes effect immediately;
 * revoked/lowered roles get 403 with PERMISSION_DENIED. SUPER_ADMIN and the
 * master ADMIN_PASSWORD bearer always pass; a plain ADMIN passes only when
 * their effective permissions include the key.
 */
export function checkPermission(key: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = req.admin;
      if (!admin) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (admin.role === "SUPER_ADMIN" || admin.role === "ADMIN_PASSWORD") {
        next();
        return;
      }
      if (admin.role !== "ADMIN" || !admin.id) {
        res.status(403).json({ error: PERMISSION_DENIED });
        return;
      }
      const user = await prisma.user.findUnique({
        where: { id: admin.id },
        select: { id: true, role: true, blocked: true },
      });
      if (!user || user.role !== "ADMIN" || user.blocked) {
        res.status(403).json({ error: PERMISSION_DENIED });
        return;
      }
      const perms = await effectivePermissionsFor({ id: user.id, role: user.role });
      if (!hasPermission(user.role, perms, key)) {
        res.status(403).json({ error: PERMISSION_DENIED });
        return;
      }
      next();
    } catch {
      res.status(500).json({ error: "Database unavailable" });
    }
  };
}