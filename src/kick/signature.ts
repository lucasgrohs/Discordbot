import crypto from "node:crypto";

const PUBLIC_KEY_URL = "https://api.kick.com/public/v1/public-key";
const KEY_TTL_MS = 12 * 60 * 60 * 1000;

let cachedKey: crypto.KeyObject | null = null;
let fetchedAt = 0;

async function getPublicKey(): Promise<crypto.KeyObject> {
  if (cachedKey && Date.now() - fetchedAt < KEY_TTL_MS) return cachedKey;
  const res = await fetch(PUBLIC_KEY_URL);
  const text = await res.text();
  if (!res.ok) throw new Error(`public-key ${res.status}: ${text.slice(0, 300)}`);
  let pem: string | undefined;
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const data = (json.data ?? json) as Record<string, unknown>;
    pem = (data.public_key ?? data.publicKey ?? json.public_key) as string | undefined;
  } catch {
    if (text.includes("BEGIN PUBLIC KEY")) pem = text;
  }
  if (!pem || !pem.includes("BEGIN PUBLIC KEY")) throw new Error(`public-key inesperado: ${text.slice(0, 200)}`);
  cachedKey = crypto.createPublicKey(pem);
  fetchedAt = Date.now();
  return cachedKey;
}

// Assinatura RSA-SHA256 sobre `${messageId}.${timestamp}.${rawBody}`.
export async function verifyWebhookSignature(args: {
  messageId: string;
  timestamp: string;
  rawBody: Buffer | string;
  signatureB64: string;
}): Promise<boolean> {
  const { messageId, timestamp, rawBody, signatureB64 } = args;
  if (!messageId || !timestamp || !signatureB64) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
  const signed = `${messageId}.${timestamp}.${body}`;
  let signature: Buffer;
  try {
    signature = Buffer.from(signatureB64, "base64");
  } catch {
    return false;
  }
  try {
    const key = await getPublicKey();
    return crypto.verify("sha256", Buffer.from(signed, "utf8"), key, signature);
  } catch {
    return false;
  }
}
