import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Maxfiylik siyosati | Iqtibosim",
  description: "Iqtibosim saytining maxfiylik siyosati. Shaxsiy ma'lumotlar qanday yig'ilishi, saqlanishi va ishlatilishi haqida ma'lumot.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-8">
      <header>
        <h1 className="font-serif text-3xl font-bold text-slate-900 dark:text-white">Maxfiylik siyosati</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Oxirgi yangilanish: 2026-yil avgust</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. Yig&apos;iluvchi ma&apos;lumotlar</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Saytimizda ro&apos;yxatdan o&apos;tganda va foydalanayotganda quyidagi ma&apos;lumotlar yig&apos;ilishi mumkin:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li><strong>Email manzili</strong> — hisob yaratish, email tasdiqlash va xabarlar yuborish uchun.</li>
          <li><strong>Parol</strong> — xesh qilingan holda saqlanadi, hech kim (adminlar ham) ko&apos;ra olmaydi.</li>
          <li><strong>Ism va nik</strong> — profilga qo&apos;shish va iqtiboslarga mualliflik sifatida ko&apos;rsatish uchun.</li>
          <li><strong>Telegram ID va telefon raqami</strong> — Telegram orqali tasdiqlash va bildirishnomalar uchun. Bu ma&apos;lumotlar <strong>faqat adminlarga</strong> ko&apos;rinadi, boshqa foydalanuvchilar ko&apos;ra olmaydi.</li>
          <li><strong>IP manzili va brauzer ma&apos;lumotlari</strong> — xavfsizlik, cheklov va statistika uchun.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Ma&apos;lumotlarni ishlatish maqsadlari</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Hisob yaratish, kirish va xavfsizlikni ta&apos;minlash.</li>
          <li>Email tasdiqlash va parolni tiklash xabarlarini yuborish.</li>
          <li>Iqtiboslar qo&apos;shish, tahrirlash va moderatsiya qilish.</li>
          <li>Telegram orqali tasdiqlash va bildirishnomalar.</li>
          <li>Sayt xavfsizligini ta&apos;minlash, spam va buzilishlarga qarshi kurash.</li>
          <li>Foydalanish statistikasini yig&apos;ish (anonymlashtirilgan holda).</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Ma&apos;lumotlarni uchratish</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Shaxsiy ma&apos;lumotlaringiz uchraydi:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li><strong>Adminlar</strong> — moderatsiya, xavfsizlik va foydalanuvchi boshqaruvi uchun (to&apos;liq ko&apos;rinish).</li>
          <li><strong>Boshqa foydalanuvchilar</strong> — faqat nik (profil sahifasida va iqtiboslarda ko&apos;rinadi). Ism, email, telefon va Telegram ID ko&apos;rinmaydi.</li>
          <li><strong>Uchinchi tomonlarga</strong> — faqat qonun talab etilganda yoki xavfsizlik uchun zarur bo&apos;lsa.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">4. Cookie va texnologiyalar</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Sayt autentifikatsiya, xavfsizlik va afzallik uchun cookie va localStorage dan foydalanadi. Batafsil ma&apos;lumot <Link href="/cookies" className="text-blue-600 hover:underline dark:text-blue-400">Cookie fayllari qoidalari</Link> sahifasida.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">5. Ma&apos;lumotlarni saqlash muddati</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Hisob ma&apos;lumotlari — hisob o&apos;chirilmaguncha saqlanadi.</li>
          <li>Iqtiboslar — foydalanuvchi o&apos;chirmasa ham, arxivda saqlanadi.</li>
          <li>Log va xavfsizlik ma&apos;lumotlari — 90 kun davomida saqlanadi.</li>
        </ul>
        <p className="text-slate-600 dark:text-slate-300">
          Siz profilingizni o&apos;chirib, barcha shaxsiy ma&apos;lumotlarni o&apos;chirishni so&apos;rashingiz mumkin (profil sozlamalaridan).
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">6. Foydalanuvchi huquqlari</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Shaxsiy ma&apos;lumotlaringizni ko&apos;rish, tahrirlash va o&apos;chirish huquqi.</li>
          <li>Ma&apos;lumotlaringizni yuklab olish (data portability).</li>
          <li>Cookie va kuzatuvdan chetlash (brauzer sozlamalaridan).</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">7. Aloqa</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Maxfiylik siyosati bo&apos;yicha savollar uchun: <a href="mailto:mirabbostolqinjonov@gmail.com" className="text-blue-600 hover:underline">mirabbostolqinjonov@gmail.com</a>
        </p>
      </section>

      <footer className="pt-8 border-t border-slate-200 dark:border-slate-800">
        <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">← Bosh sahifaga qaytish</Link>
      </footer>
    </div>
  );
}