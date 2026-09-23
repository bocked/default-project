import { PolicyType } from "@prisma/client";
import { prisma } from "./prisma.js";

/**
 * DB-backed legal policies (Terms / Privacy / Cookies).
 *
 * The live content lives in `SitePolicy` rows and is versioned. A SUPER_ADMIN
 * edits a draft (isApproved=false) and approves it; approval publishes the new
 * version and bumps the public `policies.<type>.version` SiteSetting. Auth
 * compares each user's acceptedTermsVersion against that published version, so
 * approving a new TERMS document forces a re-consent on next login.
 *
 * The templates below are the product baseline ("1.1"). When the baseline is
 * bumped in a future deploy, `ensurePolicyDrafts()` creates an open draft so
 * the super admin can review and approve the new copy.
 */

export const POLICY_SETTING_PREFIX = "policies";

export const POLICY_TYPES: PolicyType[] = [PolicyType.TERMS, PolicyType.PRIVACY, PolicyType.COOKIES];

/** Baseline published version shipped in the code (mirrors config env). */
export const POLICY_TEMPLATE_VERSION = "1.1";

/** Default template copy for each policy type (plain text). */
export const POLICY_TEMPLATES: Record<PolicyType, string> = {
  [PolicyType.TERMS]: `## 1. Umumiy qoidalar

Iqtibosim saytidan foydalangan holda, siz quyidagi shartlarga rozilik bildirasiz. Agar shartlardan biror biriga rozilmasangiz, saytdan foydalanishni to'xtating.

Sayt hozircha test rejimi (Beta)da ishlayapti. Xatoliklar, buzilishlar yoki ma'lumotlar yo'qolishi yuzaga kelishi mumkin. Admin tomoni bu haqda mas'uliyat qabul qilmaydi.

## 2. Foydalanuvchi hisob raqami

- Hisob yaratish uchun email va parol talab etiladi.
- Email tasdiqlanmaguncha iqtibos qo'shish cheklangan.
- Parol xavfsizligi sizning mas'uliyatingizda — uchinchilarga bermang.
- Bitta shaxs bir nechta hisob yaratishi taqiqlanmaydi, lekin spam qilish mumkin emas.

## 3. Kontent qoidalari

- Iqtiboslar o'zingizga tegishli bo'lishi yoki mualliflik huquqi buzilmaydigan bo'lishi kerak.
- Qoidabuzuvchi, so'kindi, ekstremist, pornografik yoki qonunga zid kontent taqiqlanadi.
- Spam, reklama va havola tarqatish maqsadida iqtibos yuborish taqiqlanadi.
- Barcha iqtiboslar moderatsiyadan o'tadi. Adminlar iqtibosni rad etish, tahrirlash yoki o'chirish huquqiga ega.

## 4. Foydalanuvchi mas'uliyati

- Siz yuborgan iqtiboslar uchun to'liq mas'uliyatni o'z zimmangizga olasiz.
- Boshqalarning huquqlarini buzganingizda yuridik natijalarga tortilishingiz mumkin.
- Sayt xavfsizligini buzishga harakat qilish (xakerlik, DDoS, SQL injection va boshqalar) taqiqlanadi.

## 5. Admin huquqlari

- Adminlar iqtiboslarni tasdiqlash, rad etish, tahrirlash, arxivga yuborish va tiklash huquqiga ega.
- Foydalanuvchilarni bloklash, arxivga yuborish yoki rolini o'zgartirish mumkin.
- Admin harakati audit logga yoziladi va ko'rib chiqish uchun saqlanadi.

## 6. Test rejimi va mas'uliyat cheklovi

Sayt "shunday qilib" (as is) va "mavjud bo'lgan holatda" (as available) taqdim etiladi. Hech qanday kafolat berilmaydi:

- Sayt doimiy ishlashini va xatoliksizligini.
- Ma'lumotlar yo'qolmasligi yoki buzilmaganligini.
- Uchinchi tomon xizmatlari (Telegram, Brevo, Render, Cloudflare) to'g'ri ishlashini.

Admin tomoni saytda yuzaga kelgan har qanday zarar (to'g'ridan-to'g'ri, poyga, tasodifiy) uchun mas'uliyat qabul qilmaydi.

## 7. Shartlarning o'zgartirilishi

Shartlar ogohlantirishsiz o'zgartirilishi mumkin. Yangilanishlar bu sahifada nashr etiladi. Foydalanishni davom ettirish — yangi shartlarga rozilik bildirishdir. Shartlar yangilanganda tizimga kirganingizda yangi shartlarga qayta rozilik so'raladi.

## 8. Aloqa

Shartlar bo'yicha savollar: mirabbostolqinjonov@gmail.com`,
  [PolicyType.PRIVACY]: `## 1. Yig'iluvchi ma'lumotlar

Saytimizda ro'yxatdan o'tganda va foydalanayotganda quyidagi ma'lumotlar yig'ilishi mumkin:

- Email manzili — hisob yaratish, email tasdiqlash va xabarlar yuborish uchun.
- Parol — xesh qilingan holda saqlanadi, hech kim (adminlar ham) ko'ra olmaydi.
- Ism va nik — profilga qo'shish va iqtiboslarga mualliflik sifatida ko'rsatish uchun.
- Telegram ID va telefon raqami — Telegram orqali tasdiqlash va bildirishnomalar uchun. Bu ma'lumotlar faqat adminlarga ko'rinadi.
- IP manzili va brauzer ma'lumotlari — xavfsizlik, cheklov va statistika uchun.

## 2. Ma'lumotlarni ishlatish maqsadlari

- Hisob yaratish, kirish va xavfsizlikni ta'minlash.
- Email tasdiqlash va parolni tiklash xabarlarini yuborish.
- Iqtiboslar qo'shish, tahrirlash va moderatsiya qilish.
- Telegram orqali tasdiqlash va bildirishnomalar.
- Sayt xavfsizligini ta'minlash, spam va buzilishlarga qarshi kurash.

## 3. Ma'lumotlarni ulashish

- Adminlar — moderatsiya, xavfsizlik va foydalanuvchi boshqaruvi uchun (to'liq ko'rinish).
- Boshqa foydalanuvchilar — faqat nik (profil sahifasida va iqtiboslarda ko'rinadi). Ism, email, telefon va Telegram ID ko'rinmaydi.
- Uchinchi tomonlarga — faqat qonun talab etilganda yoki xavfsizlik uchun zarur bo'lsa.

## 4. Cookie va texnologiyalar

Sayt autentifikatsiya, xavfsizlik va afzallik uchun cookie va localStorage dan foydalanadi. Batafsil ma'lumot Cookie fayllari qoidalari sahifasida.

## 5. Ma'lumotlarni saqlash muddati

- Hisob ma'lumotlari — hisob o'chirilmaguncha saqlanadi.
- Iqtiboslar — foydalanuvchi o'chirmasa ham, arxivda saqlanadi.
- Log va xavfsizlik ma'lumotlari — 90 kun davomida saqlanadi.

## 6. Foydalanuvchi huquqlari

- Shaxsiy ma'lumotlaringizni ko'rish, tahrirlash va o'chirish huquqi.
- Ma'lumotlaringizni yuklab olish (data portability).
- Cookie va kuzatuvdan chetlash (brauzer sozlamalaridan).

## 7. Aloqa

Maxfiylik siyosati bo'yicha savollar uchun: mirabbostolqinjonov@gmail.com`,
  [PolicyType.COOKIES]: `## 1. Cookie nima?

Cookie — bu sizning qurilmangizga (kompyuter, telefon, planshet) sayt tashrif buyurganda saqlanadigan kichik matnli fayllardir. Ular saytga sizni eslab qolish, sessiyani saqlash va afzalliklarni ta'minlash imkonini beradi.

## 2. Qanday saqlash texnologiyalaridan foydalanamiz

- Authentication (autentifikatsiya): JWT token localStorage da saqlanib, saytga qaytganda avtomatik kirishni ta'minlaydi. Token o'zida shaxsiy ma'lumot o'z ichiga olmaydi.
- Theme (mavzu): Tanlangan mavzu (light/dark) localStorage da saqlanib, keyingi tashriflarda avtomatik qo'llaniladi.
- Test mode banner dismiss: Test rejimi bannerini yopganingizda, tanlovingiz localStorage da saqlanib, keyingi tashriflarda banner ko'rinmaydi.
- Cookie consent (rozilik): Cookie bannerini qabul qilganda, tanlovingiz localStorage da saqlanib, shu qurilmada bir marta so'raladi. Foydalanish shartlari yangilanganida (versiya o'zgarganda) rozilik qayta so'raladi.

## 3. Uchinchi tomon cookie fayllari

Sayt rasmiy WWW.UZ statistikasi (www.uz hisoblagichi) dan foydalanadi. U faqat cookie roziligini berganingizdan so'ng ishga tushadi, smart_top cookie faylini o'rnatadi va www.uz serveriga anonim statistik ma'lumot yuboradi. Rozilik bermasangiz, hisoblagich ishga tushmaydi.

Google Analytics yoki reklama tarmoqlari kabi boshqa uchinchi tomon kuzatuv tizimlari ishlatilmaydi. Kelajakda shunday xizmatlar qo'shilganda, bu bo'lim yangilanadi va sizdan alohida rozilik so'raladi.

## 4. Cookie fayllarini boshqarish

Siz brauzer sozlamalaridan cookie fayllarini boshqarishingiz mumkin:

- Barcha cookie fayllarini o'chirish (brauzer sozlamalaridan).
- Cookie qabul qilishni cheklash yoki butunlay o'chirish.
- Saytdagi cookie roziligini bekor qilish (localStorage dan cookieConsent kalitini o'chirish).

Eslatma: Authentication cookie o'chirilganda, siz saytdan chiqib ketasiz va qayta kirish kerak bo'ladi.

## 5. Saqlash muddati

- Authentication token — 30 kun (so'ng avtomatik yangilanadi).
- Theme va cookie consent — cheksiz (siz o'chirmaguncha).

## 6. Aloqa

Cookie qoidalari bo'yicha savollar: mirabbostolqinjonov@gmail.com`,
};

