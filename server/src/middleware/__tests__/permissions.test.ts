import { describe, expect, it } from "vitest";
import { hasPermission } from "../../lib/permissionRegistry.js";
import { adminPermissionUpdateSchema, policyReviewSchema } from "../../schemas.js";
import { policyReviewKeyboard } from "../../lib/telegram.js";

const perms = {
  canViewUsers: true,
  canManageUsers: true,
  canManageQuotes: true,
  canManageCategories: true,
};

describe("hasPermission (dynamic RBAC registry)", () => {
  it("lets SUPER_ADMIN through every permission regardless of grants", () => {
    expect(hasPermission("SUPER_ADMIN", { canManageQuotes: false }, "canManageQuotes")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", undefined, "brandNewFeatureKey")).toBe(true);
  });

  it("lets the master ADMIN_PASSWORD key through every permission", () => {
    expect(hasPermission("ADMIN_PASSWORD", undefined, "canViewUsers")).toBe(true);
  });

  it("requires an ADMIN to hold the requested feature key", () => {
    expect(hasPermission("ADMIN", perms, "canManageQuotes")).toBe(true);
    expect(hasPermission("ADMIN", { ...perms, canManageQuotes: false }, "canManageQuotes")).toBe(false);
    expect(hasPermission("ADMIN", { canManageUsers: true }, "canViewUsers")).toBe(false);
    // Unknown keys are never granted implicitly.
    expect(hasPermission("ADMIN", perms, "totallyNewFeature")).toBe(false);
  });

  it("denies USER, null and missing grants", () => {
    expect(hasPermission("USER", perms, "canViewUsers")).toBe(false);
    expect(hasPermission(null, perms, "canViewUsers")).toBe(false);
    expect(hasPermission(undefined, perms, "canViewUsers")).toBe(false);
    expect(hasPermission("ADMIN", null, "canViewUsers")).toBe(false);
  });
});

describe("adminPermissionUpdateSchema (dynamic registry PATCH body)", () => {
  it("accepts a single toggled feature", () => {
    const r = adminPermissionUpdateSchema.safeParse({ permissions: { canManageQuotes: false } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.permissions.canManageQuotes).toBe(false);
  });

  it("accepts any subset of registered features at once", () => {
    const r = adminPermissionUpdateSchema.safeParse({
      permissions: {
        canViewUsers: true,
        canManageQuizzes: false,
        canManageAnnouncements: true,
        canViewAudit: false,
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty permissions map", () => {
    expect(adminPermissionUpdateSchema.safeParse({ permissions: {} }).success).toBe(false);
    expect(adminPermissionUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-boolean values (unknown keys are rejected by the route)", () => {
    expect(adminPermissionUpdateSchema.safeParse({ permissions: { canManageUsers: "yes" } }).success).toBe(false);
    expect(adminPermissionUpdateSchema.safeParse({ permissions: { canManageUsers: true, canDeleteEverything: 1 } }).success).toBe(false);
  });
});

describe("policyReviewSchema", () => {
  it("requires a reason and accepts an optional type", () => {
    expect(policyReviewSchema.safeParse({ reason: "Yangi modul qo'shildi" }).success).toBe(true);
    expect(policyReviewSchema.safeParse({ reason: "Maxfiylik o'zgardi", type: "PRIVACY" }).success).toBe(true);
    expect(policyReviewSchema.safeParse({ reason: "", type: "TERMS" }).success).toBe(false);
    expect(policyReviewSchema.safeParse({ reason: "ab", type: "NOPE" }).success).toBe(false);
    expect(policyReviewSchema.safeParse({}).success).toBe(false);
  });
});

describe("policyReviewKeyboard", () => {
  it("renders the three Super Admin decision buttons with policy: prefix callbacks", () => {
    const kb = policyReviewKeyboard("abc-123");
    const flat = kb.inline_keyboard.flat();
    expect(flat.map((b) => b.text)).toEqual([
      "✅ Tasdiqlash",
      "✍️ Taklif kiritish bilan tasdiqlash",
      "❌ Rad etish + sabab",
    ]);
    expect(flat.map((b) => b.callback_data)).toEqual([
      "policy:approve:abc-123",
      "policy:suggest:abc-123",
      "policy:reject:abc-123",
    ]);
  });
});