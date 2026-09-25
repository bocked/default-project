import { prisma } from "./prisma.js";
import { notifyNewFeature } from "./adminAlerts.js";
import { runPolicyImpactReview } from "./policyImpact.js";

export interface FeatureDefinition {
  key: string;
  label: string;
  group: string;
  defaultEnabled: boolean;
  description?: string | null;
}

/**
 * The features shipped with this codebase. All default to TRUE so every
 * existing admin keeps today's access — the SUPER_ADMIN then switches
 * specific abilities off per sub-admin. They are seeded once by the
 * migration and re-ensured idempotently at boot.
 */
export const BUILTIN_FEATURES: FeatureDefinition[] = [
  { key: "canViewUsers", label: "Foydalanuvchilarni ko'rish", group: "Foydalanuvchilar", defaultEnabled: true },
  { key: "canManageUsers", label: "Foydalanuvchilarni boshqarish", group: "Foydalanuvchilar", defaultEnabled: true },
  { key: "canManageQuotes", label: "Iqtiboslar moderatsiyasi", group: "Kontent", defaultEnabled: true },
  { key: "canManageCategories", label: "Bo'lim va heshteglar", group: "Kontent", defaultEnabled: true },
  { key: "canManageQuizzes", label: "Testlar boshqaruvi", group: "Modullar", defaultEnabled: true },
  { key: "canManageAnnouncements", label: "E'lonlar", group: "Modullar", defaultEnabled: true },
  { key: "canManageFeedback", label: "Fikr-mulohaza", group: "Modullar", defaultEnabled: true },
  { key: "canManageSettings", label: "Sozlamalar", group: "Modullar", defaultEnabled: true },
  { key: "canViewAudit", label: "Audit jurnali", group: "Modullar", defaultEnabled: true },
];

export interface RegisteredFeature {
  key: string;
  label: string;
  group: string;
  defaultEnabled: boolean;
  source: string;
  description: string | null;
  registeredAt: Date;
}

export async function listFeatures(): Promise<RegisteredFeature[]> {
  return prisma.adminFeature.findMany({ orderBy: [{ group: "asc" }, { key: "asc" }] });
}

/**
 * Registers a feature exactly once. A runtime-registered feature (a newly
 * discovered module/funktsiya) is DEFAULT-FALSE ("sukut bo'yicha yopiq") and
 * triggers the SUPER_ADMIN alert (Telegram PUSH + admin-panel socket event) and
 * a policy impact review. Built-in definitions never alert.
 */
export async function registerFeature(
  def: FeatureDefinition,
  opts: { runtime?: boolean } = {}
): Promise<{ created: boolean; feature: RegisteredFeature }> {
  const runtime = opts.runtime ?? true;
  const source = runtime ? "runtime" : "builtin";
  try {
    const existing = await prisma.adminFeature.findUnique({ where: { key: def.key } });
    if (existing) return { created: false, feature: existing };
    const feature = await prisma.adminFeature.create({
      data: {
        key: def.key,
        label: def.label,
        group: def.group,
        defaultEnabled: runtime ? false : def.defaultEnabled,
        source,
        description: def.description ?? null,
      },
    });
    if (runtime) {
      // A newly discovered module is closed by default; alert the SUPER_ADMIN
      // and start a policy review draft. Never await failures.
      void notifyNewFeature(feature);
      void runPolicyImpactReview({
        trigger: "feature",
        reason: `Yangi modul/funksiya aniqlandi: [${feature.label}]`,
        actor: null,
      });
    }
    return { created: true, feature };
  } catch {
    /* registration is best-effort */
    return { created: false, feature: { ...def, source, description: def.description ?? null, registeredAt: new Date() } };
  }
}

/** Idempotent boot sync: makes sure every built-in feature row exists. */
export async function syncBuiltInFeatures(): Promise<void> {
  for (const def of BUILTIN_FEATURES) {
    await registerFeature(def, { runtime: false });
  }
}

/**
 * Effective permission map for one acting admin. SUPER_ADMIN (and the master
 * ADMIN_PASSWORD bearer) holds every registered feature; a plain ADMIN gets
 * feature defaults overridden by explicit grant rows; everyone else gets {}.
 */
export async function effectivePermissionsFor(admin: { id: string | null; role: string }): Promise<Record<string, boolean>> {
  if (!admin.id) return allTruePermissions();
  if (admin.role === "SUPER_ADMIN") return allTruePermissions();
  if (admin.role !== "ADMIN") return {};
  const [features, grants] = await Promise.all([
    prisma.adminFeature.findMany({ select: { key: true, defaultEnabled: true } }),
    prisma.adminGrant.findMany({ where: { adminId: admin.id } }),
  ]);
  return mergePermissions(features, grants);
}

/** Bulk variant for lists (sub-admins / users): one query for every grant. */
export async function bulkEffectivePermissions(
  admins: Array<{ id: string; role: string }>
): Promise<Map<string, Record<string, boolean>>> {
  const out = new Map<string, Record<string, boolean>>();
  if (admins.length === 0) return out;
  const regular = admins.filter((a) => a.role === "ADMIN");
  const [features, grants] = await Promise.all([
    prisma.adminFeature.findMany({ select: { key: true, defaultEnabled: true } }),
    regular.length > 0 ? prisma.adminGrant.findMany({ where: { adminId: { in: regular.map((a) => a.id) } } }) : Promise.resolve([]),
  ]);
  for (const a of admins) {
    out.set(a.id, a.role === "SUPER_ADMIN" ? allTrue(features) : mergePermissions(features, grants.filter((g) => g.adminId === a.id)));
  }
  return out;
}

function allTruePermissions(): Promise<Record<string, boolean>> {
  const perms: Record<string, boolean> = {};
  for (const f of BUILTIN_FEATURES) perms[f.key] = true;
  // Also cover runtime features registered in this process (the DB list is the
  // source of truth, but the built-in fallback keeps callers working even when
  // the registry table is momentarily unreachable).
  return prisma.adminFeature
    .findMany({ select: { key: true } })
    .then((rows) => {
      const map: Record<string, boolean> = {};
      for (const r of rows) map[r.key] = true;
      return map;
    })
    .catch(() => perms);
}

function allTrue(features: Array<{ key: string }>): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const f of features) map[f.key] = true;
  return map;
}

function mergePermissions(
  features: Array<{ key: string; defaultEnabled: boolean }>,
  grants: Array<{ featureKey: string; enabled: boolean }>
): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const f of features) map[f.key] = f.defaultEnabled;
  for (const g of grants) map[g.featureKey] = g.enabled;
  return map;
}

/** Pure decision helper (unit-testable): SUPER_ADMIN / master key always pass. */
export function hasPermission(
  role: string | null | undefined,
  perms: Record<string, boolean> | null | undefined,
  key: string
): boolean {
  if (role === "SUPER_ADMIN" || role === "ADMIN_PASSWORD") return true;
  if (role !== "ADMIN") return false;
  return perms?.[key] === true;
}