/** Reads the published version for a policy type from SiteSetting. Falls back
 *  to the shipped baseline so consent checks keep working even before the
 *  first seeding (dev / test databases). */
export async function publishedPolicyVersion(type: PolicyType): Promise<string> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: settingKey(type) } });
    const value = row?.value?.trim();
    return value && value.length > 0 ? value : POLICY_TEMPLATE_VERSION;
  } catch {
    return POLICY_TEMPLATE_VERSION;
  }
}

/** The terms version every user must have accepted. """
 *  @deprecated typo guard kept for callers; use getCurrentTermsVersion() */
export function getCurrentTermsVersion(): Promise<string> {
  return publishedPolicyVersion(PolicyType.TERMS);
}

export function settingKey(type: PolicyType): string {
  return `${POLICY_SETTING_PREFIX}.${type.toLowerCase()}Version`;
}

/** Parses "M.m" into [major, minor]; falls back to [1,0]. */
function splitVersion(version: string): [number, number] {
  const match = /^(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return [1, 0];
  return [Number(match[1]), Number(match[2])];
}

export function formatVersion(major: number, minor: number): string {
  return `${major}.${minor}`;
}

/** Next version after `version`. "1.9" -> "2.0", "1.1" -> "1.2". */
export function nextVersion(version: string): string {
  const [major, minor] = splitVersion(version);
  if (minor >= 9) return formatVersion(major + 1, 0);
  return formatVersion(major, minor + 1);
}

/** Picks the next version for `type` that is not yet used by any row, so
 *  drafts never collide with the unique (type, version) index. */
export async function nextFreeVersion(type: PolicyType): Promise<string> {
  const used = await prisma.sitePolicy.findMany({ where: { type }, select: { version: true } });
  const usedSet = new Set(used.map((r) => r.version));
  let candidate = nextVersion(await publishedPolicyVersion(type));
  let guard = 0;
  while (usedSet.has(candidate) && guard < 50) {
    candidate = nextVersion(candidate);
    guard += 1;
  }
  return candidate;
}

export interface PolicyContent {
  type: PolicyType;
  version: string;
  content: string;
  changeSummary: string | null;
  publishedAt: Date | null;
}

/** Latest APPROVED policy for `type`, or undefined when none is published yet. */
export async function approvedPolicy(type: PolicyType): Promise<PolicyContent | null> {
  const row = await prisma.sitePolicy.findFirst({
    where: { type, isApproved: true },
    orderBy: { publishedAt: "desc" },
    take: 1,
  });
  if (!row) return null;
  return {
    type: row.type,
    version: row.version,
    content: row.content,
    changeSummary: row.changeSummary,
    publishedAt: row.publishedAt,
  };
}

/** Content shown on public pages & modals: the approved document when it
 *  exists, otherwise the baseline template (so pages are never blank). */
export async function publicPolicy(type: PolicyType): Promise<PolicyContent> {
  const approved = await approvedPolicy(type);
  if (approved) return approved;
  return {
    type,
    version: POLICY_TEMPLATE_VERSION,
    content: POLICY_TEMPLATES[type],
    changeSummary: null,
    publishedAt: null,
  };
}

/** Latest open draft for a type, if any. */
export async function openDraft(type: PolicyType) {
  return prisma.sitePolicy.findFirst({
    where: { type, isApproved: false },
    orderBy: { updatedAt: "desc" },
    take: 1,
  });
}

/** Publishes a draft: marks it approved, retires other drafts of the type,
 *  records publishedAt and bumps the public version. */
export async function approvePolicy(policyId: string, actor: { id: string | null; email: string | null }): Promise<void> {
  const draft = await prisma.sitePolicy.findUnique({ where: { id: policyId } });
  if (!draft) throw new Error("Policy not found");
  await prisma.$transaction([
    prisma.sitePolicy.updateMany({
      where: { type: draft.type, isApproved: false },
      data: { isApproved: false },
    }),
    prisma.sitePolicy.update({
      where: { id: draft.id },
      data: {
        isApproved: true,
        publishedAt: new Date(),
        changeReason: draft.changeReason ?? (actor.email ?? "Super admin"),
      },
    }),
    prisma.siteSetting.upsert({
      where: { key: settingKey(draft.type) },
      update: { value: draft.version, label: `${draft.type} version`, group: "policy" },
      create: { key: settingKey(draft.type), value: draft.version, label: `${draft.type} version`, group: "policy" },
    }),
  ]);
}

/** Idempotent startup seeding: publishes the baseline for every type exactly
 *  once (only when the type has no approved document yet). */
export async function tryEnsurePolicyBaseline(): Promise<void> {
  try {
    for (const type of POLICY_TYPES) {
      const existing = await prisma.sitePolicy.findFirst({ where: { type, isApproved: true } });
      if (existing) continue;
      const already = await prisma.sitePolicy.count({ where: { type } });
      await prisma.sitePolicy.create({
        data: {
          type,
          version: already === 0 ? POLICY_TEMPLATE_VERSION : await nextFreeVersion(type),
          content: POLICY_TEMPLATES[type],
          isApproved: true,
          changeSummary: "Dastlabki nashr",
          publishedAt: new Date(),
        },
      });
      await prisma.siteSetting.upsert({
        where: { key: settingKey(type) },
        update: { value: POLICY_TEMPLATE_VERSION },
        create: { key: settingKey(type), value: POLICY_TEMPLATE_VERSION, label: `${type} version`, group: "policy" },
      });
    }
  } catch {
    /* non-fatal: consent falls back to config */
  }
}

/** Creates an open draft for a type when the code template is newer than the
 *  published version — that tells the super admin "a review is pending". */
export async function tryEnsurePolicyDrafts(): Promise<void> {
  try {
    for (const type of POLICY_TYPES) {
      const published = await publishedPolicyVersion(type);
      if (published === POLICY_TEMPLATE_VERSION) continue;
      const existing = await prisma.sitePolicy.findFirst({ where: { type, isApproved: false } });
      if (existing) continue;
      await prisma.sitePolicy.create({
        data: {
          type,
          version: await nextFreeVersion(type),
          content: POLICY_TEMPLATES[type],
          isApproved: false,
          changeSummary: "Shablon yangilandi — ko'rib chiqish kutilmoqda",
        },
      });
    }
  } catch {
    /* non-fatal */
  }
}

export const POLICY_LABELS: Record<PolicyType, string> = {
  [PolicyType.TERMS]: "Foydalanish shartlari",
  [PolicyType.PRIVACY]: "Maxfiylik siyosati",
  [PolicyType.COOKIES]: "Cookie qoidalari",
};