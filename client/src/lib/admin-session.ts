"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { adminSocket } from "./realtime";
import type { AdminSessionResponse } from "./types";

/**
 * Loads the acting admin session (`/api/admin/me`) that carries the dynamic
 * feature registry + effective permissions. It is refreshed whenever the
 * backend pushes `admin:permissions:changed` over the panel socket, so menus
 * re-gate themselves the moment a SUPER_ADMIN toggles the sub-admin's rights.
 */
export function useAdminSession() {
  const [session, setSession] = useState<AdminSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api<AdminSessionResponse>("/api/admin/me");
      setSession(data);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Async kick-off: the rule forbids setState synchronously inside an effect.
    window.setTimeout(() => void load(), 0);
  }, [load]);

  useEffect(() => {
    const socket = adminSocket();
    const onPermissionsChanged = () => void load();
    socket.on("admin:permissions:changed", onPermissionsChanged);
    return () => {
      socket.off("admin:permissions:changed", onPermissionsChanged);
    };
  }, [load]);

  const can = useCallback(
    (key: string): boolean => {
      if (!session) return false;
      return session.admin.isSuperAdmin || session.admin.permissions[key] === true;
    },
    [session]
  );

  return { session, loading, can, refresh: load };
}