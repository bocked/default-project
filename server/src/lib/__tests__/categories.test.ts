import { describe, expect, it } from "vitest";
import { slugify, normalizeTagName, DEFAULT_CATEGORIES } from "../categories.js";

describe("slugify", () => {
  it("lowercases and strips whitespace/punctuation", () => {
    expect(slugify("  Motivatsiya  ")).toBe("motivatsiya");
    expect(slugify("Do'stlik!")).toBe("dostlik");
  });

  it("strips a leading hashtag", () => {
    expect(slugify("#Hayot")).toBe("hayot");
    expect(slugify("##IT##")).toBe("it");
  });

  it("collapses separators to a single dash", () => {
    expect(slugify("X-Ray Vision")).toBe("x-ray-vision");
  });
});

describe("normalizeTagName", () => {
  it("trims and strips the hashtag", () => {
    expect(normalizeTagName("  #Motivatsiya  ")).toBe("Motivatsiya");
  });

  it("keeps the raw case", () => {
    expect(normalizeTagName("Falsafa")).toBe("Falsafa");
  });
});

describe("DEFAULT_CATEGORIES", () => {
  it("has unique slugs and names", () => {
    const slugs = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));
    const names = new Set(DEFAULT_CATEGORIES.map((c) => c.name));
    expect(slugs.size).toBe(DEFAULT_CATEGORIES.length);
    expect(names.size).toBe(DEFAULT_CATEGORIES.length);
  });
});
