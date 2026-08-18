import { config } from "./config";

const TOKEN_KEY = "iqtibosim_token";

export const tokenStore = {
  get(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(TOKEN_KEY);
  },
  set(token: string): void {
    window.localStorage.setItem(TOKEN_KEY, token);
  },
  clear(): void {
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

/** Typed fetch wrapper for the Iqtibosim API. Sends the stored JWT by default. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  let lastError: ApiError | null = null;

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
        const message = typeof data?.error === "string" ? data.error : `So'rov bajarilmadi (${res.status})`;
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
