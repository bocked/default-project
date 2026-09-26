import { describe, expect, it } from "vitest";
import {
  analyzeQuoteTextSync,
  detectLanguage,
  suggestSpelling,
  suggestTags,
} from "../analyze.js";

describe("analyze: detectLanguage", () => {
  it("returns ru for Cyrillic text", () => {
    expect(detectLanguage("Жизнь прекрасна!")).toBe("ru");
    expect(detectLanguage("Учиться никогда не поздно")).toBe("ru");
  });

  it("returns uz for Uzbek Latin text with marker words", () => {
    expect(detectLanguage("Dono so'z — eng go'zal so'z")).toBe("uz");
    expect(detectLanguage("Muvaffaqiyat yo'lida harakat qilish kerak")).toBe("uz");
  });

  it("returns en for English text with stopwords", () => {
    expect(detectLanguage("The only way to do great work is to love what you do")).toBe("en");
    expect(detectLanguage("Knowledge is power")).toBe("en");
  });

  it("detects the Uzbek modifier apostrophe (oʻ/gʻ)", () => {
    expect(detectLanguage("Oʻqish — eng katta boylik")).toBe("uz");
  });
});

describe("analyze: suggestSpelling", () => {
  it("corrects common missing-apostrophe typos", () => {
    const res = suggestSpelling("Birinchi bolib kelgan odam");
    expect(res.some((s) => s.type === "spelling" && s.suggestion === "bo'lib")).toBe(true);
  });

  it("flags repeated words", () => {
    const res = suggestSpelling("Bu bu gap juda oddiy");
    expect(res.some((s) => s.type === "repeated")).toBe(true);
  });

  it("flags double spaces and missing space after punctuation", () => {
    expect(suggestSpelling("Bir-bir ortiqcha  bo'sh joy").some((s) => s.type === "whitespace")).toBe(true);
    expect(suggestSpelling("Hammasi joyida,boshqa gap").some((s) => s.type === "punctuation")).toBe(true);
  });

  it("flags mixed latin/cyrillic", () => {
    const res = suggestSpelling("Dono fikr ва haqiqat");
    expect(res.some((s) => s.type === "alphabet")).toBe(true);
  });

  it("returns no suggestions for clean text", () => {
    expect(suggestSpelling("Dono fikr har bir insonga kerak")).toHaveLength(0);
  });
});

describe("analyze: suggestTags", () => {
  it("suggests a category and tag slugs from keywords", () => {
    const res = suggestTags("Muvaffaqiyat yo'lida harakat qilish kerak", "uz");
    expect(res.categorySlug).toBeTruthy();
    expect(res.tags).toContain("motivatsiya");
    expect(res.tags).toContain("muvaffaqiyat");
  });

  it("returns empty suggestions for unknown text", () => {
    const res = suggestTags("zzzz qqqq wwww", "uz");
    expect(res.tags).toHaveLength(0);
    expect(res.categorySlug).toBeNull();
  });

  it("filters the generic 'hayot' tag when a specific tag exists", () => {
    const res = suggestTags("Hayotda muvaffaqiyat harakat talab qiladi", "uz");
    expect(res.tags).not.toContain("hayot");
    expect(res.tags).toContain("muvaffaqiyat");
  });
});

describe("analyze: analyzeQuoteTextSync", () => {
  it("always reports available and runs offline (no AI)", () => {
    const res = analyzeQuoteTextSync("Muvaffaqiyat yo'lida harakat qilish kerak");
    expect(res.available).toBe(true);
    expect(res.ai).toBe(false);
    expect(res.language).toBe("uz");
    expect(Array.isArray(res.suggestions)).toBe(true);
    expect(Array.isArray(res.tags)).toBe(true);
  });
});