import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Foydalanish shartlari | Iqtibosim",
  description: "Iqtibosim saytidan foydalanish shartlari va qoidalari. Test rejimi va foydalanuvchi mas'uliyati haqida ma'lumot.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-8">
      <header>
        <h1 className="font-serif text-3xl font-bold text-slate-900 dark:text-white">Foydalanish shartlari</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Oxirgi yangilanish: 2026-yil avgust</p>
      </header>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. Umumiy qoidalr</h2>
        <p className="text-slate-600 dark:text-slate-300">
          <strong>Iqtibosim</strong> saytidan foydalangan holda, siz quyidagi shartlarga rozilik bildirasiz. Agar shartlardan biror biriga rozilmasangiz, saytdan foydalanganingizni to'xtating.
        </p>
        <p className="text-slate-600 dark:text-slate-300">
          Sayt hozircha <strong>test rejimi (Beta)</strong>da ishlayapti. Xatoliklar, buzilishlar yoki ma'lumotlar yo'qolishi yuzaga kelishi mumkin. Admin tomoni bu haqda mas'uliyat qabul qilmaydi.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Foydalanuvchi hisob raqami</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Hisob yaratish uchun email va parol talab etiladi.</li>
          <li>Email tasdiqlanmaguncha iqtibos qo'shish cheklangan.</li>
          <li>Parol xavfsizligi sizning mas'uliyatingizda — uchinchilarga bermang.</li>
          <li>Bitta shaxs bir nechta hisob yaratishi taqiqlanmaydi, lekin spam qilish mumkin emas.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Kontent qoidalari</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Iqtiboslar o'zingizga tegishli bo'lishi yoki mualliflik huquqi buzilmaydigan bo'lishi kerak.</li>
          <li>Qoidabuzuvchi, so'kindi, ekstremist, pornografik yoki qonunga zid kontent taqiqlanadi.</li>
          <li>Spam, reklama va havola tarqatish maqsadida iqtibos yuborish taqiqlanadi.</li>
          <li>Barcha iqtiboslar moderatsiyadan o'tadi. Adminlar iqtibosni rad etish, tahrirlash yoki o'chirish huquqiga ega.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">4. Foydalanuvchi mas'uliyati</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Siz yuborgan iqtiboslar uchun to'liq mas'uliyatni o'z zabtinizga olasiz.</li>
          <li>Boshqalarning huquqlarini buzganingizda yuridik natijalarga tortilishingiz mumkin.</li>
          <li>Sayt xavfsizligini buzishga harakat qilish (xakerlik, DDoS, SQL injection va boshqalar) taqiqlanadi.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">5. Admin huquqlari</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Adminlar iqtiboslarni tasdiqlash, rad etish, tahrirlash, arxivga yuborish va tiklash huquqiga ega.</li>
          <li>Foydalanuvchilarni bloklash, arxivga yuborish yoki roli o'zgartirish mumkin.</li>
          <li>Admin harakati audit logga yoziladi va ko'rib chiqish uchun saqlanadi.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">6. Test rejimi va mas'uliyat cheklov</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Sayt <strong>"shunday qilib" (as is)</strong> va "mavjud bo'lgan holatda" (as available) taqdim etiladi. Hech qanday kafolat berilmaydi:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Sayt doimiy ishlashini va xatoliksizlikni.</li>
          <li>Ma'lumotlar yo'qolmasligi yoki buzilmaganligini.</li>
          <li>Uchinchi tomon xizmatlari (Telegram, Brevo, Render, Cloudflare) to'g'ri ishlashini.</li>
        </ul>
        <p className="text-slate-600 dark:text-slate-300">
          Admin tomoni saytda yuzaga kelgan har qanday zarar (to'g'ridan-to'g'ri, poyga, tasodifiy) uchun mas'uliyat qabul qilmaydi.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">7. Shartlarning o'zgartirilishi</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Shartlar ogohlantirishsiz o'zgartirilishi mumkin. Yangilanishlar bu sahifada nashr etiladi. Foydalanishni davom ettirish — yangi shartlarga rozilik bildirishdir.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">8. Aloqa</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Shartlar bo'yicha savollar: <a href="mailto:mirabbostolqinjonov@gmail.com" className="text-blue-600 hover:underline">mirabbostolqinjonov@gmail.com</a>
        </p>
      </section>

      <footer className="pt-8 border-t border-slate-200 dark:border-slate-800">
        <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">← Bosh sahifaga qaytish</Link>
      </footer>
    </div>
  );
}