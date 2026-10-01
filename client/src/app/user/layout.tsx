import type { Metadata } from "next";
import { privateMeta } from "@/lib/siteMeta";

/** Metadata-only layout; `user/page.tsx` is a Client Component and cannot
 *  export `metadata` itself. noindex — user pages are personal and thin. */
export const metadata: Metadata = privateMeta({
  path: "/user",
  title: "Foydalanuvchi",
  description: "Iqtibosim foydalanuvchisi profili.",
});

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return children;
}