import { describe, it, expect } from "vitest";
import { scrubSecrets, scrubError } from "../redact.js";

// Shape of a real token: `<bot_id>:<35 url-safe chars>`.
const TOKEN = "7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";
const OTHER_TOKEN = "9988776655:BBFdkTQvCH2vGWJxfSeofSAs0K5PALDsax";

// A token appearing the way each real code path actually leaks it.
const IN_PRISMA_MESSAGE =
  `Invalid \`prisma.telegramSettings.upsert()\` invocation:\n\n` +
  `{\n  data: {\n    botToken: "${TOKEN}",\n  }\n}`;
const IN_API_URL = `connect ECONNREFUSED https://api.telegram.org/bot${TOKEN}/getMe`;
const IN_URL_ONLY = `fetch failed for https://api.telegram.org/bot${TOKEN}/setWebhook`;

describe("scrubSecrets", () => {
  it("removes a token embedded in a Prisma error message", () => {
    const out = scrubSecrets(IN_PRISMA_MESSAGE);
    expect(out).not.toContain(TOKEN);
    expect(out).toContain("[redacted]");
    // The surrounding structure has to survive, or the log stops being useful.
    expect(out).toContain("telegramSettings.upsert()");
  });

  it("removes a token from a Telegram API URL while keeping the endpoint readable", () => {
    const out = scrubSecrets(IN_API_URL);
    expect(out).not.toContain(TOKEN);
    expect(out).toContain("https://api.telegram.org/bot[redacted]/getMe");
  });

  it("removes a token that appears only as the URL path segment", () => {
    expect(scrubSecrets(IN_URL_ONLY)).not.toContain(TOKEN);
  });

  it("scrubs every occurrence, not just the first", () => {
    const out = scrubSecrets(`${TOKEN} and ${OTHER_TOKEN} and ${TOKEN}`);
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain(OTHER_TOKEN);
  });

  it("redacts secret-bearing query parameters", () => {
    const out = scrubSecrets("https://hooks.example.com/x?token=supersecretvalue&ok=1");
    expect(out).not.toContain("supersecretvalue");
    expect(out).toContain("ok=1");
  });

  it("leaves ordinary text untouched", () => {
    const text = "postgres://user:pass@localhost:5432/canvas 12:34:56 host:4000";
    expect(scrubSecrets(text)).toBe(text);
  });
});

describe("scrubError", () => {
  it("scrubs message and stack but preserves the diagnostic code", () => {
    const err = Object.assign(new Error(IN_PRISMA_MESSAGE), { code: "P2002" });
    err.stack = `Error: ${IN_PRISMA_MESSAGE}`;
    const out = scrubError(err) as { message: string; stack: string; code: string; name: string };
    expect(out.message).not.toContain(TOKEN);
    expect(out.stack).not.toContain(TOKEN);
    expect(out.code).toBe("P2002");
    expect(out.name).toBe("Error");
  });

  it("scrubs a thrown string, which is otherwise an easy miss", () => {
    expect(scrubError(`boom ${TOKEN}`)).not.toContain(TOKEN);
  });

  it("passes through values that carry no text", () => {
    const err = new Error("plain failure");
    const out = scrubError(err) as { message: string };
    expect(out.message).toBe("plain failure");
  });
});