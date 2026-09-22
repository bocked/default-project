import { Router } from "express";
import { QuizStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireFullUser, optionalAuth } from "../middleware/auth.js";
import { quoteCreateLimiter, likeLimiter } from "../lib/rateLimit.js";
import { addLog } from "../lib/logstore.js";
import { recordActivity } from "../lib/activity.js";
import { validateBody, quizCreateSchema, quizAnswersSchema, type QuizCreate, type QuizAnswers } from "../schemas.js";

export const quizzesRouter = Router();

/** A quiz is approachable (answerable) only when it is approved & not deleted. */
const approachableWhere = { status: QuizStatus.APPROVED, deletedAt: null } as const;

interface PublicQuiz {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: Date;
  questionCount: number;
  attemptCount: number;
  author: { id: string; nickname: string | null; avatarUrl: string | null };
  questions?: {
    id: string;
    question: string;
    options: string[];
    correctIndex: number | null;
  }[];
}

function toPublicQuiz(
  quiz: any,
  opts: { revealAnswers: boolean; questionCount?: number; attemptCount?: number }
): PublicQuiz {
  const questions = quiz.questions
    ? quiz.questions.map((q: any) => ({
        id: q.id,
        question: q.question,
        options: q.options,
        correctIndex: opts.revealAnswers ? q.correctIndex : null,
      }))
    : undefined;
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    status: quiz.status,
    createdAt: quiz.createdAt,
    questionCount: opts.questionCount ?? quiz._count?.questions ?? questions?.length ?? 0,
    attemptCount: opts.attemptCount ?? quiz._count?.results ?? 0,
    author: {
      id: quiz.author?.id ?? "",
      nickname: quiz.author?.nickname ?? null,
      avatarUrl: quiz.author?.avatarUrl ?? null,
    },
    ...(questions ? { questions } : {}),
  };
}

