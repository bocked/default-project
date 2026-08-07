import { jwtVerify, SignJWT } from "jose";
import { config } from "../config.js";

const encoder = new TextEncoder();
const secret = encoder.encode(config.jwtSecret);

export interface TokenPayload {
  sub: string;
  username: string;
  role: string;
  displayName?: string;
  color?: string;
}

export async function signToken(payload: TokenPayload): Promise<string> {
  const claims: Record<string, string> = {
    username: payload.username,
    role: payload.role,
  };
  if (payload.displayName) claims.displayName = payload.displayName;
  if (payload.color) claims.color = payload.color;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + config.jwtExpiresInSeconds)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.sub !== "string" || typeof payload.username !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return {
      sub: payload.sub,
      username: payload.username,
      role: payload.role,
      displayName: typeof payload.displayName === "string" ? payload.displayName : undefined,
      color: typeof payload.color === "string" ? payload.color : undefined,
    };
  } catch {
    return null;
  }
}

export function tokenFromHeader(header: string | undefined): string {
  if (!header) return "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return header.trim();
}
