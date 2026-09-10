import { describe, expect, it, vi } from "vitest";
import { handle, type Env } from "../../apps/proxy/src/index";

const env: Env = {
  GITHUB_CLIENT_ID: "cid",
  GITHUB_CLIENT_SECRET: "secret",
  ALLOWED_ORIGINS: "https://darkpyonix.github.io,http://localhost:5173",
};

const ORIGIN = "https://darkpyonix.github.io";

function post(body: unknown, origin = ORIGIN, path = "/token"): Request {
  return new Request(`https://researchtree.thisisthepy.workers.dev${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function github(data: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(data), { status: 200 }));
}

describe("proxy", () => {
  it("허용되지 않은 origin은 거부한다", async () => {
    const f = github({});
    const res = await handle(post({ code: "abc" }, "https://evil.example"), env, f);
    expect(res.status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it("preflight에 CORS 헤더로 답한다", async () => {
    const req = new Request("https://x/token", { method: "OPTIONS", headers: { Origin: ORIGIN } });
    const res = await handle(req, env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });

  it("code를 토큰으로 바꾸고 secret을 붙인다", async () => {
    const f = github({ access_token: "gho_x", scope: "repo", token_type: "bearer" });
    const res = await handle(post({ code: "abc123" }), env, f);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: "gho_x", scope: "repo", token_type: "bearer" });
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent).toEqual({ client_id: "cid", client_secret: "secret", code: "abc123" });
  });

  it("GitHub 오류를 400으로 전달하고 secret은 노출하지 않는다", async () => {
    const f = github({ error: "bad_verification_code", error_description: "expired" });
    const res = await handle(post({ code: "abc" }), env, f);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("bad_verification_code");
    expect(text).not.toContain("secret");
  });

  it("잘못된 code 형식은 GitHub에 보내지 않는다", async () => {
    const f = github({});
    expect((await handle(post({ code: "a b\n" }), env, f)).status).toBe(400);
    expect((await handle(post({}), env, f)).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it("/token 외 경로는 404", async () => {
    expect((await handle(post({ code: "a" }, ORIGIN, "/other"), env, github({}))).status).toBe(404);
  });

  it("Marketplace 웹훅은 Origin 없이 받고 아무것도 하지 않는다", async () => {
    const f = github({});
    const req = new Request("https://researchtree.thisisthepy.workers.dev/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "payload=%7B%7D",
    });
    const res = await handle(req, env, f);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(f).not.toHaveBeenCalled();
    expect((await handle(new Request("https://x/marketplace"), env, f)).status).toBe(403);
  });

  it("secret이 없으면 500", async () => {
    const res = await handle(post({ code: "a" }), { ...env, GITHUB_CLIENT_SECRET: "" }, github({}));
    expect(res.status).toBe(500);
  });
});
