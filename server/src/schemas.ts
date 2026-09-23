import { z } from "zod";

// ---------------------------------------------------------------------------
// Admin socket payloads
// ---------------------------------------------------------------------------

export const adminAuthSchema = z.object({
  password: z.string().min(1).max(200),
});
export type AdminAuth = z.infer<typeof adminAuthSchema>;

export const adminBanSchema = z.object({
  ipAddress: z
    .string()
    .min(1)
    .max(45)
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: "ipAddress is required" }),
  reason: z.string().max(500).optional(),
});
export type AdminBan = z.infer<typeof adminBanSchema>;

export const adminUnbanSchema = z.object({
  ipAddress: z
    .string()
    .min(1)
    .max(45)
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: "ipAddress is required" }),
});
export type AdminUnban = z.infer<typeof adminUnbanSchema>;

// ---------------------------------------------------------------------------
// HTTP bodies
// ---------------------------------------------------------------------------

export const banCreateSchema = z.object({
  ipAddress: z.string().min(1).max(45),
  reason: z.string().max(500).optional(),
});
export type BanCreate = z.infer<typeof banCreateSchema>;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const email = z.string().trim().toLowerCase().email();

export const registerSchema = z.object({
  email,
  password: z.string().min(8).max(72),
  name: z.string().trim().max(100).optional(),
  nickname: z.string().trim().max(50).optional(),
});
export type Register = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});
export type Login = z.infer<typeof loginSchema>;

/** Re-acceptance body for the current Terms of Use version (login flow). The
 *  server only accepts the exact current version. */
export const acceptTermsSchema = z.object({
  version: z.string().trim().min(1).max(20),
});
export type AcceptTerms = z.infer<typeof acceptTermsSchema>;

/** Verifies email with either the emailed link token or the 6-digit OTP code.
 *  Exactly one method must be supplied. */
export const verifyEmailSchema = z
  .object({
    token: z.string().trim().min(20).max(128).optional(),
    email: email.optional(),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, { message: "Kod 6 xonali bo'lishi kerak" })
      .optional(),
  })
  .refine((v) => (v.token ? !v.email && !v.code : Boolean(v.email && v.code)), {
    message: "Havola token yoki email+kod juftligi kerak",
  });
export type VerifyEmail = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email,
});
export type ResendVerification = z.infer<typeof resendVerificationSchema>;

export const forgotPasswordSchema = z.object({
  email,
});
export type ForgotPassword = z.infer<typeof forgotPasswordSchema>;

/** Redeems a password reset with either the emailed link token or the 6-digit
 *  OTP code (email + code). Exactly one method must be supplied, plus the new
 *  password. */
export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(20).max(128).optional(),
    email: email.optional(),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, { message: "Kod 6 xonali bo'lishi kerak" })
      .optional(),
    password: z.string().min(8).max(72),
  })
  .refine((v) => (v.token ? !v.email && !v.code : Boolean(v.email && v.code)), {
    message: "Havola token yoki email+kod juftligi kerak",
  });
export type ResetPassword = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  nickname: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  // VIP watermark shown instead of yerlikoglon.uz on share images. Empty
  // clears it (falls back to the default wordmark).
  customWatermark: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  // Public avatar image URL (https only). Empty clears it.
  avatarUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v))
    .refine((v) => v === undefined || v === null || /^https?:\/\//i.test(v), {
      message: "Avatar havolasi http(s) bilan boshlanishi kerak",
    }),
});
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

export const telegramVerifySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { message: "Kod 6 ta raqamdan iborat bo'lishi kerak" }),
});
export type TelegramVerify = z.infer<typeof telegramVerifySchema>;

export const telegramQuickSessionSchema = z.object({
  sessionId: z.string().trim().min(32).max(64),
});
export type TelegramQuickSession = z.infer<typeof telegramQuickSessionSchema>;

/** Completes a Telegram quick-login account into a full registration. */
export const upgradeAccountSchema = z.object({
  email,
  password: z.string().min(8).max(72),
  name: z.string().trim().max(100).optional(),
  nickname: z.string().trim().max(50).optional(),
});
export type UpgradeAccount = z.infer<typeof upgradeAccountSchema>;

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

