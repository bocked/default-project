import { describe, expect, it } from "vitest";
import { buildUserApprovedEmail, sendUserApprovedEmail, emailTranscript } from "../email.js";

describe("buildUserApprovedEmail", () => {
  it("matches the exact approval subject from the spec", () => {
    const { subject } = buildUserApprovedEmail("Ali");
    expect(subject).toBe("Akkountingiz muvaffaqiyatli tasdiqlandi! 🎉");
  });

  it("contains the required greeting and approval notice in the plain text", () => {
    const { text } = buildUserApprovedEmail("Ali");
    expect(text).toContain("Xush kelibsiz!");
    expect(text).toContain("akkountingiz Super Admin tomonidan tasdiqlandi");
    expect(text).toContain("iqtiboslar joylashingiz va barcha imkoniyatlardan foydalanishingiz mumkin");
    expect(text).toContain("Ali");
  });

  it("keeps the approval wording in the HTML payload too", () => {
    const { html } = buildUserApprovedEmail("Ali");
    expect(html).toContain("akkountingiz muvaffaqiyatli tasdiqlandi!");
    expect(html).toContain("🎉");
    expect(html).toContain("Super Admin tomonidan tasdiqlandi");
    expect(html).toContain("Ali");
  });

  it("falls back to a neutral greeting for blank display names", () => {
    expect(buildUserApprovedEmail("").text).toContain("foydalanuvchi");
    expect(buildUserApprovedEmail("   ").text).toContain("foydalanuvchi");
  });

  it("uses only the first word of the display name", () => {
    const { text } = buildUserApprovedEmail("Ali Valiyev");
    expect(text).toContain("Ali");
    expect(text).not.toContain("Ali Valiyev");
  });
});

describe("sendUserApprovedEmail", () => {
  it("writes a USER_APPROVED email into the offline transcript", async () => {
    emailTranscript.length = 0;
    const result = await sendUserApprovedEmail("ali@example.com", "Ali Valiyev");
    expect(result.ok).toBe(true);

    const record = emailTranscript.find((r) => r.to === "ali@example.com");
    expect(record).toBeTruthy();
    expect(record!.type).toBe("USER_APPROVED");
    expect(record!.subject).toBe("Akkountingiz muvaffaqiyatli tasdiqlandi! 🎉");
    expect(record!.text).toContain("Xush kelibsiz!");
  });
});