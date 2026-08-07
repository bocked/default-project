"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { config } from "@/lib/config";
import type { User } from "@/lib/types";

const TOKEN_KEY = "canvas_token";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function authRequest<T>(path: string, method: string, body?: unknown, token?: string | null): Promise<T> {
  const res = await fetch(`${config.url}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "So'rov xatosi");
  return data as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null
  );
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() =>
    typeof window !== "undefined" ? Boolean(window.localStorage.getItem(TOKEN_KEY)) : false
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    authRequest<{ user: User }>("/api/auth/me", "GET", undefined, token)
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) {
          window.localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const store = useCallback((newToken: string, newUser: User) => {
    window.localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
    setLoading(false);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await authRequest<{ token: string; user: User }>("/api/auth/login", "POST", { username, password });
      store(data.token, data.user);
    },
    [store]
  );

  const register = useCallback(
    async (username: string, password: string, displayName?: string) => {
      const data = await authRequest<{ token: string; user: User }>("/api/auth/register", "POST", {
        username,
        password,
        displayName,
      });
      store(data.token, data.user);
    },
    [store]
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setLoading(false);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout }),
    [user, token, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