// Telegram post link: https://t.me/<channel>/<message_id>
const telegramUrl = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : v))
  .pipe(
    z
      .string()
      .regex(/^https:\/\/(t\.me|telegram\.me)\/[A-Za-z0-9_]{3,64}\/[0-9]{1,15}$/, {
        message: "Telegram havolasi https://t.me/kanal/123 ko'rinishida bo'lishi kerak",
      })
      .optional()
  );

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** VIP-only per-post card styling. Strict so unknown/forged keys never reach
 *  the database, and each field is bounded to keep payloads small. */
export const quoteCustomStylesSchema = z
  .object({
    fontFamily: z.enum(["serif", "sans", "mono", "calligraphic"]).optional(),
    textColor: hexColor.optional(),
    cardBg: hexColor.optional(),
    fontSize: z.number().int().min(14).max(40).optional(),
    alignment: z.enum(["left", "center", "right"]).optional(),
    border: z.enum(["none", "gold", "silver", "neon"]).optional(),
    quoteMark: z.enum(["classic", "double", "single", "none"]).optional(),
    texture: z.enum(["none", "paper", "glass"]).optional(),
  })
  .strict();
export type QuoteCustomStyles = z.infer<typeof quoteCustomStylesSchema>;

export const quoteCreateSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  categorySlug: z.string().trim().min(1).max(60),
  tags: z.array(z.string().trim().max(40)).max(5).default([]),
  anonymous: z.boolean().default(false),
  telegramUrl,
  customStyles: quoteCustomStylesSchema.nullish(),
});
export type QuoteCreate = z.infer<typeof quoteCreateSchema>;

export const adminQuoteRejectSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type AdminQuoteReject = z.infer<typeof adminQuoteRejectSchema>;

// ---------------------------------------------------------------------------
// Admin panel v2 (moderation console)
// ---------------------------------------------------------------------------

export const quoteEditSchema = z.object({
  text: z.string().trim().min(1).max(1000).optional(),
  categorySlug: z.string().trim().min(1).max(60).optional(),
  displayAuthor: z.string().trim().min(1).max(100).optional(),
  tags: z.array(z.string().trim().max(40)).max(5).optional(),
  telegramUrl,
  customStyles: quoteCustomStylesSchema.nullish(),
});
export type QuoteEdit = z.infer<typeof quoteEditSchema>;

export const bulkQuotesSchema = z.object({
  ids: z.array(z.string().min(1)).max(200),
  action: z.enum(["approve", "reject", "delete", "restore"]),
  reason: z.string().trim().max(500).optional(),
});
export type BulkQuotes = z.infer<typeof bulkQuotesSchema>;

export const bulkUsersSchema = z.object({
  ids: z.array(z.string().min(1)).max(200),
  action: z.enum(["block", "unblock", "delete", "restore"]),
});
export type BulkUsers = z.infer<typeof bulkUsersSchema>;

export const userRoleUpdateSchema = z.object({
  role: z.enum(["USER", "ADMIN"]),
});
export type UserRoleUpdate = z.infer<typeof userRoleUpdateSchema>;

export const premiumUpdateSchema = z.object({
  isPremium: z.boolean(),
  // Null means "lifetime"; otherwise an ISO date (already in the past revokes
  // active premium without touching the flag).
  expiresAt: z.string().datetime().nullable(),
});
export type PremiumUpdate = z.infer<typeof premiumUpdateSchema>;

export const tagUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40),
});
export type TagUpdate = z.infer<typeof tagUpdateSchema>;

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  slug: z.string().trim().min(1).max(60),
});
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

export const contentUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  // Empty is allowed: clearing `quote.today` unpins the quote of the day
  // (the API then falls back to the automatic daily pick).
  value: z.string().trim().max(2000),
});
export type ContentUpdate = z.infer<typeof contentUpdateSchema>;

// ---------------------------------------------------------------------------
// Admin modules (announcements, feedback, settings, seo, backup)
// ---------------------------------------------------------------------------

export const announcementCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(4000),
  channel: z.enum(["ALL", "SITE", "TELEGRAM", "EMAIL"]).default("ALL"),
  status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
});
export type AnnouncementCreate = z.infer<typeof announcementCreateSchema>;

export const feedbackReplySchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).default("RESOLVED"),
  adminReply: z.string().trim().max(2000).optional(),
});
export type FeedbackReply = z.infer<typeof feedbackReplySchema>;

