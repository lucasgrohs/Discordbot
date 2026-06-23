import crypto from "node:crypto";
import { config } from "../config.js";

const ID_BASE = "https://id.kick.com";
const API_BASE = "https://api.kick.com/public/v1";

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function randomState(): string {
  return b64url(crypto.randomBytes(16));
}

export function buildAuthorizeUrl(state: string, challenge: string): string {
  const u = new URL(`${ID_BASE}/oauth/authorize`);
  u.searchParams.set("client_id", config.kick.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", config.kick.redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("scope", config.kick.scopes);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

// Troca o code do callback por token e descobre o usuário da Kick (user_id + nome).
export async function exchangeCodeForUser(
  code: string,
  verifier: string,
): Promise<{ userId: string; username: string }> {
  const tokenRes = await fetch(`${ID_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.kick.clientId,
      client_secret: config.kick.clientSecret,
      redirect_uri: config.kick.redirectUri,
      code_verifier: verifier,
    }).toString(),
  });
  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}: ${tokenText.slice(0, 300)}`);
  const tok = JSON.parse(tokenText) as { access_token: string };

  const uRes = await fetch(`${API_BASE}/users`, {
    headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" },
  });
  const uText = await uRes.text();
  if (!uRes.ok) throw new Error(`users ${uRes.status}: ${uText.slice(0, 300)}`);
  const uJson = JSON.parse(uText) as { data?: unknown };
  const d = (Array.isArray(uJson.data) ? uJson.data[0] : uJson.data) as
    | { user_id?: number | string; name?: string; username?: string; slug?: string }
    | undefined;
  const userId = d?.user_id != null ? String(d.user_id) : "";
  const username = d?.name ?? d?.username ?? d?.slug ?? "";
  if (!userId) throw new Error("não foi possível obter o user_id da Kick");
  return { userId, username };
}
