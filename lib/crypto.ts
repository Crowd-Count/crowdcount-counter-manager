/**
 * CrowdCount - Client-side Crypto for Request Signatures (HMAC-SHA256)
 *
 * Uses the Web Crypto API (available in all modern browsers and Next.js edge/server).
 * Signing key: SHA256(device_id + ":" + password) — cached in memory per device.
 * Signature: HMAC-SHA256(signing_key, METHOD + "\n" + PATH + "\n" + SHA256(body) + "\n" + TIMESTAMP + "\n" + NONCE)
 */

// In-memory signing key cache: deviceId -> hex signing key
const signingKeyCache = new Map<string, CryptoKey>();

const encoder = new TextEncoder();

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateNonce(): string {
  return crypto.randomUUID();
}

async function deriveSigningKey(
  deviceId: string,
  password: string
): Promise<CryptoKey> {
  const cacheKey = `${deviceId}:${password}`;
  const cached = signingKeyCache.get(cacheKey);
  if (cached) return cached;

  // SHA256(device_id + ":" + password) as raw key bytes
  const rawKeyBytes = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`${deviceId}:${password}`)
  );

  // Import as HMAC key
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKeyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  signingKeyCache.set(cacheKey, cryptoKey);
  return cryptoKey;
}

async function computeHmac(key: CryptoKey, message: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface SignatureHeaders {
  "X-CC-Signature": string;
  "X-CC-Timestamp": string;
  "X-CC-Nonce": string;
  "X-CC-Device-Id": string;
  "X-CC-Sig-Version": string;
}

export async function signRequest(
  deviceId: string,
  password: string,
  method: string,
  path: string,
  body: string
): Promise<SignatureHeaders> {
  const signingKey = await deriveSigningKey(deviceId, password);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();
  const bodyHash = await sha256Hex(body);

  const stringToSign = `${method}\n${path}\n${bodyHash}\n${timestamp}\n${nonce}`;
  const signature = await computeHmac(signingKey, stringToSign);

  return {
    "X-CC-Signature": signature,
    "X-CC-Timestamp": timestamp,
    "X-CC-Nonce": nonce,
    "X-CC-Device-Id": deviceId,
    "X-CC-Sig-Version": "1",
  };
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}
