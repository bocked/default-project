"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import type { Locale } from "./types";

const STORAGE_KEY = "iqtibosim_locale";

export type TranslationKey =
  | "nav.home"
  | "nav.about"
  | "nav.tests"
  | "nav.profile"
  | "nav.admin"
  | "nav.login"
  | "nav.logout"
  | "nav.search"
  | "nav.filters"
  | "nav.language"
  | "common.loading"
  | "common.error"
  | "hero.title"
  | "hero.subtitle"
  | "share.button"
  | "share.image"
  | "share.text"
  | "share.telegram"
  | "share.whatsapp"
  | "share.copyLink"
  | "share.addToCollection"
  | "share.newCollection"
  | "collection.myCollections"
  | "collection.title"
  | "collection.description"
  | "collection.private"
  | "collection.create"
  | "collection.delete"
  | "collection.save"
  | "collection.open"
  | "collection.currentlyEmpty"
  | "collection.added"
  | "collection.removed"
  | "collection.created"
  | "collection.deleted"
  | "collection.titlePlaceholder"
  | "collection.public"
  | "collection.close"
  | "collection.noQuotesIn"
  | "tts.play"
  | "tts.stop";

const DICT: Record<Locale, Record<TranslationKey, string>> = {
  UZ: {
    "nav.home": "Bosh sahifa",
    "nav.about": "Sayt haqida",
    "nav.tests": "Testlar",
    "nav.profile": "Profil",
    "nav.admin": "Admin",
    "nav.login": "Kirish",
    "nav.logout": "Chiqish",
    "nav.search": "Qidiruv",
    "nav.filters": "Filtrlar",
    "nav.language": "Til",
    "common.loading": "Yuklanmoqda...",
    "common.error": "Xatolik yuz berdi",
    "hero.title": "Iqtibosim",
    "hero.subtitle": "Dono fikrlarni o'qing va o'zingiznikini qo'shing. Har bir iqtibos moderatsiyadan o'tadi.",
    "share.button": "Ulashish",
    "share.image": "Rasm sifatida ulashish",
    "share.text": "Matn sifatida ulashish",
    "share.telegram": "Telegram orqali",
    "share.whatsapp": "WhatsApp orqali",
    "share.copyLink": "Havolani nusxalash",
    "share.addToCollection": "To'plamga qo'shish",
    "share.newCollection": "Yangi to'plam",
    "collection.myCollections": "Kolleksiyalarim",
    "collection.title": "To'plam nomi",
    "collection.description": "Tavsif (ixtiyoriy)",
    "collection.private": "Maxfiy (faqat siz ko'rasiz)",
    "collection.create": "Yaratish",
    "collection.delete": "O'chirish",
    "collection.save": "Saqlash",
    "collection.open": "Ochish",
    "collection.currentlyEmpty": "Hali to'plamlar yo'q. Birinchi to'plamingizni yarating.",
    "collection.added": "To'plamga qo'shildi",
    "collection.removed": "To'plamdan olib tashlandi",
    "collection.created": "To'plam yaratildi",
    "collection.deleted": "To'plam o'chirildi",
    "collection.titlePlaceholder": "To'plam nomi...",
    "collection.public": "Ommaviy",
    "collection.close": "Yopish",
    "collection.noQuotesIn": "Bu to'plamda hali iqtiboslar yo'q",
    "tts.play": "Eshitish",
    "tts.stop": "To'xtatish",
  },
  RU: {
    "nav.home": "Главная",
    "nav.about": "О сайте",
    "nav.tests": "Тесты",
    "nav.profile": "Профиль",
    "nav.admin": "Админ",
    "nav.login": "Войти",
    "nav.logout": "Выход",
    "nav.search": "Поиск",
    "nav.filters": "Фильтры",
    "nav.language": "Язык",
    "common.loading": "Загрузка...",
    "common.error": "Произошла ошибка",
    "hero.title": "Цитаты",
    "hero.subtitle": "Читайте мудрые мысли и добавляйте свои. Каждая цитата проходит модерацию.",
    "share.button": "Поделиться",
    "share.image": "Поделиться картинкой",
    "share.text": "Поделиться текстом",
    "share.telegram": "через Telegram",
    "share.whatsapp": "через WhatsApp",
    "share.copyLink": "Копировать ссылку",
    "share.addToCollection": "Добавить в коллекцию",
    "share.newCollection": "Новая коллекция",
    "collection.myCollections": "Мои коллекции",
    "collection.title": "Название коллекции",
    "collection.description": "Описание (необязательно)",
    "collection.private": "Приватная (видите только вы)",
    "collection.create": "Создать",
    "collection.delete": "Удалить",
    "collection.save": "Сохранить",
    "collection.open": "Открыть",
    "collection.currentlyEmpty": "Коллекций пока нет. Создайте первую.",
    "collection.added": "Добавлено в коллекцию",
    "collection.removed": "Удалено из коллекции",
    "collection.created": "Коллекция создана",
    "collection.deleted": "Коллекция удалена",
    "collection.titlePlaceholder": "Название коллекции...",
    "collection.public": "Публичная",
    "collection.close": "Закрыть",
    "collection.noQuotesIn": "В этой коллекции пока нет цитат",
    "tts.play": "Слушать",
    "tts.stop": "Стоп",
  },
  EN: {
    "nav.home": "Home",
    "nav.about": "About",
    "nav.tests": "Tests",
    "nav.profile": "Profile",
    "nav.admin": "Admin",
    "nav.login": "Login",
    "nav.logout": "Logout",
    "nav.search": "Search",
    "nav.filters": "Filters",
    "nav.language": "Language",
    "common.loading": "Loading...",
    "common.error": "Something went wrong",
    "hero.title": "Quotes",
    "hero.subtitle": "Read wise words and add your own. Every quote is moderated before publishing.",
    "share.button": "Share",
    "share.image": "Share as image",
    "share.text": "Share as text",
    "share.telegram": "via Telegram",
    "share.whatsapp": "via WhatsApp",
    "share.copyLink": "Copy link",
    "share.addToCollection": "Add to collection",
    "share.newCollection": "New collection",
    "collection.myCollections": "My collections",
    "collection.title": "Collection name",
    "collection.description": "Description (optional)",
    "collection.private": "Private (only you can see it)",
    "collection.create": "Create",
    "collection.delete": "Delete",
    "collection.save": "Save",
    "collection.open": "Open",
    "collection.currentlyEmpty": "No collections yet. Create your first one.",
    "collection.added": "Added to collection",
    "collection.removed": "Removed from collection",
    "collection.created": "Collection created",
    "collection.deleted": "Collection deleted",
    "collection.titlePlaceholder": "Collection title...",
    "collection.public": "Public",
    "collection.close": "Close",
    "collection.noQuotesIn": "No quotes in this collection yet",
    "tts.play": "Listen",
    "tts.stop": "Stop",
  },
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function storedLocale(): Locale {
  if (typeof window === "undefined") return "UZ";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "RU" || raw === "EN" ? raw : "UZ";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { user, refresh } = useAuth();
  // Manual selection made in this session (overrides the persisted choice until
  // the authenticated user's saved locale is known; the server value wins on login).
  const [manualLocale, setManualLocale] = useState<Locale | null>(null);

  const locale: Locale = user?.locale ?? manualLocale ?? storedLocale();

  const setLocale = useCallback(
    (next: Locale) => {
      setManualLocale(next);
      window.localStorage.setItem(STORAGE_KEY, next);
      // Persist on the account when available; the server validates the value.
      if (user) {
        void api<{ user: { locale: Locale } }>("/api/auth/me", {
          method: "PATCH",
          body: { locale: next.toLowerCase() },
        })
          .then(() => refresh())
          .catch(() => {});
      }
    },
    [user, refresh]
  );

  const t = useCallback(
    (key: TranslationKey): string => DICT[locale][key] ?? DICT.UZ[key] ?? key,
    [locale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}