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

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(20).max(128),
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

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20).max(128),
  password: z.string().min(8).max(72),
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
});
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

export const telegramVerifySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { message: "Kod 6 ta raqamdan iborat bo'lishi kerak" }),
});
export type TelegramVerify = z.infer<typeof telegramVerifySchema>;

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

export const quoteCreateSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  categorySlug: z.string().trim().min(1).max(60),
  tags: z.array(z.string().trim().max(40)).max(5).default([]),
  anonymous: z.boolean().default(false),
  telegramUrl,
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

export const tagUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40),
});
export type TagUpdate = z.infer<typeof tagUpdateSchema>;

export const contentUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  value: z.string().trim().min(1).max(2000),
});
export type ContentUpdate = z.infer<typeof contentUpdateSchema>;

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
