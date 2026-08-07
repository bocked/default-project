import { z } from "zod";

const finite = () => z.number().finite();

export const itemTypeSchema = z.enum(["TEXT", "STICKY", "IMAGE"]);
export type ItemType = z.infer<typeof itemTypeSchema>;

// ---------------------------------------------------------------------------
// Socket event payloads
// ---------------------------------------------------------------------------

export const cursorMoveSchema = z.object({
  x: finite(),
  y: finite(),
});
export type CursorMove = z.infer<typeof cursorMoveSchema>;

export const itemCreateSchema = z.object({
  type: itemTypeSchema,
  content: z.string().min(1).max(4000),
  x: finite(),
  y: finite(),
  color: z.string().max(32).optional(),
});
export type ItemCreate = z.infer<typeof itemCreateSchema>;

export const itemMoveSchema = z.object({
  id: z.string().min(1).max(64),
  x: finite(),
  y: finite(),
});
export type ItemMove = z.infer<typeof itemMoveSchema>;

export const itemDeleteSchema = z.object({
  id: z.string().min(1).max(64),
});
export type ItemDelete = z.infer<typeof itemDeleteSchema>;

export const itemReactionSchema = z.object({
  id: z.string().min(1).max(64),
  emoji: z.string().min(1).max(8),
});
export type ItemReaction = z.infer<typeof itemReactionSchema>;

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