// GET /api/quizzes - public catalog of APPROVED quizzes, newest first.
quizzesRouter.get("/", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));
    const skip = (page - 1) * limit;
    const where = { ...approachableWhere };
    const [quizzes, total] = await Promise.all([
      prisma.quiz.findMany({
        where,
        include: {
          author: { select: { id: true, nickname: true, avatarUrl: true } },
          _count: { select: { questions: true, results: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.quiz.count({ where }),
    ]);
    res.json({
      quizzes: quizzes.map((q) => toPublicQuiz(q, { revealAnswers: false })),
      total,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/quizzes/mine/results - the user's attempts across quizzes.
quizzesRouter.get("/mine/results", requireAuth, async (req, res) => {
  try {
    const results = await prisma.quizResult.findMany({
      where: { userId: req.user!.id },
      include: {
        quiz: { select: { id: true, title: true, status: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    res.json({
      results: results.map((r) => ({
        quizId: r.quizId,
        title: r.quiz.title,
        quizStatus: r.quiz.status,
        score: r.score,
        total: r.total,
        answers: r.answers,
        updatedAt: r.updatedAt,
      })),
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/quizzes/mine - the user's own quizzes with moderation state.
quizzesRouter.get("/mine", requireAuth, async (req, res) => {
  try {
    const quizzes = await prisma.quiz.findMany({
      where: { authorId: req.user!.id, deletedAt: null },
      include: {
        questions: true,
        _count: { select: { questions: true, results: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      quizzes: quizzes.map((q) =>
        toPublicQuiz(q, { revealAnswers: true, questionCount: q._count.questions, attemptCount: q._count.results })
      ),
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/quizzes - submit a quiz. Requires a full profile. Trusted authors
// (admins / super-approved) are auto-approved; everyone else goes to the admin
// moderation queue like quotes do.
quizzesRouter.post("/", requireAuth, quoteCreateLimiter, requireFullUser, validateBody(quizCreateSchema), async (req, res) => {
  const body = res.locals.body as QuizCreate;
  try {
    const trusted = req.user!.role === "ADMIN" || req.user!.role === "SUPER_ADMIN" || Boolean(req.user!.isSuperApproved);
    const status: QuizStatus = trusted ? QuizStatus.APPROVED : QuizStatus.PENDING;
    const quiz = await prisma.quiz.create({
      data: {
        title: body.title,
        description: body.description ?? null,
        status,
        authorId: req.user!.id,
        questions: {
          create: body.questions.map((q) => ({
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
          })),
        },
      },
      include: {
        author: { select: { id: true, nickname: true, avatarUrl: true } },
        questions: true,
      },
    });
    addLog(
      "info",
      `${status === QuizStatus.APPROVED ? "Avtomatik tasdiqlangan" : "Yangi"} test: ${quiz.title.slice(0, 40)}... (${req.user!.email ?? req.user!.id})`
    );
    void recordActivity({ userId: req.user!.id, action: "QUIZ_CREATE", detail: quiz.title, targetId: quiz.id });
    res.status(201).json({ quiz: toPublicQuiz(quiz, { revealAnswers: true, questionCount: body.questions.length }) });
  } catch {
    res.status(500).json({ error: "Test saqlanmadi" });
  }
});

// POST /api/quizzes/:id/attempt - grade an answer submission. The correct
// indexes are revealed here only so the client can review right after taking
// the quiz; there is no retake until the next submit (results are upserted).
quizzesRouter.post("/:id/attempt", likeLimiter, requireAuth, validateBody(quizAnswersSchema), async (req, res) => {
  const body = res.locals.body as QuizAnswers;
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, ...approachableWhere },
      include: { questions: { orderBy: { createdAt: "asc" } } },
    });
    if (!quiz) {
      res.status(404).json({ error: "Test topilmadi" });
      return;
    }
    if (body.answers.length !== quiz.questions.length) {
      res.status(400).json({ error: "Barcha savollarga javob berish kerak" });
      return;
    }
    let score = 0;
    const perQuestion = quiz.questions.map((q, i) => {
      const correct = body.answers[i] === q.correctIndex;
      if (correct) score += 1;
      return {
        correct,
        correctIndex: q.correctIndex,
        yourAnswer: body.answers[i],
      };
    });
    const result = await prisma.quizResult.upsert({
      where: { quizId_userId: { quizId: quiz.id, userId: req.user!.id } },
      update: { score, total: quiz.questions.length, answers: perQuestion },
      create: {
        quizId: quiz.id,
        userId: req.user!.id,
        score,
        total: quiz.questions.length,
        answers: perQuestion,
      },
    });
    void recordActivity({ userId: req.user!.id, action: "QUIZ_ATTEMPT", detail: quiz.title, targetId: quiz.id });
    res.json({ score, total: quiz.questions.length, perQuestion, resultId: result.id });
  } catch {
    res.status(500).json({ error: "Natija saqlanmadi" });
  }
});

// GET /api/quizzes/:id - one quiz. Guests and non-attempted users only see the
// questions (no answers); the author, admins and users who already took it see
// the correct indexes plus their own last result.
quizzesRouter.get("/:id", optionalAuth, async (req, res) => {
  try {
    const visitor = req.user;
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, ...approachableWhere },
      include: {
        author: { select: { id: true, nickname: true, avatarUrl: true } },
        questions: { orderBy: { createdAt: "asc" } },
        _count: { select: { results: true } },
      },
    });
    if (!quiz) {
      res.status(404).json({ error: "Test topilmadi" });
      return;
    }
    const isOwner = visitor ? visitor.id === quiz.authorId : false;
    const myResult = visitor
      ? await prisma.quizResult.findUnique({
          where: { quizId_userId: { quizId: quiz.id, userId: visitor.id } },
        })
      : null;
    const reveal = Boolean(
      visitor && (isOwner || visitor.role === "ADMIN" || visitor.role === "SUPER_ADMIN" || myResult)
    );
    res.json({
      quiz: toPublicQuiz(
        { ...quiz, _count: { results: quiz._count.results } },
        { revealAnswers: reveal }
      ),
      myResult: myResult
        ? { score: myResult.score, total: myResult.total, answers: myResult.answers, updatedAt: myResult.updatedAt }
        : null,
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});