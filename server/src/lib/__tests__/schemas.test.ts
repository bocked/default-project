import { describe, expect, it } from "vitest";
import { parseZod, adminAuthSchema, adminBanSchema, adminUnbanSchema, banCreateSchema } from "../../schemas.js";

describe("adminAuthSchema", () => {
  it("requires a password", () => {
    expect(parseZod(adminAuthSchema, { password: "secret" })).toEqual({ password: "secret" });
    expect(parseZod(adminAuthSchema, { password: "" })).toBeNull();
    expect(parseZod(adminAuthSchema, {})).toBeNull();
  });

  it("rejects non-object input", () => {
    expect(parseZod(adminAuthSchema, undefined)).toBeNull();
    expect(parseZod(adminAuthSchema, "nope")).toBeNull();
  });
});

describe("adminBanSchema", () => {
  it("accepts a valid ban payload and trims the ip", () => {
    expect(parseZod(adminBanSchema, { ipAddress: " 1.2.3.4 ", reason: "spam" })).toEqual({
      ipAddress: "1.2.3.4",
      reason: "spam",
    });
  });

  it("allows a missing reason", () => {
    expect(parseZod(adminBanSchema, { ipAddress: "1.2.3.4" })).toEqual({ ipAddress: "1.2.3.4" });
  });

  it("rejects an empty/whitespace ipAddress", () => {
    expect(parseZod(adminBanSchema, { ipAddress: "   " })).toBeNull();
    expect(parseZod(adminBanSchema, {})).toBeNull();
  });

  it("rejects a reason over the max length", () => {
    expect(parseZod(adminBanSchema, { ipAddress: "1.2.3.4", reason: "x".repeat(501) })).toBeNull();
  });
});

describe("adminUnbanSchema", () => {
  it("accepts a valid ip and trims it", () => {
    expect(parseZod(adminUnbanSchema, { ipAddress: " 9.9.9.9 " })).toEqual({ ipAddress: "9.9.9.9" });
  });

  it("rejects an empty ipAddress", () => {
    expect(parseZod(adminUnbanSchema, { ipAddress: "" })).toBeNull();
  });
});

describe("banCreateSchema (HTTP body)", () => {
  it("accepts a valid ban body", () => {
    expect(parseZod(banCreateSchema, { ipAddress: "1.2.3.4", reason: "spam" })).toEqual({
      ipAddress: "1.2.3.4",
      reason: "spam",
    });
  });

  it("rejects a missing ipAddress", () => {
    expect(parseZod(banCreateSchema, { reason: "spam" })).toBeNull();
  });
});