export const publicFeedbackSchema = z.object({
  category: z.enum(["COMPLAINT", "SUGGESTION", "REPORT", "OTHER"]).default("OTHER"),
  text: z.string().trim().min(1).max(2000),
  quoteId: z.string().min(1).max(64).optional(),
});
export type PublicFeedback = z.infer<typeof publicFeedbackSchema>;

export const settingsUpdateSchema = z.object({
  settings: z.array(
    z.object({
      key: z.string().trim().min(1).max(120),
      value: z.string().trim().max(4000),
      label: z.string().trim().max(200),
      group: z.enum(["general", "seo"]).default("general"),
    })
  ),
});
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export const seoRuleSchema = z.object({
  page: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().max(400).optional(),
  keywords: z.string().trim().max(400).optional(),
});
export type SeoRuleInput = z.infer<typeof seoRuleSchema>;

export const backupCreateSchema = z.object({
  label: z.string().trim().min(1).max(200),
});
export type BackupCreate = z.infer<typeof backupCreateSchema>;

export const telegramBanSchema = z.object({
  telegramId: z.string().trim().min(1).max(128),
  reason: z.string().max(500).optional(),
});
export type TelegramBan = z.infer<typeof telegramBanSchema>;

// ---------------------------------------------------------------------------
// Legal policies (TERMS/PRIVACY/COOKIES) + quizzes
// ---------------------------------------------------------------------------

export const policyTypeSchema = z.enum(["TERMS", "PRIVACY", "COOKIES"]);
export type PolicyTypeInput = z.infer<typeof policyTypeSchema>;

export const policyDraftCreateSchema = z.object({
  type: policyTypeSchema,
  changeSummary: z.string().trim().max(300).optional(),
});
export type PolicyDraftCreate = z.infer<typeof policyDraftCreateSchema>;

export const policyEditSchema = z.object({
  content: z.string().trim().min(1).max(40000),
  changeSummary: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  changeReason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
});
export type PolicyEdit = z.infer<typeof policyEditSchema>;

export const policyApproveSchema = z.object({
  changeReason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
});
export type PolicyApprove = z.infer<typeof policyApproveSchema>;

export const quizQuestionSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(8),
    correctIndex: z.number().int().min(0).max(7),
  })
  .refine((q) => q.correctIndex < q.options.length, {
    message: "To'g'ri javob indeksi variantlar sonidan kichik bo'lishi kerak",
  });
export type QuizQuestionInput = z.infer<typeof quizQuestionSchema>;

export const quizCreateSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(1000).optional(),
  questions: z.array(quizQuestionSchema).min(1).max(30),
});
export type QuizCreate = z.infer<typeof quizCreateSchema>;

export const quizAnswersSchema = z.object({
  answers: z.array(z.number().int().min(0).max(7)).min(1).max(30),
});
export type QuizAnswers = z.infer<typeof quizAnswersSchema>;

export const quizRejectSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type QuizReject = z.infer<typeof quizRejectSchema>;

// ---------------------------------------------------------------------------
// Email management (Super Admin)
// ---------------------------------------------------------------------------

/** Optional recipient for a live SMTP test email; defaults to the admin's own
 *  address when omitted. */
export const emailTestSchema = z.object({
  to: z.string().trim().toLowerCase().email().optional(),
});
export type EmailTest = z.infer<typeof emailTestSchema>;

/** Pagination + filtering for the email log dashboard. */
export const emailLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  type: z
    .enum(["VERIFICATION", "PASSWORD_RESET", "QUOTE_MODERATION", "ANNOUNCEMENT", "TEST"])
    .optional(),
  status: z.enum(["SUCCESS", "SENT", "DELIVERED", "BOUNCED", "FAILED"]).optional(),
});
export type EmailLogQuery = z.infer<typeof emailLogQuerySchema>;

/**
 * Parses unknown socket/request data against a schema. Returns `null` when the
 * input does not match so callers can drop the event/request silently.
 */
export function parseZod<T>(schema: z.ZodType<T>, input: unknown): T | null {
  const result = schema.safeParse(input);
  return result.success ? result.data : null;
}

/**
 * Express-friendly validation for HTTP bodies. Attaches the parsed data to
 * `res.locals.body` so the handler can read it as a typed value.
 */
export function validateBody<T>(schema: z.ZodType<T>) {
  return (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Invalid payload", issues: result.error.issues });
      return;
    }
    res.locals.body = result.data;
    next();
  };
}
