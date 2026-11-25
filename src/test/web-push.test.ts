import { createECDH, createPublicKey, createDecipheriv, hkdfSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  base64UrlDecode,
  base64UrlEncode,
  buildPushRequest,
  encryptPayload,
  isGoneStatus,
  isValidSubscription,
  vapidAuthorization,
} from "@/lib/web-push";

/*
 * Web push sending (Phase 10f). The payload is decrypted here the way a browser does it (RFC 8291 with node's own
 * crypto, written separately from the code under test), and the VAPID token is verified with the public key.
 * The implementation was also checked once against the reference libraries (http_ece decrypt, web-push keys).
 */

function browserKeys() {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = Buffer.from("0123456789abcdef");
  return {
    ua,
    auth,
    sub: {
      endpoint: "https://push.example.net/send/abc123",
      p256dh: ua.getPublicKey().toString("base64url"),
      auth: auth.toString("base64url"),
    },
  };
}

function vapidKeys() {
  const k = createECDH("prime256v1");
  k.generateKeys();
  return {
    publicKey: k.getPublicKey().toString("base64url"),
    privateKey: k.getPrivateKey().toString("base64url"),
    subject: "https://skydeck.example",
  };
}

/** RFC 8291 decryption as the browser does it. */
function decrypt(body: Uint8Array, ua: ReturnType<typeof createECDH>, auth: Buffer): string {
  const b = Buffer.from(body);
  const salt = b.subarray(0, 16);
  const rs = b.readUInt32BE(16);
  const idlen = b[20]!;
  const asPublic = b.subarray(21, 21 + idlen);
  const cipher = b.subarray(21 + idlen);
  expect(rs).toBe(4096);
  const ecdh = ua.computeSecret(asPublic);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", ecdh, auth, info, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, "Content-Encoding: aes128gcm\0", 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, "Content-Encoding: nonce\0", 12));
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  expect(plain[plain.length - 1]).toBe(2);
  return plain.subarray(0, plain.length - 1).toString("utf8");
}

describe("web push encryption (RFC 8291)", () => {
  it("encrypts a payload only the subscribing browser can read", async () => {
    const { ua, auth, sub } = browserKeys();
    const text = JSON.stringify({ title: "Heavies at JFK: UAL1 ✈", body: "B77W" });
    const body = await encryptPayload(sub, new TextEncoder().encode(text));
    expect(decrypt(body, ua, auth)).toBe(text);
    // A fresh key and salt every time: the same text never encrypts the same way twice.
    const again = await encryptPayload(sub, new TextEncoder().encode(text));
    expect(base64UrlEncode(again)).not.toBe(base64UrlEncode(body));
  });

  it("refuses bad keys and oversize payloads", async () => {
    const { sub } = browserKeys();
    await expect(encryptPayload({ ...sub, p256dh: "AAAA" }, new Uint8Array(1))).rejects.toThrow();
    await expect(encryptPayload({ ...sub, auth: "AAAA" }, new Uint8Array(1))).rejects.toThrow();
    await expect(encryptPayload(sub, new Uint8Array(3001))).rejects.toThrow(/too large/);
  });
});

describe("VAPID (RFC 8292)", () => {
  it("signs a token for the push service's origin that verifies with the public key", async () => {
    const keys = vapidKeys();
    const now = Date.UTC(2026, 10, 25, 12);
    const header = await vapidAuthorization("https://push.example.net/send/abc", keys, now);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(m).not.toBeNull();
    const [, h, b, s, k] = m!;
    expect(k).toBe(keys.publicKey);
    const claims = JSON.parse(Buffer.from(b!, "base64url").toString()) as Record<string, unknown>;
    expect(claims).toEqual({
      aud: "https://push.example.net",
      exp: now / 1000 + 12 * 3600,
      sub: "https://skydeck.example",
    });
    const pub = base64UrlDecode(keys.publicKey);
    const key = createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: Buffer.from(pub.slice(1, 33)).toString("base64url"),
        y: Buffer.from(pub.slice(33)).toString("base64url"),
      },
      format: "jwk",
    });
    const ok = verify(
      "sha256",
      Buffer.from(h + "." + b),
      { key, dsaEncoding: "ieee-p1363" },
      Buffer.from(s!, "base64url"),
    );
    expect(ok).toBe(true);
  });

  it("builds the whole request with the headers push services require", async () => {
    const { ua, auth, sub } = browserKeys();
    const req = await buildPushRequest(sub, '{"title":"t"}', vapidKeys(), {
      ttlS: 900,
      urgency: "high",
      topic: "bad topic!",
    });
    expect(req.url).toBe(sub.endpoint);
    expect(req.init.method).toBe("POST");
    expect(req.init.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(req.init.headers["TTL"]).toBe("900");
    expect(req.init.headers["Urgency"]).toBe("high");
    expect(req.init.headers["Topic"]).toBeUndefined();
    expect(req.init.headers["Authorization"]).toMatch(/^vapid t=/);
    expect(decrypt(req.init.body, ua, auth)).toBe('{"title":"t"}');
  });
});

describe("subscriptions", () => {
  it("accepts only https endpoints with keys of the right size", () => {
    const { sub } = browserKeys();
    expect(isValidSubscription(sub)).toBe(true);
    expect(isValidSubscription({ ...sub, endpoint: "http://push.example.net/x" })).toBe(false);
    expect(isValidSubscription({ ...sub, endpoint: "not a url" })).toBe(false);
    expect(isValidSubscription({ ...sub, p256dh: sub.auth })).toBe(false);
    expect(isValidSubscription({ ...sub, auth: sub.p256dh })).toBe(false);
  });

  it("treats 404 and 410 as a subscription that is gone", () => {
    expect(isGoneStatus(410)).toBe(true);
    expect(isGoneStatus(404)).toBe(true);
    expect(isGoneStatus(429)).toBe(false);
    expect(isGoneStatus(201)).toBe(false);
  });
});
