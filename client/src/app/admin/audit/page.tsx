"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AdminTabs } from "@/components/admin-ui";
import { AdminAuditLogsTab } from "@/components/admin/audit-logs-tab";
import { AdminLiveLogsTab } from "@/components/admin/live-logs-tab";
import { AdminActivityTab } from "@/components/admin/activity-tab";

const TABS = [
  { id: "audit", label: "Admin Audit Loglar" },
  { id: "logs", label: "Jonli Loglar" },
  { id: "activity", label: "User Faolligi" },
];

function AdminAuditInner() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const tab = TABS.some((t) => t.id === raw) ? (raw as string) : "audit";

  return (
    <div className="space-y-4">
      <AdminTabs tabs={TABS} active={tab} baseUrl="/admin/audit" />
      {tab === "audit" && <AdminAuditLogsTab />}
      {tab === "logs" && <AdminLiveLogsTab />}
      {tab === "activity" && <AdminActivityTab />}
    </div>
  );
}

export default function AdminAuditPage() {
  return (
    <Suspense
      fallback={
        <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>
      }
    >
      <AdminAuditInner />
    </Suspense>
  );
}