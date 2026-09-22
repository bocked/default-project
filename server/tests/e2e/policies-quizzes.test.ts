import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { startTestServer, cleanDatabase, request, unique, ADMIN_PASSWORD, type TestServer } from "./helpers.js";

const ADMIN = ADMIN_PASSWORD;

async function register(base: string, email: string, password = "s3cret-password"): Promise<{ token: string; id: string; email: string }> {
  const reg = await request(base, "POST", "/api/auth/register", { body: { email, password } });
  expect(reg.status).toBe(201);
  return { token: reg.json.token, id: reg.json.user.id, email };
}

/** Registers a user and verifies their email (via the DB, like the email
 *  link would) so they can post and take quizzes. */
async function registerVerified(base: string): Promise<{ token: string; id: string; email: string }> {
  const email = `${unique("quizuser")}@example.com`;
  const { id } = await register(base, email);
  await prisma.user.update({ where: { id }, data: { emailVerified: true } });
  const login = await request(base, "POST", "/api/auth/login", { body: { email, password: "s3cret-password" } });
  expect(login.status).toBe(200);
  return { token: login.json.token, id, email };
}

/** Registers a user and promotes them to a plain ADMIN (not SUPER_ADMIN). */
async function registerAdmin(base: string): Promise<{ token: string; id: string }> {
  const { token, id } = await registerVerified(base);
  const grant = await request(base, "PATCH", `/api/admin/users/${id}/role`, { token: ADMIN, body: { role: "ADMIN" } });
  expect(grant.status).toBe(200);
  return { token, id };
}

function quizBody(title: string, answers: number[] = [1, 0, 2]) {
  return {
    title,
    description: "Test uchun",
    questions: answers.map((correctIndex, i) => ({
      question: `Savol ${i + 1}`,
      options: ["Variant A", "Variant B", "Variant C"],
      correctIndex,
    })),
  };
}

describe("E2E: legal policies (draft → edit → SUPER_ADMIN approve → re-consent)", () => {
  let ts: TestServer;
  let base: string;

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();
  });

  afterAll(async () => {
    await ts.close();
  });

  it("settings start at the template terms version", async () => {
    const res = await request(base, "GET", "/api/settings");
    expect(res.status).toBe(200);
    expect(res.json.termsVersion).toBe("1.1");
  });

  it("public policies endpoint returns the template until published", async () => {
    const ok = await request(base, "GET", "/api/policies?type=TERMS");
    expect(ok.status).toBe(200);
    expect(ok.json.policy.version).toBe("1.1");
    expect(ok.json.policy.content.length).toBeGreaterThan(100);
    expect(ok.json.draft).toBeNull();

    const bad = await request(base, "GET", "/api/policies?type=NOPE");
    expect(bad.status).toBe(400);
  });

  it("a plain ADMIN creates a draft but only SUPER_ADMIN may publish it", async () => {
    const admin = await registerAdmin(base);

    const createDraft = await request(base, "POST", "/api/admin/policies", {
      token: admin.token,
      body: { type: "TERMS", changeSummary: "Yangilangan shartlar" },
    });
    expect(createDraft.status).toBe(201);
    const draftId = createDraft.json.policy.id;
    expect(createDraft.json.policy.isApproved).toBe(false);

    // Editing the draft is fine for a plain ADMIN.
    const edit = await request(base, "PATCH", `/api/admin/policies/${draftId}`, {
      token: admin.token,
      body: { content: "## 1. Yangi matn\n\nBu yangi foydalanish shartlaridir.", changeSummary: "Soddalashtirildi" },
    });
    expect(edit.status).toBe(200);

    // Approve requires SUPER_ADMIN: a plain ADMIN gets 403.
    const forbidden = await request(base, "POST", `/api/admin/policies/${draftId}/approve`, { token: admin.token });
    expect(forbidden.status).toBe(403);

    // The shared master key (SUPER_ADMIN role) may approve.
    const approve = await request(base, "POST", `/api/admin/policies/${draftId}/approve`, {
      token: ADMIN,
      body: { changeReason: "Super admin tasdiqladi" },
    });
    expect(approve.status).toBe(200);
    expect(approve.json.version).toBe("1.2");
  });

  it("published policy is served publicly and the terms version bumps to 1.2", async () => {
    const res = await request(base, "GET", "/api/policies?type=TERMS");
    expect(res.status).toBe(200);
    expect(res.json.policy.version).toBe("1.2");
    expect(res.json.policy.content).toContain("yangi foydalanish shartlari");

    const settings = await request(base, "GET", "/api/settings");
    expect(settings.json.termsVersion).toBe("1.2");
  });

  it("a freshly registered user accepts the current version; old accounts re-consent", async () => {
    // Fresh registrations accept the current published version automatically.
    const fresh = await register(base, `${unique("fresh")}@example.com`);
    const freshUser = await prisma.user.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(freshUser.acceptedTermsVersion).toBe("1.2");

    // Old account (accepted 1.1 before the update): simulate by downgrading.
    const old = await register(base, `${unique("old")}@example.com`);
    await prisma.user.update({ where: { id: old.id }, data: { acceptedTermsVersion: "1.1" } });
    const oldLogin = await request(base, "POST", "/api/auth/login", {
      body: { email: old.email || "", password: "s3cret-password" },
    });
    expect(oldLogin.status).toBe(200);
    expect(oldLogin.json.user.termsRequired).toBe(true);
    expect(oldLogin.json.user.currentTermsVersion).toBe("1.2");

    // Wrong-version consent is rejected.
    const wrong = await request(base, "POST", "/api/auth/accept-terms", {
      token: oldLogin.json.token,
      body: { version: "1.1" },
    });
    expect(wrong.status).toBe(400);
    expect(wrong.json.code).toBe("TERMS_VERSION_MISMATCH");

    // Correct consent unlocks the account.
    const ok = await request(base, "POST", "/api/auth/accept-terms", {
      token: oldLogin.json.token,
      body: { version: "1.2" },
    });
    expect(ok.status).toBe(200);
    expect(ok.json.user.termsRequired).toBe(false);
    expect(ok.json.user.acceptedTermsVersion).toBe("1.2");
  });

  it("only one open draft per type; next draft gets the next free version", async () => {
    const admin = await registerAdmin(base);
    // APPROVED 1.2 exists; a new TERMS draft must jump to 1.3.
    const draft = await request(base, "POST", "/api/admin/policies", {
      token: admin.token,
      body: { type: "TERMS", changeSummary: "Yana bir loyiha" },
    });
    expect(draft.status).toBe(201);
    expect(draft.json.policy.version).toBe("1.3");

    // A second open draft for the same type is refused.
    const dup = await request(base, "POST", "/api/admin/policies", { token: admin.token, body: { type: "TERMS" } });
    expect(dup.status).toBe(409);

    // Drafts can be deleted; approved versions are locked.
    const del = await request(base, "DELETE", `/api/admin/policies/${draft.json.policy.id}`, { token: admin.token });
    expect(del.status).toBe(200);
    const approved = await prisma.sitePolicy.findFirstOrThrow({ where: { type: "TERMS", version: "1.2" } });
    const delApproved = await request(base, "DELETE", `/api/admin/policies/${approved.id}`, { token: admin.token });
    expect(delApproved.status).toBe(400);
  });
});

