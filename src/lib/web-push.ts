/*
 * Web push sending (Phase 10f), written on Web Crypto only so it runs the same on Cloudflare Workers, in Node and
 * in tests, without a dependency. Two standards:
 * - RFC 8291 + RFC 8188 (aes128gcm): the payload is encrypted for the one browser that subscribed, so the push
 *   service (Google, Mozilla, Apple) only ever sees ciphertext.
 * - RFC 8292 (VAPID): every request carries a short-lived ES256 token signed with our private key, so a push
 *   service accepts it only from us. The keys are the base64url strings `npx web-push generate-vapid-keys` prints.
 * Nothing here logs or stores a key, an endpoint or a payload.
 */

export interface PushSubscriptionKeys {
  endpoint: string;
  /** The browser's P-256 public key, base64url (65 bytes uncompressed). */
  p256dh: string;
  /** The browser's 16-byte auth secret, base64url. */
  auth: string;
}

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 point. Also given to the browser as applicationServerKey. */
  publicKey: string;
  /** base64url, 32-byte private scalar. Secret. */
  privateKey: string;
  /** "mailto:..." or an https address the push service can use to contact us. */
  subject: string;
}

export interface PushRequest {
  url: string;
  init: { method: "POST"; headers: Record<string, string>; body: Uint8Array<ArrayBuffer> };
}

/** A push service refuses payloads over 4,096 bytes; ours are a few hundred. */
export const MAX_PUSH_PAYLOAD = 3000;
/** VAPID tokens may live at most 24 hours; 12 leaves room for clock differences. */
const VAPID_TTL_S = 12 * 60 * 60;
const RECORD_SIZE = 4096;

const enc = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(text: string): Uint8Array {
  const b64 = text.trim().replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// Web Crypto in TypeScript 5.8 wants an ArrayBuffer-backed view; copying keeps every caller simple.
const buf = (b: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(b);

function checkPoint(raw: Uint8Array, what: string): void {
  if (raw.length !== 65 || raw[0] !== 4)
    throw new Error(`${what} is not an uncompressed P-256 key`);
}

/**
 * The browsers' push services. The server POSTs to a subscription's endpoint, which a signed-in user writes, so only
 * these hosts are accepted; anything else (our own hosts, IP addresses, other sites) would let a user aim the Worker
 * at an address of their choice.
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "web.push.apple.com",
  "updates.push.services.mozilla.com",
];
const PUSH_HOST_SUFFIXES = [".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com"];

export function isPushServiceHost(host: string): boolean {
  const h = host.toLowerCase();
  return PUSH_HOSTS.includes(h) || PUSH_HOST_SUFFIXES.some((s) => h.endsWith(s));
}

/** Whether a subscription from the browser looks usable (a known push service over https, keys of the right length). */
export function isValidSubscription(s: PushSubscriptionKeys): boolean {
  try {
    const url = new URL(s.endpoint);
    if (url.protocol !== "https:" || s.endpoint.length > 1000) return false;
    if (url.port !== "" || url.username !== "" || url.password !== "") return false;
    if (!isPushServiceHost(url.hostname)) return false;
    const p = base64UrlDecode(s.p256dh);
    return p.length === 65 && p[0] === 4 && base64UrlDecode(s.auth).length === 16;
  } catch {
    return false;
  }
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: buf(salt), info: buf(info) },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Encrypt one payload for one browser (RFC 8291, single aes128gcm record). `seed` fixes the sender key and salt
 * for tests; leave it out in real use.
 */
export async function encryptPayload(
  sub: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  payload: Uint8Array,
  seed?: { keyPair: CryptoKeyPair; salt: Uint8Array },
): Promise<Uint8Array> {
  if (payload.length > MAX_PUSH_PAYLOAD) throw new Error("push payload too large");
  const uaPublic = base64UrlDecode(sub.p256dh);
  const authSecret = base64UrlDecode(sub.auth);
  checkPoint(uaPublic, "p256dh");
  if (authSecret.length !== 16) throw new Error("auth secret must be 16 bytes");

  const asKeys =
    seed?.keyPair ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey(
    "raw",
    buf(uaPublic),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256),
  );

  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = seed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aes = await crypto.subtle.importKey("raw", buf(cek), "AES-GCM", false, ["encrypt"]);
  // One record: the payload, then the 0x02 delimiter that marks the last record.
  const plain = concat(payload, new Uint8Array([2]));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(nonce) }, aes, buf(plain)),
  );

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

/** The private key as a signing key; the public half supplies x and y for the JWK. */
async function vapidSigningKey(keys: VapidKeys): Promise<CryptoKey> {
  const pub = base64UrlDecode(keys.publicKey);
  checkPoint(pub, "VAPID public key");
  const d = base64UrlDecode(keys.privateKey);
  if (d.length !== 32) throw new Error("VAPID private key must be 32 bytes");
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(pub.slice(1, 33)),
      y: base64UrlEncode(pub.slice(33, 65)),
      d: base64UrlEncode(d),
      ext: false,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** The VAPID `Authorization` header value for one push service origin. */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  nowMs: number = Date.now(),
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const head = base64UrlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = base64UrlEncode(
    enc.encode(
      JSON.stringify({ aud, exp: Math.floor(nowMs / 1000) + VAPID_TTL_S, sub: keys.subject }),
    ),
  );
  const unsigned = head + "." + body;
  // Web Crypto's ECDSA signature is already the raw r||s form JWS wants.
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      await vapidSigningKey(keys),
      enc.encode(unsigned),
    ),
  );
  return `vapid t=${unsigned}.${base64UrlEncode(sig)}, k=${keys.publicKey.trim()}`;
}

/** Everything needed to `fetch` one push. `ttlS` is how long the push service may hold it for an offline device. */
export async function buildPushRequest(
  sub: PushSubscriptionKeys,
  payload: string,
  keys: VapidKeys,
  opts: { ttlS?: number; urgency?: "low" | "normal" | "high"; topic?: string; now?: number } = {},
): Promise<PushRequest> {
  const body = await encryptPayload(sub, enc.encode(payload));
  const headers: Record<string, string> = {
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(Math.max(0, Math.round(opts.ttlS ?? 600))),
    Urgency: opts.urgency ?? "normal",
    Authorization: await vapidAuthorization(sub.endpoint, keys, opts.now),
  };
  // A topic replaces an older undelivered push with the same topic (at most 32 base64url characters).
  if (opts.topic && /^[A-Za-z0-9_-]{1,32}$/.test(opts.topic)) headers["Topic"] = opts.topic;
  return { url: sub.endpoint, init: { method: "POST", headers, body: buf(body) } };
}

/** 404 and 410 mean the browser dropped the subscription: delete it. */
export function isGoneStatus(status: number): boolean {
  return status === 404 || status === 410;
}
