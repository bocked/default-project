// Shared legal copy used by the static /terms and /privacy pages and by the
// TermsModal. Pure JSX — no hooks — so it renders fine in both server and
// client components.

interface LegalContentProps {
  /** In the modal we replace in-page <Link>s with plain text so the visitor
   *  never leaves the register/login flow. */
  modal?: boolean;
}

function PrivacyCookieLine({ modal }: LegalContentProps) {
  if (modal) {
    return <span>Cookie fayllari qoidalari (alohida sahifada)</span>;
  }
  return <a href="/cookies" className="text-blue-600 hover:underline dark:text-blue-400">Cookie fayllari qoidalari</a>;
}

export function TermsContent() {
  return (
    <>
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
          Shartlar ogohlantirishsiz o&apos;zgartirilishi mumkin. Yangilanishlar bu sahifada nashr etiladi. Foydalanishni davom ettirish — yangi shartlarga rozilik bildirishdir. Shartlar yangilanganda tizimga kirganingizda yangi shartlarga qayta rozilik so&apos;raladi.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">8. Aloqa</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Shartlar bo&apos;yicha savollar: <a href="mailto:mirabbostolqinjonov@gmail.com" className="text-blue-600 hover:underline">mirabbostolqinjonov@gmail.com</a>
        </p>
      </section>
    </>
  );
}

export function CookieContent() {
  return (
    <>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. Cookie nima?</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Cookie — bu sizning qurilmangizga (kompyuter, telefon, planshet) sayt tashrif buyurganda saqlanadigan kichik matnli fayllardir. Ular saytga sizni eslab qolish, sessiyani saqlash va afzalliklarni ta&apos;minlash imkonini beradi.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Qanday saqlash texnologiyalaridan foydalanamiz</h2>
        <ul className="list-disc pl-6 space-y-3 text-slate-600 dark:text-slate-300">
          <li>
            <strong>Authentication (autentifikatsiya):</strong> JWT token localStorage da saqlanib, saytga qaytganda avtomatik kirishni ta&apos;minlaydi. Token o&apos;zida shaxsiy ma&apos;lumot o&apos;z ichiga olmaydi.
          </li>
          <li>
            <strong>Theme (mavzu):</strong> Tanlangan mavzu (light/dark) localStorage da saqlanib, keyingi tashriflarda avtomatik qo&apos;llaniladi.
          </li>
          <li>
            <strong>Test mode banner dismiss:</strong> Test rejimi bannerini yopganingizda, tanlovingiz localStorage da saqlanib, keyingi tashriflarda banner ko&apos;rinmaydi.
          </li>
          <li>
            <strong>Cookie consent (rozilik):</strong> Cookie bannerini qabul qilganda, tanlovingiz localStorage da saqlanib, shu qurilmada bir marta so&apos;raladi. Foydalanish shartlari yangilanganida (versiya o&apos;zgarganda) rozilik qayta so&apos;raladi.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Uchinchi tomon cookie fayllari</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Hozirda sayt uchinchi tomon cookie fayllaridan (Google Analytics, reklama tarmoqlari, kuzatuv tizimlari) foydalanmaydi. Kelajakda shunday xizmatlar qo&apos;shilganda, bu bo&apos;lim yangilanadi va sizdan alohida rozilik so&apos;raladi.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">4. Cookie fayllarini boshqarish</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Barcha cookie fayllarini o&apos;chirish (brauzer sozlamalaridan).</li>
          <li>Cookie qabul qilishni cheklash yoki butunlay o&apos;chirish.</li>
          <li>Saytdagi cookie roziligini bekor qilish (localStorage dan <code>cookieConsent</code> kalitini o&apos;chirish).</li>
        </ul>
        <p className="text-slate-600 dark:text-slate-300">
          Eslatma: Authentication cookie o&apos;chirilganda, siz saytdan chiqib ketasiz va qayta kirish kerak bo&apos;ladi.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">5. Saqlash muddati</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Authentication token — 30 kun (so&apos;ng avtomatik yangilanadi).</li>
          <li>Theme va cookie consent — cheksiz (siz o&apos;chirmaguncha).</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">6. Aloqa</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Cookie qoidalari bo&apos;yicha savollar: <a href="mailto:mirabbostolqinjonov@gmail.com" className="text-blue-600 hover:underline">mirabbostolqinjonov@gmail.com</a>
        </p>
      </section>
    </>
  );
}

export function PrivacyContent({ modal = false }: LegalContentProps) {
  return (
    <>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. Yig&apos;iluvchi ma&apos;lumotlar</h2>
        <p className="text-slate-600 dark:text-slate-300">
          Saytimizda ro&apos;yxatdan o&apos;tganda va foydalanayotganda quyidagi ma&apos;lumotlar yig&apos;ilishi mumkin:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li><strong>Email manzili</strong> — hisob yaratish, email tasdiqlash va xabarlar yuborish uchun.</li>
          <li><strong>Parol</strong> — xesh qilingan holda saqlanadi, hech kim (adminlar ham) ko&apos;ra olmaydi.</li>
          <li><strong>Ism va nik</strong> — profilga qo&apos;shish va iqtiboslarga mualliflik sifatida ko&apos;rsatish uchun.</li>
          <li><strong>Telegram ID va telefon raqami</strong> — Telegram orqali tasdiqlash va bildirishnomalar uchun. Bu ma&apos;lumotlar <strong>faqat adminlarga</strong> ko&apos;rinadi.</li>
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
          Sayt autentifikatsiya, xavfsizlik va afzallik uchun cookie va localStorage dan foydalanadi. Batafsil ma&apos;lumot <PrivacyCookieLine modal={modal} /> sahifasida.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">5. Ma&apos;lumotlarni saqlash muddati</h2>
        <ul className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          <li>Hisob ma&apos;lumotlari — hisob o&apos;chirilmaguncha saqlanadi.</li>
          <li>Iqtiboslar — foydalanuvchi o&apos;chirmasa ham, arxivda saqlanadi.</li>
          <li>Log va xavfsizlik ma&apos;lumotlari — 90 kun davomida saqlanadi.</li>
        </ul>
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
    </>
  );
}