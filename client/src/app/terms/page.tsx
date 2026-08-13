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
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. Umumiy qoidalar</h2>
        <p className="text-slate-600 dark:text-slate-300">
          <strong>Iqtibosim</strong> saytidan foydalangan holda, siz quyidagi shartlarga rozilik bildirasiz. Agar shartlardan biror biriga rozilmasangiz, saytdan foydalanganingizni to&apos;xtating.
        </p>
        <p className="text-slate-600 dark:text-slate-300">
          Sayt hozircha <strong>test rejimi (Beta)</strong>da ishlayapti. Xatoliklar, buzilishlar yoki ma&apos;lumotlar yo&apos;qolishi yuzaga kelishi mumkin. Admin tomoni bu haqda mas&apos;uliyat qabul qilmaydi.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Foydalanuvchi hisob raqami</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Hisob yaratish uchun email va parol talab etiladi.</li>
          <li>Email tasdiqlanmaguncha iqtibos qo&apos;shish cheklangan.</li>
          <li>Parol xavfsizligi sizning mas&apos;uliyatingizda — uchinchilarga bermang.</li>
          <li>Bitta shaxs bir nechta hisob yaratishi taqiqlanmaydi, lekin spam qilish mumkin emas.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Kontent qoidalari</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Iqtiboslar o&apos;zingizga tegishli bo&apos;lishi yoki mualliflik huquqi buzilmaydigan bo&apos;lishi kerak.</li>
          <li>Qoidabuzuvchi, so&apos;kindi, ekstremist, pornografik yoki qonunga zid kontent taqiqlanadi.</li>
          <li>Spam, reklama va havola tarqatish maqsadida iqtibos yuborish taqiqlanadi.</li>
          <li>Barcha iqtiboslar moderatsiyadan o&apos;tadi. Adminlar iqtibosni rad etish, tahrirlash yoki o&apos;chirish huquqiga ega.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">4. Foydalanuvchi mas&apos;uliyati</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Siz yuborgan iqtiboslar uchun to&apos;liq mas&apos;uliyatni o&apos;z zabtinizga olasiz.</li>
          <li>Boshqalarning huquqlarini buzganingizda yuridik natijalarga tortilishingiz mumkin.</li>
          <li>Sayt xavfsizligini buzishga harakat qilish (xakerlik, DDoS, SQL injection va boshqalar) taqiqlanadi.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">5. Admin huquqlari</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Adminlar iqtiboslarni tasdiqlash, rad etish, tahrirlash, arxivga yuborish va tiklash huquqiga ega.</li>
          <li>Foydalanuvchilarni bloklash, arxivga yuborish yoki roli o&apos;zgartirish mumkin.</li>
          <li>Admin harakati audit logga yoziladi va ko&apos;rib chiqish uchun saqlanadi.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">6. Test rejimi va mas&apos;uliyat cheklov</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Sayt <strong>&quot;shunday qilib&quot; (as is)</strong> va &quot;mavjud bo&apos;lgan holatda&quot; (as available) taqdim etiladi. Hech qanday kafolat berilmaydi:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Sayt doimiy ishlashini va xatoliksizlikni.</li>
          <li>Ma&apos;lumotlar yo&apos;qolmasligi yoki buzilmaganligini.</li>
          <li>Uchinchi tomon xizmatlari (Telegram, Brevo, Render, Cloudflare) to&apos;g&apos;ri ishlashini.</li>
        </ul>
        <p className="text-slate-600 dark:text-slate-300">
          Admin tomoni saytda yuzaga kelgan har qanday zarar (to&apos;g&apos;ridan-to&apos;g&apos;ri, poyga, tasodifiy) uchun mas&apos;uliyat qabul qilmaydi.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">7. Shartlarning o&apos;zgartirilishi</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Shartlar ogohlantirishsiz o&apos;zgartirilishi mumkin. Yangilanishlar bu sahifada nashr etiladi. Foydalanishni davom ettirish — yangi shartlarga rozilik bildirishdir.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">8. Aloqa</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Shartlar bo&apos;yicha savollar: <a href="mailto:mirabbostolqinjonov@gmail.com" className="text-blue-600 hover:underline">mirabbostolqinjonov@gmail.com</a>
        </p>
      </section>

      <footer className="pt-8 border-t border-slate-200 dark:border-slate-800">
        <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">← Bosh sahifaga qaytish</Link>
      </footer>
    </div>
  );
}