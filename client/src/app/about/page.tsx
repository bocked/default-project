import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sayt haqida | Iqtibosim",
  description:
    "Iqtibosim saytida nimalar bor: iqtiboslar lentasi, qidiruv, bo'limlar va heshteglar, foydalanuvchi imkoniyatlari hamda qo'shimcha sahifalar haqida to'liq ma'lumot.",
};

function Section({
  number,
  title,
  id,
  children,
}: {
  number: string;
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-sm font-bold text-white">
          {number}
        </span>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
      </div>
      <div className="mt-4 space-y-3 text-slate-600 dark:text-slate-300">{children}</div>
    </section>
  );
}

function FeatureList({ items }: { items: Array<{ title: string; text: string }> }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.title} className="flex gap-3">
          <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-100">{item.title}</p>
            <p className="mt-0.5 text-sm">{item.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="text-center">
        <h1 className="font-serif text-3xl font-bold text-slate-900 dark:text-white">Sayt haqida</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500 dark:text-slate-400">
          Iqtibosim — dono fikrlarni to&apos;playdigan, bo&apos;limlar va heshteglar bo&apos;yicha saralanadigan,
          har bir iqtibos moderatsiyadan o&apos;tadigan iqtiboslar sayti.
        </p>
      </header>

      <Section id="asosiy" number="1" title="Asosiy sahifa va qidiruv">
        <p>
          Saytning bosh sahifasida <strong>tasdiqlangan iqtiboslar lentasi</strong> joylashgan. Har bir iqtibos
          kartasida iqtibos matni, muallif, qo&apos;shilgan sana, bo&apos;lim nomi, heshteglar, ko&apos;rishlar soni
          va layklar soni ko&apos;rinadi.
        </p>
        <FeatureList
          items={[
            {
              title: "Qidiruv",
              text: "Yuqoridagi qidiruv maydoniga matn yozsangiz, iqtibos matni, muallif va heshteglar bo'yicha natijalar avtomatik (real vaqt rejimida) yangilanadi.",
            },
            {
              title: "Saralash va filtrlash",
              text: "Kategoriya tugmachalarini bosib bo'lim bo'yicha, heshteglar bo'yicha esa # belgisi bilan filtrlashingiz mumkin. Filtrlangan natijalarni \"Filtrni tozalash\" tugmasi bilan bekor qilish oson.",
            },
            {
              title: "Ko'proq ko'rsatish",
              text: "Lenta sahifalarga bo'lingan emas, balki pastga \"Ko'proq ko'rsatish\" tugmasi orqali asta-sekin yuklanadi.",
            },
          ]}
        />
      </Section>

      <Section id="kategoriyalar" number="2" title="Kategoriyalar va Heshteglar">
        <p>
          Iqtiboslarni <strong>bo&apos;limlar (kategoriyalar)</strong> va <strong>heshteglar</strong> orqali
          tartiblash mumkin:
        </p>
        <FeatureList
          items={[
            {
              title: "Bo'limlar",
              text: "Bosh sahifa tepasidagi dumaloq tugmachalar — masalan, hayot, sevgi, do'stlik kabi mavzular. Bo'limni bosganingizda faqat shu bo'limdagi iqtiboslar qoladi.",
            },
            {
              title: "Heshteglar",
              text: "Har bir iqtibos ostidagi #heshteglar ham xuddi shunday ishlaydi. Ko'p heshteg bo'lsa, \"Barcha heshteglar\" tugmasi orqali to'liq ro'yxat ochiladi.",
            },
            {
              title: "Qidiruv bilan birga",
              text: "Qidiruv so'zi, bo'lim va heshteg bir vaqtning o'zida ishlatilishi mumkin — natijalar barcha shartlarga mos iqtiboslar bo'ladi.",
            },
          ]}
        />
      </Section>

      <Section number="3" title="Foydalanuvchi imkoniyatlari">
        <FeatureList
          items={[
            {
              title: "Ro'yxatdan o'tish va kirish",
              text: "Email va parol bilan tez ro'yxatdan o'ting, so'ng saytga kiring. Profil sahifasida ism, nickname kabi ma'lumotlaringizni boshqarishingiz mumkin.",
            },
            {
              title: "Email tasdiqlash",
              text: "Ro'yxatdan o'tganingizdan so'ng emailingizga tasdiqlash havolasi keladi. Email tasdiqlanmaguncha iqtibos qo'shish cheklangan bo'ladi.",
            },
            {
              title: "Telegram bot orqali bog'lanish",
              text: "Profil sahifasidagi \"Telegram bilan tasdiqlash\" tugmasi orqali sayt botiga (t.me) o'tasiz va 6 xonali kodni kiritasiz. Shu tariqa hisobingiz Telegram'ga ulanadi — e'lonlar va xabarlar Telegram orqali ham yetkaziladi.",
            },
            {
              title: "Iqtibos qo'shish",
              text: "O'z iqtibosingizni bo'lim va heshteglar bilan yuboring, istasangiz anonim holatda yoki Telegram'dagi post havolasi (https://t.me/kanal/123) bilan. Har bir iqtibos e'lon qilinishidan oldin moderatsiyadan o'tadi.",
            },
            {
              title: "Layk va ko'rishlar",
              text: "Ro'yxatdan o'tgan foydalanuvchilar istalgan iqtibosga layk bosishi mumkin. Har bir iqtibosning ko'rishlar soni avtomatik hisoblanadi va barchaga ko'rinadi.",
            },
            {
              title: "Shaxsiy va ommaviy profil",
              text: "Profil sahifasida o'zingiz yuborgan iqtiboslar va ularning holati (kutilmoqda / tasdiqlangan / rad etilgan) ko'rinadi. Har bir foydalanuvchining ommaviy sahifasi ham mavjud bo'lib, u orqali boshqalarga o'z iqtiboslaringizni ko'rsatishingiz mumkin.",
            },
            {
              title: "Boshqaruv paneli (adminlar uchun)",
              text: "Admin huquqiga ega foydalanuvchilar uchun to'liq boshqaruv paneli mavjud: iqtiboslar moderatsiyasi, foydalanuvchilar, bo'limlar, heshteglar, e'lonlar, shikoyatlar, sozlamalar, SEO, faollik jurnali, zaxira nusxalar va qora ro'yxat.",
            },
          ]}
        />
      </Section>

      <Section number="4" title="Qo'shimcha sahifalar va qoidalar">
        <p>Sayt bo&apos;ylab navigatsiya va huquqiy hujjatlar:</p>
        <ul className="space-y-2">
          <li>
            <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">
              Bosh sahifa — iqtiboslar lentasi
            </Link>
          </li>
          <li>
            <Link href="/profile" className="text-blue-600 hover:underline dark:text-blue-400">
              Profil — shaxsiy kabinet
            </Link>
          </li>
          <li>
            <Link href="/privacy" className="text-blue-600 hover:underline dark:text-blue-400">
              Maxfiylik siyosati — shaxsiy ma&apos;lumotlar bilan ishlash tartibi
            </Link>
          </li>
          <li>
            <Link href="/terms" className="text-blue-600 hover:underline dark:text-blue-400">
              Foydalanish shartlari — saytdan foydalanish qoidalari
            </Link>
          </li>
          <li>
            <Link href="/cookies" className="text-blue-600 hover:underline dark:text-blue-400">
              Cookie fayllari — cookie va statistika haqida ma&apos;lumot
            </Link>
          </li>
        </ul>
        <p className="pt-2 text-sm">
          Fikr, shikoyat yoki takliflaringiz bo&apos;lsa, sayt adminlari bilan bog&apos;lanishingiz mumkin.
          Barcha iqtiboslar moderatorlar tomonidan tekshiriladi.
        </p>
      </Section>
    </div>
  );
}
