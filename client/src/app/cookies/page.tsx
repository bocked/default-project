import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookie fayllari qoidalari | Iqtibosim",
  description: "Iqtibosim saytida cookie fayllari qanday ishlatilishi va ularni boshqarish haqida ma'lumot.",
};

export default function CookiesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-8">
      <header>
        <h1 className="font-serif text-3xl font-bold text-slate-900 dark:text-white">Cookie fayllari qoidalari</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Oxirgi yangilanish: 2026-yil avgust</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. Cookie nima?</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Cookie — bu sizning qurilmangizga (kompyuter, telefon, planshet) sayt tashrif buyurganda saqlanadigan kichik matnli fayllardir. ular saytga sizni eslab qolish, sessiyani saqlash va afzalliklarni ta&apos;minlash imkonini beradi.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Qanday cookielardan foydalanamiz</h2>
        <ul className="list-disc pl-6 space-y-3 text-slate-600 dark:text-slate-300">
          <li>
            <strong>Authentication (autentifikatsiya) cookie:</strong> JWT token localStorage da saqlanib, siz saytga qaytganda avtomatik kirishni ta&apos;minlaydi. Bu cookie xavfsizlik uchun httpOnly emas (client-side), lekin xavfsiz token o&apos;zida shaxsiy ma&apos;lumot o&apos;z ichiga olmaydi.
          </li>
          <li>
            <strong>Theme (mavzu) cookie:</strong> Tanlangan mavzu (light/dark) localStorage da saqlanib, keyingi tashriflarda avtomatik qo&apos;llaniladi.
          </li>
          <li>
            <strong>Test mode banner dismissal:</strong> Test rejimi bannerini yopganingizda, tanlovingiz localStorage da saqlanib, keyingi tashriflarda banner ko&apos;rinmaydi.
          </li>
          <li>
            <strong>Cookie consent (rozilik):</strong> Cookie bannerini qabul qilinganda, tanlovingiz localStorage da saqlanib, banner yana ko&apos;rinmaydi.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Uchinchi tomon cookielari</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Hozirda sayt <strong>uchinchi tomon cookielaridan (Google Analytics, reklama tarmoqlari, kuzatuv tizimlari) foydalanmaydi</strong>. Kelajakda shunday xizmatlar qo&apos;shilganda, bu bo&apos;lim yangilanadi va sizdan alohida rozilik so&apos;raladi.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">4. Cookielarni boshqarish</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Siz brauzer sozlamalaridan cookielarni boshqarishingiz mumkin:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Barcha cookielarni o&apos;chirish (brauzer sozlamalaridan).</li>
          <li>Cookie qabul qilishni cheklash yoki butunlay o&apos;chirish.</li>
          <li>Saytdagi &quot;Cookie roziligi&quot; ni bekor qilish (localStorage dan <code>cookieConsent</code> kalitini o&apos;chirish).</li>
        </ul>
        <p className="text-slate-600 dark:text-slate-300">
          Eslatma: Authentication cookie o&apos;chirilganda, siz saytdan chiqib ketasiz va qayta kirish kerak bo&apos;ladi.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">4. Cookie muddati</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Authentication token — 30 kun (so&apos;ng avtomatik yangilanadi).</li>
          <li>Theme va cookie consent — cheksiz (siz o&apos;chirmaguncha).</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">5. Aloqa</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Cookie qoidalari bo&apos;yicha savollar: <a href="mailto:mirabbostolqinjonov@gmail.com" className="text-blue-600 hover:underline">mirabbostolqinjonov@gmail.com</a>
        </p>
      </section>

      <footer className="pt-8 border-t border-slate-200 dark:border-slate-800">
        <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">← Bosh sahifaga qaytish</Link>
      </footer>
    </div>
  );
}