import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password.js";

describe("password", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("s3cret-pass");
    expect(hash).not.toBe("s3cret-pass");
    await expect(verifyPassword("s3cret-pass", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct");
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });

  it("produces a different hash per call", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
  });
});
