import { Router } from "express";
import { QuizStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireSuperAdmin } from "../middleware/adminAuth.js";
import { clientIp } from "../lib/ip.js";
import { recordAudit } from "../lib/audit.js";
import { addLog } from "../lib/logstore.js";
import { validateBody, quizRejectSchema, type QuizReject } from "../schemas.js";

export const adminQuizzesRouter = Router();

function adminId(req: import("express").Request): string | null {
  return req.admin?.id ?? null;
}

function adminEmail(req: import("express").Request): string | null {
  return req.admin?.email ?? null;
}

const quizListInclude = {
  author: { select: { id: true, email: true, nickname: true, avatarUrl: true } },
  _count: { select: { questions: true, results: true } },
} as const;

function toAdminQuiz(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: row.author,
    questionCount: row._count?.questions ?? 0,
    resultCount: row._count?.results ?? 0,
    questions:
      row.questions?.map((q: any) => ({
        id: q.id,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
      })) ?? undefined,
  };
}

// GET /api/admin/quizzes - moderation queue with ?status=PENDING filter.
adminQuizzesRouter.get("/", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" && ["PENDING", "APPROVED", "REJECTED"].includes(req.query.status)
      ? (req.query.status as QuizStatus)
      : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const where = {
      deletedAt: null as Date | null,
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.quiz.findMany({
        where,
        include: quizListInclude,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.quiz.count({ where }),
    ]);
    res.json({ quizzes: rows.map(toAdminQuiz), total, page, limit });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/admin/quizzes/:id - one quiz with full questions (moderation view).
adminQuizzesRouter.get("/:id", async (req, res) => {
  try {
    const row = await prisma.quiz.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        author: { select: { id: true, email: true, nickname: true, avatarUrl: true } },
        questions: { orderBy: { createdAt: "asc" } },
        _count: { select: { results: true } },
      },
    });
    if (!row) {
      res.status(404).json({ error: "Test topilmadi" });
      return;
    }
    res.json({ quiz: toAdminQuiz(row) });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/admin/quizzes/:id/approve - publish the quiz to the catalog.
adminQuizzesRouter.post("/:id/approve", async (req, res) => {
  try {
    const row = await prisma.quiz.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!row) {
      res.status(404).json({ error: "Test topilmadi" });
      return;
    }
    await prisma.quiz.update({
      where: { id: row.id },
      data: { status: QuizStatus.APPROVED, rejectionReason: null },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "quiz.approve",
      targetType: "quiz",
      targetId: row.id,
      detail: row.title.slice(0, 60),
      ip: clientIp(req.headers),
    });
    addLog("info", `Test tasdiqlandi: ${row.title.slice(0, 40)}...`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Test tasdiqlanmadi" });
  }
});

// POST /api/admin/quizzes/:id/reject - reject with a reason shown to the author.
adminQuizzesRouter.post("/:id/reject", validateBody(quizRejectSchema), async (req, res) => {
  const body = res.locals.body as QuizReject;
  try {
    const row = await prisma.quiz.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!row) {
      res.status(404).json({ error: "Test topilmadi" });
      return;
    }
    await prisma.quiz.update({
      where: { id: row.id },
      data: { status: QuizStatus.REJECTED, rejectionReason: body.reason },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "quiz.reject",
      targetType: "quiz",
      targetId: row.id,
      detail: `${row.title.slice(0, 60)} (sabab: ${body.reason})`,
      ip: clientIp(req.headers),
    });
    addLog("info", `Test rad etildi: ${row.title.slice(0, 40)}...`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Test rad etilmadi" });
  }
});

// DELETE /api/admin/quizzes/:id - permanently remove a quiz (SOFT delete;
// SUPER_ADMIN only, like quote deletion).
adminQuizzesRouter.delete("/:id", requireSuperAdmin, async (req, res) => {
  try {
    const row = await prisma.quiz.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!row) {
      res.status(404).json({ error: "Test topilmadi" });
      return;
    }
    await prisma.quiz.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "quiz.delete",
      targetType: "quiz",
      targetId: row.id,
      detail: row.title.slice(0, 60),
      ip: clientIp(req.headers),
    });
    addLog("info", `Test o'chirildi: ${row.title.slice(0, 40)}...`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Test o'chirilmadi" });
  }
});