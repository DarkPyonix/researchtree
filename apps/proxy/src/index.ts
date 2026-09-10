/**
 * ResearchTree auth proxy.
 * GitHub's token endpoint does not support CORS, so the browser cannot call it directly.
 * This Worker only exchanges an OAuth authorization code for a token. It never stores or logs tokens.
 */
export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Comma-separated list of allowed origins */
  ALLOWED_ORIGINS: string;
}

const TOKEN_URL = "https://github.com/login/oauth/access_token";

function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
}

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";
  if (!allowedOrigins(env).includes(origin)) {
    return new Response("forbidden", { status: 403 });
  }

  const cors = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const url = new URL(req.url);
  if (req.method !== "POST" || url.pathname !== "/token") {
    return json({ error: "not_found" }, 404, cors);
  }

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return json({ error: "server_misconfigured" }, 500, cors);
  }

  let code: unknown;
  let codeVerifier: unknown;
  try {
    const body = (await req.json()) as { code?: unknown; code_verifier?: unknown };
    code = body.code;
    codeVerifier = body.code_verifier;
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(code)) {
    return json({ error: "invalid_code" }, 400, cors);
  }

  const payload: Record<string, string> = {
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    code,
  };
  if (typeof codeVerifier === "string") payload.code_verifier = codeVerifier;

  const gh = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "researchtree-proxy" },
    body: JSON.stringify(payload),
  });

  // GitHub reports failures as 200 + { error }. Forward only the fields we need.
  const data = (await gh.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof data.access_token === "string") {
    return json({ access_token: data.access_token, scope: data.scope, token_type: data.token_type }, 200, cors);
  }
  return json({ error: data.error ?? "exchange_failed", error_description: data.error_description }, 400, cors);
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, env);
  },
};
