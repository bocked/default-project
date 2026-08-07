import { describe, expect, it } from "vitest";
import { password } from "../password.js";

describe("password", () => {
  it("hashes and verifies the correct password", async () => {
    const hash = await password.hash("s3cret-password");
    expect(hash).not.toBe("s3cret-password");
    expect(await password.verify(hash, "s3cret-password")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await password.hash("s3cret-password");
    expect(await password.verify(hash, "wrong-password")).toBe(false);
  });

  it("verifies against garbage returns false instead of throwing", async () => {
    expect(await password.verify("not-a-hash", "x")).toBe(false);
  });
});
