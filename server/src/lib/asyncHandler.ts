import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async Express handler so a rejected promise is forwarded to `next()`
 * instead of escaping as an unhandled rejection.
 *
 * The app runs Express 4, which does NOT catch rejections from async handlers,
 * so an un-wrapped handler never reaches the error middleware: the response is
 * simply never written and the client's request hangs until it times out.
 *
 * Wrapping routes sends the failure to the central error middleware in
 * `app.ts`, which answers a clean 500, reports it to Sentry and pings the
 * admin chat. `src/index.ts` separately treats `unhandledRejection` as
 * non-fatal (log + Sentry, process keeps serving) so one detached promise
 * cannot take the API offline - but that safety net cannot help a request whose
 * response was left hanging, which is exactly what this wrapper prevents.
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