import { config } from "./config";

const TOKEN_KEY = "iqtibosim_token";

/**
 * Access-token store. Kept in sessionStorage (survives reloads, dies with the
 * tab) instead of localStorage so a successful XSS cannot silently persist the
 * JWT on the victim's machine for other tabs/visits. A one-time migration
 * moves any token left in localStorage by older builds into sessionStorage.
 */
export const tokenStore = {
  get(): string | null {
    if (typeof window === "undefined") return null;
    const session = window.sessionStorage.getItem(TOKEN_KEY);
    if (session) return session;
    const legacy = window.localStorage.getItem(TOKEN_KEY);
    if (legacy) {
      window.sessionStorage.setItem(TOKEN_KEY, legacy);
      window.localStorage.removeItem(TOKEN_KEY);
      return legacy;
    }
    return null;
  },
  set(token: string): void {
    window.sessionStorage.setItem(TOKEN_KEY, token);
    window.localStorage.removeItem(TOKEN_KEY);
  },
  clear(): void {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string;
}

/** Hard cap for every request so the UI never hangs on a stuck connection. */
const REQUEST_TIMEOUT_MS = 15000;

/** Network/timeout errors (status === 0) are retried with exponential backoff. */
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Redeems the HttpOnly refresh cookie for a fresh short-lived access token.
 * The raw cookie is set by the server on login/register (SameSite/credentials
 * only work cross-origin on https). Deduplicated so concurrent 401s share one
 * refresh round trip instead of hammering the endpoint.
 */
let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${config.url}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = (await res.json().catch(() => null)) as { token?: string } | null;
      if (data?.token) tokenStore.set(data.token);
      return data?.token ?? null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
      clearTimeout(timeoutId);
    }
  })();
  return refreshPromise;
}

/** Typed fetch wrapper for the Iqtibosim API. Sends the stored JWT by default. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  let lastError: ApiError | null = null;
  // A 401 with a cookie-set session is retried once after rotating the access
  // token; an explicit `options.token` never triggers the refresh flow.
  let refreshed = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }

    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const token = options.token ?? tokenStore.get();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      let res: Response;
      try {
        res = await fetch(`${config.url}${path}`, {
          method: options.method ?? "GET",
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        const name = (err as { name?: string } | null)?.name ?? "";
        if (name === "AbortError") {
          lastError = new ApiError("Serverdan javob kelmadi. Iltimos, qayta urinib ko'ring.", 0, "TIMEOUT");
        } else {
          lastError = new ApiError("Tarmoq aloqasi uzildi. Internet ulanishini tekshiring.", 0, "NETWORK");
        }
        continue; // retry
      } finally {
        clearTimeout(timeoutId);
      }

      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        if (res.status === 401 && token && !options.token && !refreshed) {
          refreshed = true;
          const nextToken = await tryRefreshToken();
          if (nextToken) continue; // loop again with the fresh token
        }
        const message =
          typeof data?.error === "string"
            ? data.error
            : typeof data?.message === "string"
              ? data.message
              : `So'rov bajarilmadi (${res.status})`;
        throw new ApiError(message, res.status, typeof data?.code === "string" ? data.code : undefined);
      }
      return data as T;
    } catch (err) {
      if (err instanceof ApiError) {
        // Network/timeout errors are retried; HTTP errors (4xx/5xx) are not.
        if (err.status === 0 && attempt < MAX_RETRIES) {
          lastError = err;
          continue;
        }
        throw err;
      }
      throw err;
    }
  }

  throw lastError ?? new ApiError("Xatolik yuz berdi.", 0, "UNKNOWN");
}
