import { describe, it, expect } from "vitest";
import { isSafeBannerUrl, safeBannerUrl } from "../bannerUrl";

describe("safeBannerUrl", () => {
  it("allows ordinary banner targets", () => {
    expect(safeBannerUrl("https://ok.uz/x")).toBe("https://ok.uz/x");
    expect(safeBannerUrl("http://ok.uz")).toBe("http://ok.uz");
    expect(safeBannerUrl("/uploads/banner.png")).toBe("/uploads/banner.png");
    expect(safeBannerUrl("#anchor")).toBe("#anchor");
    expect(safeBannerUrl("mailto:a@b.uz")).toBe("mailto:a@b.uz");
    expect(safeBannerUrl("tel:+998901234567")).toBe("tel:+998901234567");
    expect(safeBannerUrl("  https://ok.uz  ")).toBe("https://ok.uz");
  });

  it("blocks script-capable and unknown schemes", () => {
    expect(safeBannerUrl("javascript:alert(1)")).toBe("");
    expect(safeBannerUrl("JavaScript:alert(1)")).toBe("");
    expect(safeBannerUrl(" javascript:alert(1)")).toBe("");
    expect(safeBannerUrl("java\tscript:alert(1)")).toBe("");
    expect(safeBannerUrl("java\nscript:alert(1)")).toBe("");
    expect(safeBannerUrl("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(safeBannerUrl("vbscript:msgbox(1)")).toBe("");
    expect(safeBannerUrl("file:///etc/passwd")).toBe("");
    expect(safeBannerUrl("//evil.com")).toBe("");
  });

  it("treats empty values as absent", () => {
    expect(safeBannerUrl("")).toBe("");
    expect(safeBannerUrl(undefined)).toBe("");
    expect(safeBannerUrl(null)).toBe("");
    expect(isSafeBannerUrl(undefined)).toBe(false);
  });
});