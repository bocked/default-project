"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AdminTabs } from "@/components/admin-ui";
import { AdminGeneralSettingsTab } from "@/components/admin/general-settings-tab";
import { AdminSeoTab } from "@/components/admin/seo-tab";
import { AdminContentBlocksTab } from "@/components/admin/content-blocks-tab";

const TABS = [
  { id: "general", label: "Umumiy Sozlamalar" },
  { id: "seo", label: "SEO Qoidalari" },
  { id: "content", label: "Content Blocks" },
];

function AdminSettingsInner() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const tab = TABS.some((t) => t.id === raw) ? (raw as string) : "general";

  return (
    <div className="space-y-4">
      <AdminTabs tabs={TABS} active={tab} baseUrl="/admin/settings" />
      {tab === "general" && <AdminGeneralSettingsTab />}
      {tab === "seo" && <AdminSeoTab />}
      {tab === "content" && <AdminContentBlocksTab />}
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <Suspense
      fallback={
        <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>
      }
    >
      <AdminSettingsInner />
    </Suspense>
  );
}