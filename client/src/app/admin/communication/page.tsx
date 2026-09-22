"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AdminTabs } from "@/components/admin-ui";
import { AdminAnnouncementsTab } from "@/components/admin/announcements-tab";
import { AdminFeedbackTab } from "@/components/admin/feedback-tab";

const TABS = [
  { id: "announcements", label: "E'lonlar" },
  { id: "feedback", label: "Shikoyatlar" },
];

function AdminCommunicationInner() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const tab = TABS.some((t) => t.id === raw) ? (raw as string) : "announcements";

  return (
    <div className="space-y-4">
      <AdminTabs tabs={TABS} active={tab} baseUrl="/admin/communication" />
      {tab === "announcements" && <AdminAnnouncementsTab />}
      {tab === "feedback" && <AdminFeedbackTab />}
    </div>
  );
}

export default function AdminCommunicationPage() {
  return (
    <Suspense
      fallback={
        <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>
      }
    >
      <AdminCommunicationInner />
    </Suspense>
  );
}