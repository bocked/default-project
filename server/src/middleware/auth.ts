import { NextFunction, Request, Response } from "express";
import { tokenFromHeader, verifyToken, type TokenPayload } from "../lib/token.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = tokenFromHeader(req.headers.authorization);
  req.user = token ? ((await verifyToken(token)) ?? undefined) : undefined;
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = tokenFromHeader(req.headers.authorization);
  const payload = token ? await verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.user = payload;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