describe("E2E: quizzes (create → moderate → take → results)", () => {
  let ts: TestServer;
  let base: string;
  let user: { token: string; id: string; email: string };

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();
    user = await registerVerified(base);
  });

  afterAll(async () => {
    await ts.close();
  });

  it("unverified users cannot create quizzes", async () => {
    const reg = await register(base, `${unique("unver")}@example.com`);
    const post = await request(base, "POST", "/api/quizzes", {
      token: reg.token,
      body: quizBody("Ruxsatsiz test"),
    });
    expect(post.status).toBe(403);
    expect(post.json.code).toBe("NOT_VERIFIED");
  });

  it("a user quiz enters PENDING and stays out of the public catalog until approved", async () => {
    const created = await request(base, "POST", "/api/quizzes", { token: user.token, body: quizBody("Umumiy bilimlar") });
    expect(created.status).toBe(201);
    expect(created.json.quiz.status).toBe("PENDING");
    expect(created.json.quiz.questions[0].correctIndex).toBe(1); // owner sees answers

    const list = await request(base, "GET", "/api/quizzes");
    expect(list.json.total).toBe(0);

    const detail = await request(base, "GET", `/api/quizzes/${created.json.quiz.id}`, { token: user.token });
    expect(detail.status).toBe(404);
  });

  it("admin approval publishes the quiz; guests do not see answers", async () => {
    const pending = await prisma.quiz.findFirstOrThrow({ where: { title: "Umumiy bilimlar" } });
    const admin = await registerAdmin(base);
    const approve = await request(base, "POST", `/api/admin/quizzes/${pending.id}/approve`, { token: admin.token });
    expect(approve.status).toBe(200);

    const list = await request(base, "GET", "/api/quizzes");
    expect(list.json.total).toBe(1);
    expect(list.json.quizzes[0].author.id).toBe(user.id);
    expect(list.json.quizzes[0].questionCount).toBe(3);

    // Guest view: correct indexes hidden.
    const guest = await request(base, "GET", `/api/quizzes/${pending.id}`);
    expect(guest.status).toBe(200);
    expect(guest.json.myResult).toBeNull();
    for (const q of guest.json.quiz.questions) expect(q.correctIndex).toBeNull();

    // Admin moderation detail exposes everything.
    const adminView = await request(base, "GET", `/api/admin/quizzes/${pending.id}`, { token: admin.token });
    expect(adminView.status).toBe(200);
    expect(adminView.json.quiz.questions[0].correctIndex).toBe(1);
  });

  it("submitting answers scores correctly and unlocks review", async () => {
    const quiz = await prisma.quiz.findFirstOrThrow({ where: { title: "Umumiy bilimlar" } });
    // correctIndexes: [1, 0, 2]. Answer all but the first wrong: [1, 2, 2]
    const attempt = await request(base, "POST", `/api/quizzes/${quiz.id}/attempt`, {
      token: user.token,
      body: { answers: [1, 2, 2] },
    });
    expect(attempt.status).toBe(200);
    expect(attempt.json.total).toBe(3);
    expect(attempt.json.score).toBe(2);
    expect(attempt.json.perQuestion).toEqual([
      { correct: true, correctIndex: 1, yourAnswer: 1 },
      { correct: false, correctIndex: 0, yourAnswer: 2 },
      { correct: true, correctIndex: 2, yourAnswer: 2 },
    ]);

    // Now the topic is available: owner/participant sees answers + own result.
    const detail = await request(base, "GET", `/api/quizzes/${quiz.id}`, { token: user.token });
    expect(detail.json.myResult.score).toBe(2);
    expect(detail.json.quiz.questions[0].correctIndex).toBe(1);

    // A second user stays blind until they take it themselves.
    const other = await registerVerified(base);
    const otherView = await request(base, "GET", `/api/quizzes/${quiz.id}`, { token: other.token });
    expect(otherView.json.myResult).toBeNull();
    expect(otherView.json.quiz.questions[0].correctIndex).toBeNull();

    // Wrong answer count -> 400.
    const bad = await request(base, "POST", `/api/quizzes/${quiz.id}/attempt`, {
      token: user.token,
      body: { answers: [1, 2] },
    });
    expect(bad.status).toBe(400);
  });

  it("mine + mine/results reflect the author's and the taker's state", async () => {
    const mine = await request(base, "GET", "/api/quizzes/mine", { token: user.token });
    expect(mine.status).toBe(200);
    expect(mine.json.quizzes[0].title).toBe("Umumiy bilimlar");
    expect(mine.json.quizzes[0].status).toBe("APPROVED");
    expect(mine.json.quizzes[0].questions[0].correctIndex).toBe(1);

    const results = await request(base, "GET", "/api/quizzes/mine/results", { token: user.token });
    expect(results.json.results[0].title).toBe("Umumiy bilimlar");
    expect(results.json.results[0].score).toBe(2);
    expect(results.json.results[0].total).toBe(3);
  });

  it("trusted authors auto-publish; rejection carries a reason; super delete", async () => {
    const admin = await registerAdmin(base);
    const auto = await request(base, "POST", "/api/quizzes", {
      token: admin.token,
      body: quizBody("Adminning autotesti"),
    });
    expect(auto.status).toBe(201);
    expect(auto.json.quiz.status).toBe("APPROVED");

    // Reject a pending quiz with a reason.
    const badQuiz = await request(base, "POST", "/api/quizzes", {
      token: user.token,
      body: quizBody("Rad etiladigan test"),
    });
    expect(badQuiz.status).toBe(201);
    const reject = await request(base, "POST", `/api/admin/quizzes/${badQuiz.json.quiz.id}/reject`, {
      token: admin.token,
      body: { reason: "Savollar noaniq" },
    });
    expect(reject.status).toBe(200);
    const rejected = await prisma.quiz.findUniqueOrThrow({ where: { id: badQuiz.json.quiz.id } });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectionReason).toBe("Savollar noaniq");

    // Author sees the reason on /mine.
    const mine = await request(base, "GET", "/api/quizzes/mine", { token: user.token });
    const seen = mine.json.quizzes.find((q: any) => q.id === badQuiz.json.quiz.id);
    expect(seen.status).toBe("REJECTED");

    // A plain ADMIN cannot hard-delete; SUPER_ADMIN can.
    const adminDel = await request(base, "DELETE", `/api/admin/quizzes/${badQuiz.json.quiz.id}`, { token: admin.token });
    expect(adminDel.status).toBe(403);
    const superDel = await request(base, "DELETE", `/api/admin/quizzes/${badQuiz.json.quiz.id}`, { token: ADMIN });
    expect(superDel.status).toBe(200);
    const goneView = await request(base, "GET", `/api/quizzes/${badQuiz.json.quiz.id}`);
    expect(goneView.status).toBe(404);
  });
});