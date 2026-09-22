import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireSuperAdmin } from "../middleware/adminAuth.js";
import { clientIp } from "../lib/ip.js";
import { recordAudit } from "../lib/audit.js";
import { addLog } from "../lib/logstore.js";
import {
  POLICY_LABELS,
  POLICY_TYPES,
  publishedPolicyVersion,
  nextFreeVersion,
  publicPolicy,
  approvePolicy,
} from "../lib/policies.js";
import {
  validateBody,
  policyDraftCreateSchema,
  policyEditSchema,
  policyApproveSchema,
  policyTypeSchema,
  type PolicyDraftCreate,
  type PolicyEdit,
  type PolicyApprove,
} from "../schemas.js";

export const adminPoliciesRouter = Router();

function adminId(req: import("express").Request): string | null {
  return req.admin?.id ?? null;
}

function adminEmail(req: import("express").Request): string | null {
  return req.admin?.email ?? null;
}

function toPolicy(row: any, current: boolean) {
  return {
    id: row.id,
    type: row.type,
    version: row.version,
    content: row.content,
    isApproved: row.isApproved,
    changeSummary: row.changeSummary,
    changeReason: row.changeReason,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    current,
  };
}

// GET /api/admin/policies - all policy versions across types (drafts +
// approved history), newest first. `current` marks the approved version that is
// live right now for each type.
adminPoliciesRouter.get("/", async (_req, res) => {
  try {
    const [rows, versions] = await Promise.all([
      prisma.sitePolicy.findMany({ orderBy: { updatedAt: "desc" }, take: 500 }),
      Promise.all(POLICY_TYPES.map(async (t) => [t, await publishedPolicyVersion(t)] as const)),
    ]);
    const versionMap = new Map(versions);
    res.json({
      policies: rows.map((r) => toPolicy(r, r.isApproved && r.version === versionMap.get(r.type))),
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/admin/policies/:type - all versions of one policy type.
adminPoliciesRouter.get("/:type", async (req, res) => {
  const type = policyTypeSchema.safeParse(req.params.type);
  if (!type.success) {
    res.status(400).json({ error: "type TERMS | PRIVACY | COOKIES bo'lishi kerak" });
    return;
  }
  try {
    const rows = await prisma.sitePolicy.findMany({
      where: { type: type.data },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    const published = await publishedPolicyVersion(type.data);
    res.json({
      type: type.data,
      label: POLICY_LABELS[type.data],
      published,
      policies: rows.map((r) => toPolicy(r, r.isApproved && r.version === published)),
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/admin/policies - create a new draft for a type. Content is seeded
// from the latest published text so the admin edits a real starting point.
adminPoliciesRouter.post("/", validateBody(policyDraftCreateSchema), async (req, res) => {
  const body = res.locals.body as PolicyDraftCreate;
  try {
    const open = await prisma.sitePolicy.findFirst({ where: { type: body.type, isApproved: false } });
    if (open) {
      res.status(409).json({ error: "Bu tur uchun ochiq loyiha allaqachon mavjud" });
      return;
    }
    const base = await publicPolicy(body.type);
    const version = await nextFreeVersion(body.type);
    const draft = await prisma.sitePolicy.create({
      data: {
        type: body.type,
        version,
        content: base.content,
        isApproved: false,
        changeSummary: body.changeSummary ?? `Yangi loyiha (v${version})`,
        createdById: adminId(req),
      },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "policy.create-draft",
      targetType: "policy",
      targetId: draft.id,
      detail: `${body.type} ${draft.version} loyihasi yaratildi`,
      ip: clientIp(req.headers),
    });
    addLog("info", `Yangi ${POLICY_LABELS[body.type]} loyihasi: v${draft.version}`);
    res.status(201).json({ policy: toPolicy(draft, false) });
  } catch {
    res.status(500).json({ error: "Loyiha yaratilmadi" });
  }
});

// PATCH /api/admin/policies/:id - edit a draft's content / change metadata.
adminPoliciesRouter.patch("/:id", validateBody(policyEditSchema), async (req, res) => {
  const body = res.locals.body as PolicyEdit;
  try {
    const row = await prisma.sitePolicy.findUnique({ where: { id: req.params.id } });
    if (!row || row.isApproved) {
      res.status(400).json({ error: "Faqat tasdiqlanmagan loyihani tahrirlash mumkin" });
      return;
    }
    const updated = await prisma.sitePolicy.update({
      where: { id: row.id },
      data: {
        content: body.content,
        ...(body.changeSummary !== undefined ? { changeSummary: body.changeSummary } : {}),
        ...(body.changeReason !== undefined ? { changeReason: body.changeReason } : {}),
      },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "policy.edit-draft",
      targetType: "policy",
      targetId: updated.id,
      detail: `${updated.type} v${updated.version} loyihasi tahrirlandi`,
      ip: clientIp(req.headers),
    });
    res.json({ policy: toPolicy(updated, false) });
  } catch {
    res.status(500).json({ error: "Loyiha saqlanmadi" });
  }
});

// POST /api/admin/policies/:id/approve - publish a draft. SUPER_ADMIN ONLY.
// Publishing bumps the public version and (for TERMS) forces every user to
// re-consent on their next login.
adminPoliciesRouter.post("/:id/approve", requireSuperAdmin, validateBody(policyApproveSchema), async (req, res) => {
  const body = res.locals.body as PolicyApprove;
  try {
    const row = await prisma.sitePolicy.findUnique({ where: { id: req.params.id } });
    if (!row) {
      res.status(404).json({ error: "Siyosat topilmadi" });
      return;
    }
    if (row.isApproved) {
      res.status(400).json({ error: "Bu hujjat allaqachon nashr etilgan" });
      return;
    }
    const reason = body.changeReason ?? row.changeReason;
    await prisma.sitePolicy.update({ where: { id: row.id }, data: { changeReason: reason } });
    await approvePolicy(row.id, { id: adminId(req), email: adminEmail(req) });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "policy.approve",
      targetType: "policy",
      targetId: row.id,
      detail: `${row.type} v${row.version} nashr etildi`,
      ip: clientIp(req.headers),
    });
    addLog("info", `${POLICY_LABELS[row.type]} v${row.version} nashr etildi (${adminEmail(req) ?? "SUPER_ADMIN"})`);
    res.json({ ok: true, version: row.version });
  } catch {
    res.status(500).json({ error: "Nashr etilmadi" });
  }
});

// DELETE /api/admin/policies/:id - delete a draft that will not be published.
// Approved versions are kept forever (they are the legal history).
adminPoliciesRouter.delete("/:id", async (req, res) => {
  try {
    const row = await prisma.sitePolicy.findUnique({ where: { id: req.params.id } });
    if (!row || row.isApproved) {
      res.status(400).json({ error: "Faqat tasdiqlanmagan loyihani o'chirish mumkin" });
      return;
    }
    await prisma.sitePolicy.delete({ where: { id: row.id } });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "policy.delete-draft",
      targetType: "policy",
      targetId: row.id,
      detail: `${row.type} v${row.version} loyihasi o'chirildi`,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Loyiha o'chirilmadi" });
  }
});