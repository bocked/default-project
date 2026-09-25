import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

/** 403 body for a sub-admin without the required granular permission. */
export const PERMISSION_DENIED =
  "Ushbu bo'limga kirish uchun sizda yetarli huquq yo'q";

/** The four granular abilities a SUPER_ADMIN can switch on a sub-admin. */
export const ADMIN_PERMISSIONS = [
  "canViewUsers",
  "canManageUsers",
  "canManageQuotes",
  "canManageCategories",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export type AdminPermissionFlags = Record<AdminPermission, boolean>;

/** Ready-to-spread Prisma select for the permission flags (lists & updates). */
export const adminPermissionSelect = {
  canViewUsers: true,
  canManageUsers: true,
  canManageQuotes: true,
  canManageCategories: true,
} as const;

/**
 * Pure decision helper (unit-testable). The master ADMIN_PASSWORD key and the
 * SUPER_ADMIN role are always allowed; USER and anonymous principals are not;
 * an ADMIN passes only when their flags grant the permission.
 */
export function hasPermission(
  role: string | null | undefined,
  flags: Partial<AdminPermissionFlags> | null | undefined,
  permission: AdminPermission,
): boolean {
  if (role === "SUPER_ADMIN" || role === "ADMIN_PASSWORD") return true;
  if (role !== "ADMIN") return false;
  return flags?.[permission] === true;
}

/**
 * Route guard that runs AFTER requireAdmin. Reads the acting admin's flags
 * fresh from the DB on every request, so a permission switch by the SUPER_ADMIN
 * takes effect immediately; revoked/lowered roles get 403 with
 * PERMISSION_DENIED.
 */
export function checkPermission(permission: AdminPermission) {
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
        select: { role: true, blocked: true, ...adminPermissionSelect },
      });
      if (!user || user.role !== "ADMIN" || user.blocked) {
        res.status(403).json({ error: PERMISSION_DENIED });
        return;
      }
      const flags: AdminPermissionFlags = {
        canViewUsers: user.canViewUsers,
        canManageUsers: user.canManageUsers,
        canManageQuotes: user.canManageQuotes,
        canManageCategories: user.canManageCategories,
      };
      if (!hasPermission(user.role, flags, permission)) {
        res.status(403).json({ error: PERMISSION_DENIED });
        return;
      }
      next();
    } catch {
      res.status(500).json({ error: "Database unavailable" });
    }
  };
}