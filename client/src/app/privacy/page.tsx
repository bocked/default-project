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
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. Yig'iluvchi ma'lumotlar</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Saytimizda ro'yxatdan o'tganda va foydalanayotganda quyidagi ma'lumotlar yig'ilishi mumkin:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li><strong>Email manzili</strong> — hisob yaratish, email tasdiqlash va xabarlar yuborish uchun.</li>
          <li><strong>Parol</strong> — xesh qilingan holda saqlanadi, hech kim (adminlar ham) ko'ra olmaydi.</li>
          <li><strong>Ism va nik</strong> — profilga qo'shish va iqtiboslarga mualliflik sifatida ko'rsatish uchun.</li>
          <li><strong>Telegram ID va telefon raqami</strong> — Telegram orqali tasdiqlash va bildirishnomalar uchun. Bu ma'lumotlar <strong>faqat adminlarga</strong> ko'rinadi, boshqa foydalanuvchilar ko'ra olmaydi.</li>
          <li><strong>IP manzili va brauzer ma'lumotlari</strong> — xavfsizlik, cheklov va statistika uchun.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Ma'lumotlarni ishlatish maqsadlari</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Hisob yaratish, kirish va xavfsizlikni ta'minlash.</li>
          <li>Email tasdiqlash va parolni tiklash xabarlarini yuborish.</li>
          <li>Iqtiboslar qo'shish, tahrirlash va moderatsiya qilish.</li>
          <li>Telegram orqali tasdiqlash va bildirishnomalar.</li>
          <li>Sayt xavfsizligini ta'minlash, spam va buzilishlarga qarshi kurash.</li>
          <li>Foydalanish statistikasini yig'ish (anonymlashtirilgan holda).</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Ma'lumotlarni uchratish</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Shaxsiy ma'lumotlaringiz uchraydi:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li><strong>Adminlar</strong> — moderatsiya, xavfsizlik va foydalanuvchi boshqaruvi uchun (to'liq ko'rinish).</li>
          <li><strong>Boshqa foydalanuvchilar</strong> — faqat nik (profil sahifasida va iqtiboslarda ko'rinadi). Ism, email, telefon va Telegram ID ko'rinmaydi.</li>
          <li><strong>Uchinchi tomonlarga</strong> — faqat qonun talab etilganda yoki xavfsizlik uchun zarur bo'lsa.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">4. Cookie va texnologiyalar</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Sayt autentifikatsiya, xavfsizlik va afzallik uchun cookie va localStorage dan foydalanadi. Batafsil ma'lumot <Link href="/cookies" className="text-blue-600 hover:underline dark:text-blue-400">Cookie fayllari qoidalari</Link> sahifasida.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">5. Ma'lumotlarni saqlash muddati</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Hisob ma'lumotlari — hisob o'chirilmaguncha saqlanadi.</li>
          <li>Iqtiboslar — foydalanuvchi o'chirmasa ham, arxivda saqlanadi.</li>
          <li>Log va xavfsizlik ma'lumotlari — 90 kun davomida saqlanadi.</li>
        </ul>
        <p className="text-slate-600 dark:text-slate-300">
          Siz profilingizni o'chirib, barcha shaxsiy ma'lumotlarni o'chirishni so'rashingiz mumkin (profil sozlamalaridan).
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">6. Foydalanuvchi huquqlari</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Shaxsiy ma'lumotlaringizni ko'rish, tahrirlash va o'chirish huquqi.</li>
          <li>Ma'lumotlaringizni yuklab olish (data portability).</li>
          <li>Cookie va kuzatuvdan chetlash (brauzer sozlamalaridan).</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">7. Aloqa</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Maxfiylik siyosati bo'yicha savollar uchun: <a href="mailto:mirabbostolqinjonov@gmail.com" className="text-blue-600 hover:underline">mirabbostolqinjonov@gmail.com</a>
        </p>
      </section>

      <footer className="pt-8 border-t border-slate-200 dark:border-slate-800">
        <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">← Bosh sahifaga qaytish</Link>
      </footer>
    </div>
  );
}