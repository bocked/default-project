"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AdminTabs } from "@/components/admin-ui";
import { AdminUsersTab } from "@/components/admin/users-tab";
import { AdminBansTab } from "@/components/admin/bans-tab";

const TABS = [
  { id: "users", label: "Foydalanuvchilar" },
  { id: "bans", label: "Qora ro'yxat" },
];

function AdminUsersInner() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const tab = TABS.some((t) => t.id === raw) ? (raw as string) : "users";

  return (
    <div className="space-y-4">
      <AdminTabs tabs={TABS} active={tab} baseUrl="/admin/users" />
      {tab === "users" && <AdminUsersTab />}
      {tab === "bans" && <AdminBansTab />}
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense
      fallback={
        <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>
      }
    >
      <AdminUsersInner />
    </Suspense>
  );
}