"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { QuoteCard } from "@/components/QuoteCard";
import type { PublicUserProfileData } from "@/lib/types";

export default function UserProfilePage() {
  return (
    <Suspense
      fallback={<p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">Yuklanmoqda...</p>}
    >
      <UserProfile />
    </Suspense>
  );
}

function UserProfile() {
  const params = useSearchParams();
  const id = params.get("id");
  const [data, setData] = useState<PublicUserProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void api<PublicUserProfileData>(`/api/users/${encodeURIComponent(id)}`)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Profil yuklab bo'lmadi");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">Foydalanuvchi topilmadi</p>;
  }
  if (error) {
    return (
      <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">{error}</p>
    );
  }
  if (!data) {
    return <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">Yuklanmoqda...</p>;
  }

  const displayName = data.user.nickname ? `@${data.user.nickname}` : "Foydalanuvchi";

  return (
    <div className="space-y-6">
      <section className="text-center">
        <h1 className="font-serif text-2xl font-bold text-slate-900 dark:text-white">{displayName}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          A&apos;zo: {new Date(data.user.createdAt).toLocaleDateString("uz-UZ")} · {data.quotes.length} ta iqtibos
        </p>
      </section>

      {data.quotes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Bu foydalanuvchi hali tasdiqlangan iqtibos qo&apos;shmagan.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.quotes.map((quote) => (
            <QuoteCard key={quote.id} quote={quote} />
          ))}
        </div>
      )}
    </div>
  );
}
