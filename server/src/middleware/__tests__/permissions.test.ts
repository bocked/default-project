import { describe, expect, it } from "vitest";
import { hasPermission, ADMIN_PERMISSIONS } from "../permissions.js";
import { subAdminPermissionUpdateSchema } from "../../schemas.js";

const allFlags = {
  canViewUsers: true,
  canManageUsers: true,
  canManageQuotes: true,
  canManageCategories: true,
};

describe("hasPermission (granular RBAC)", () => {
  it("lets SUPER_ADMIN through every permission regardless of flags", () => {
    for (const p of ADMIN_PERMISSIONS) {
      expect(hasPermission("SUPER_ADMIN", { canManageQuotes: false }, p)).toBe(true);
    }
  });

  it("lets the master ADMIN_PASSWORD key through every permission", () => {
    for (const p of ADMIN_PERMISSIONS) {
      expect(hasPermission("ADMIN_PASSWORD", undefined, p)).toBe(true);
    }
  });

  it("requires an ADMIN to hold the requested flag", () => {
    expect(hasPermission("ADMIN", allFlags, "canManageQuotes")).toBe(true);
    expect(hasPermission("ADMIN", { ...allFlags, canManageQuotes: false }, "canManageQuotes")).toBe(false);
    expect(hasPermission("ADMIN", { canManageUsers: true }, "canViewUsers")).toBe(false);
  });

  it("denies USER, null, NaN role and missing flags", () => {
    expect(hasPermission("USER", allFlags, "canViewUsers")).toBe(false);
    expect(hasPermission(null, allFlags, "canViewUsers")).toBe(false);
    expect(hasPermission(undefined, allFlags, "canViewUsers")).toBe(false);
    expect(hasPermission("ADMIN", null, "canViewUsers")).toBe(false);
  });
});

describe("subAdminPermissionUpdateSchema", () => {
  it("accepts a single toggled flag", () => {
    const r = subAdminPermissionUpdateSchema.safeParse({ canManageQuotes: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.canManageQuotes).toBe(false);
  });

  it("accepts any subset of the four flags at once", () => {
    const r = subAdminPermissionUpdateSchema.safeParse({
      canViewUsers: true,
      canManageUsers: false,
      canManageQuotes: true,
      canManageCategories: false,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty body (nothing to toggle)", () => {
    expect(subAdminPermissionUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-boolean values and unknown permission keys", () => {
    expect(subAdminPermissionUpdateSchema.safeParse({ canManageUsers: "yes" }).success).toBe(false);
    expect(subAdminPermissionUpdateSchema.safeParse({ canDeleteEverything: true }).success).toBe(false);
    expect(subAdminPermissionUpdateSchema.safeParse({ isSuperAdmin: true }).success).toBe(false);
  });
});