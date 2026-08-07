import { describe, expect, it } from "vitest";
import { clientIp } from "../ip.js";

describe("clientIp", () => {
  it("prefers CF-Connecting-IP", () => {
    expect(
      clientIp({
        "cf-connecting-ip": "1.2.3.4",
        "x-forwarded-for": "5.6.7.8",
      })
    ).toBe("1.2.3.4");
  });

  it("uses the first X-Forwarded-For entry", () => {
    expect(clientIp({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })).toBe("1.2.3.4");
  });

  it("falls back to X-Real-IP", () => {
    expect(clientIp({ "x-real-ip": "9.9.9.9" })).toBe("9.9.9.9");
  });

  it("returns unknown when nothing is present", () => {
    expect(clientIp({})).toBe("unknown");
  });

  it("handles array values", () => {
    expect(clientIp({ "cf-connecting-ip": ["8.8.8.8", "1.1.1.1"] })).toBe("8.8.8.8");
  });
});
