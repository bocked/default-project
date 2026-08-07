import { describe, expect, it } from "vitest";
import {
  parseZod,
  itemCreateSchema,
  itemMoveSchema,
  itemReactionSchema,
  adminAuthSchema,
  adminBanSchema,
} from "../../schemas.js";

describe("schemas", () => {
  describe("itemCreateSchema", () => {
    const valid = { type: "TEXT", content: "salom", x: 10, y: -5.5, color: "#ff0000" };

    it("accepts a valid payload", () => {
      expect(parseZod(itemCreateSchema, valid)).toEqual(valid);
    });

    it("rejects unknown types", () => {
      expect(parseZod(itemCreateSchema, { ...valid, type: "VIDEO" })).toBeNull();
    });

    it("rejects empty content", () => {
      expect(parseZod(itemCreateSchema, { ...valid, content: "" })).toBeNull();
    });

    it("rejects content over the max length", () => {
      expect(parseZod(itemCreateSchema, { ...valid, content: "a".repeat(4001) })).toBeNull();
    });

    it("rejects non-finite coordinates", () => {
      expect(parseZod(itemCreateSchema, { ...valid, x: Infinity })).toBeNull();
      expect(parseZod(itemCreateSchema, { ...valid, x: "10" })).toBeNull();
    });

    it("rejects color over 32 chars", () => {
      expect(parseZod(itemCreateSchema, { ...valid, color: "#" + "a".repeat(40) })).toBeNull();
    });

    it("rejects non-object input", () => {
      expect(parseZod(itemCreateSchema, undefined)).toBeNull();
      expect(parseZod(itemCreateSchema, "nope")).toBeNull();
    });
  });

  it("itemMoveSchema requires a string id and finite coords", () => {
    expect(parseZod(itemMoveSchema, { id: "abc", x: 1, y: 2 })).toEqual({ id: "abc", x: 1, y: 2 });
    expect(parseZod(itemMoveSchema, { id: 123, x: 1, y: 2 })).toBeNull();
    expect(parseZod(itemMoveSchema, { id: "abc", x: NaN, y: 2 })).toBeNull();
  });

  it("itemReactionSchema bounds emoji length", () => {
    expect(parseZod(itemReactionSchema, { id: "abc", emoji: "👍" })).toEqual({ id: "abc", emoji: "👍" });
    expect(parseZod(itemReactionSchema, { id: "abc", emoji: "" })).toBeNull();
    expect(parseZod(itemReactionSchema, { id: "abc", emoji: "x".repeat(9) })).toBeNull();
  });

  it("adminAuthSchema requires a password", () => {
    expect(parseZod(adminAuthSchema, { password: "secret" })).toEqual({ password: "secret" });
    expect(parseZod(adminAuthSchema, { password: "" })).toBeNull();
  });

  it("adminBanSchema requires a non-empty ipAddress", () => {
    expect(parseZod(adminBanSchema, { ipAddress: "1.2.3.4", reason: "spam" })).toEqual({
      ipAddress: "1.2.3.4",
      reason: "spam",
    });
    expect(parseZod(adminBanSchema, { ipAddress: "  " })).toBeNull();
    expect(parseZod(adminBanSchema, {})).toBeNull();
  });
});
