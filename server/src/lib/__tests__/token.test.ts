import { describe, expect, it } from "vitest";
import { signToken, tokenFromHeader, verifyToken } from "../token.js";

describe("token", () => {
  it("signs and verifies a token with the original payload", async () => {
    const token = await signToken({ sub: "u1", username: "ali", role: "ADMIN" });
    expect(token.split(".")).toHaveLength(3);
    const payload = await verifyToken(token);
    expect(payload).toEqual({ sub: "u1", username: "ali", role: "ADMIN" });
  });

  it("rejects a tampered token", async () => {
    const token = await signToken({ sub: "u1", username: "ali", role: "USER" });
    const [h, p, s] = token.split(".");
    const tampered = `${h}.${p}.${s.slice(0, -1)}x`;
    expect(await verifyToken(tampered)).toBeNull();
  });

  it("rejects garbage input", async () => {
    expect(await verifyToken("not-a-jwt")).toBeNull();
  });

  it("extracts a bearer token from an Authorization header", () => {
    expect(tokenFromHeader("Bearer abc.def")).toBe("abc.def");
    expect(tokenFromHeader("abc.def")).toBe("abc.def");
    expect(tokenFromHeader(undefined)).toBe("");
    expect(tokenFromHeader("Bearer  ")).toBe("");
  });
});
