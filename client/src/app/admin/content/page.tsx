"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AdminTabs } from "@/components/admin-ui";
import { AdminQuotesTab } from "@/components/admin/quotes-tab";
import { AdminCategoriesTab } from "@/components/admin/categories-tab";
import { AdminHashtagsTab } from "@/components/admin/hashtags-tab";
import { AdminTrashTab } from "@/components/admin/trash-tab";

const TABS = [
  { id: "quotes", label: "Iqtiboslar" },
  { id: "categories", label: "Kategoriyalar" },
  { id: "hashtags", label: "Heshteglar" },
  { id: "trash", label: "Arxiv" },
];

function AdminContentInner() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const tab = TABS.some((t) => t.id === raw) ? (raw as string) : "quotes";

  return (
    <div className="space-y-4">
      <AdminTabs tabs={TABS} active={tab} baseUrl="/admin/content" />
      {tab === "quotes" && <AdminQuotesTab />}
      {tab === "categories" && <AdminCategoriesTab />}
      {tab === "hashtags" && <AdminHashtagsTab />}
      {tab === "trash" && <AdminTrashTab />}
    </div>
  );
}

export default function AdminContentPage() {
  return (
    <Suspense
      fallback={
        <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>
      }
    >
      <AdminContentInner />
    </Suspense>
  );
}