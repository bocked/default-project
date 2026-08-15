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

/** Typed fetch wrapper for the Iqtibosim API. Sends the stored JWT by default. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
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
        throw new ApiError("Serverdan javob kelmadi. Iltimos, qayta urinib ko'ring.", 0, "TIMEOUT");
      }
      throw new ApiError("Tarmoq aloqasi uzildi. Internet ulanishini tekshiring.", 0, "NETWORK");
    }

    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const message = typeof data?.error === "string" ? data.error : `So'rov bajarilmadi (${res.status})`;
      throw new ApiError(message, res.status, typeof data?.code === "string" ? data.code : undefined);
    }
    return data as T;
  } finally {
    clearTimeout(timeoutId);
  }
}
