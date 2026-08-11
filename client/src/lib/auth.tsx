"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokenStore } from "./api";
import type { User } from "./types";

interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  nickname?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap(): Promise<void> {
      const token = tokenStore.get();
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const { user: me } = await api<{ user: User }>("/api/auth/me");
        if (!cancelled) setUser(me);
      } catch {
        tokenStore.clear();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const { token, user: me } = await api<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    tokenStore.set(token);
    setUser(me);
    return me;
  }, []);

  const register = useCallback(async (input: RegisterInput): Promise<User> => {
    const { token, user: me } = await api<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: input,
    });
    tokenStore.set(token);
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const refresh = useCallback(async (): Promise<User | null> => {
    if (!tokenStore.get()) return null;
    try {
      const { user: me } = await api<{ user: User }>("/api/auth/me");
      setUser(me);
      return me;
    } catch {
      tokenStore.clear();
      setUser(null);
      return null;
    }
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
