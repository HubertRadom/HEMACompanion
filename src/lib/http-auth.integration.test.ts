import { beforeAll, describe, expect, it } from "vitest";
import { ctx, USER_PASSWORD } from "@/test/setup.integration";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:4322";

// ── Risk #4: protected routes redirect unauthenticated requests ──────────────

describe("Risk #4: unauthenticated requests are redirected to /auth/signin", () => {
  it("I: GET /fights without auth → 302 /auth/signin", async () => {
    const res = await fetch(`${BASE_URL}/fights`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/signin");
  });

  it("J: GET /gear-sets without auth → 302 /auth/signin", async () => {
    const res = await fetch(`${BASE_URL}/gear-sets`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/signin");
  });

  it("K: POST /api/fights without auth → 302 /auth/signin", async () => {
    const res = await fetch(`${BASE_URL}/api/fights`, {
      method: "POST",
      // Astro 6 security.checkOrigin rejects POST without a matching Origin header.
      headers: { Origin: BASE_URL },
      body: new FormData(),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/signin");
  });
});

// ── Risk #5: server rejects invalid enum values even when client is bypassed ──

describe("Risk #5: server-side validation rejects invalid fight enum values", () => {
  let cookieHeader: string;

  beforeAll(async () => {
    const form = new FormData();
    form.append("email", ctx.userAEmail);
    form.append("password", USER_PASSWORD);

    const res = await fetch(`${BASE_URL}/api/auth/signin`, {
      method: "POST",
      headers: { Origin: BASE_URL },
      body: form,
      redirect: "manual",
    });

    const cookies = res.headers.getSetCookie();
    cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ");
  });

  it("L: invalid weapon_category rejected with validation error in redirect location", async () => {
    const form = new FormData();
    form.append("opponent_name", "Test");
    form.append("weapon_category", "axe");
    form.append("result", "win");
    form.append("date", "2026-06-14");

    const res = await fetch(`${BASE_URL}/api/fights`, {
      method: "POST",
      headers: { Cookie: cookieHeader, Origin: BASE_URL },
      body: form,
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=Invalid%20weapon%20category");
  });

  it("M: invalid result rejected with validation error in redirect location", async () => {
    const form = new FormData();
    form.append("opponent_name", "Test");
    form.append("weapon_category", "longsword");
    form.append("result", "tie");
    form.append("date", "2026-06-14");

    const res = await fetch(`${BASE_URL}/api/fights`, {
      method: "POST",
      headers: { Cookie: cookieHeader, Origin: BASE_URL },
      body: form,
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=Invalid%20result");
  });
});
