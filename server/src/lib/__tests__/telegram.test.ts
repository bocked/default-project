import { describe, expect, it } from "vitest";
import { moderationKeyboard, moderationText } from "../telegram.js";

describe("moderationKeyboard", () => {
  it("attaches approve and reject buttons with the quote id", () => {
    const kb = moderationKeyboard("quote-1");
    expect(kb.inline_keyboard).toHaveLength(1);
    const row = kb.inline_keyboard[0];
    expect(row.map((b) => b.callback_data)).toEqual(["approve:quote-1", "reject:quote-1"]);
    expect(row.map((b) => b.text)).toEqual(["✅ Ruxsat berish", "❌ Rad etish"]);
  });
});

describe("moderationText", () => {
  const base = {
    quote: { text: "Bilim — kuchdir.", displayAuthor: "Anonim", anonymous: true } as any,
    author: { email: "jon@example.com", name: "Jon Doe", nickname: "johndoe" } as any,
    category: { name: "Motivatsiya" } as any,
    tags: [{ name: "Bilim" }, { name: "Falsafa" }] as any,
  };

  it("includes the quote, public author and category", () => {
    const text = moderationText(base);
    expect(text).toContain("Bilim — kuchdir.");
    expect(text).toContain("Anonim");
    expect(text).toContain("Motivatsiya");
    expect(text).toContain("#Bilim #Falsafa");
  });

  it("always shows the real owner to the admin", () => {
    const text = moderationText(base);
    expect(text).toContain("jon@example.com");
    expect(text).toContain("Jon Doe");
  });

  it("renders a tagless quote without crashing", () => {
    const text = moderationText({ ...base, tags: [] });
    expect(text).toContain("Heshteglar: —");
  });
});
