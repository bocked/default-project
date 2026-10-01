import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async Express handler so a rejected promise is forwarded to `next()`
 * instead of escaping as an unhandled rejection.
 *
 * The app runs Express 4, which does NOT catch rejections from async handlers.
 * `src/index.ts` treats `unhandledRejection` as fatal and exits the process, so
 * a single rejected Prisma call (a timeout, a dropped connection, a P2025 on a
 * row deleted mid-request) would otherwise take the whole API offline. Wrapping
 * routes sends the failure to the central error middleware in `app.ts`, which
 * answers a clean 500, reports it to Sentry and pings the admin chat.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}