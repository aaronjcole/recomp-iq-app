// Executes the Apple App Store JWS verifier against an openssl-generated test
// chain shaped like Apple's (P-384 root + WWDR-marked P-384 intermediate +
// receipt-marked P-256 leaf, ecdsa-with-SHA384 certificate signatures).
// Regenerate fixtures with: sh tests/fixtures/apple-jws/generate.sh
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPLE_ROOT_CA_G3_B64,
  derEcdsaSignatureToRaw,
  parseCertificate,
  verifyAppleNotificationJws,
  verifyInnerJws
} from "../../base44/shared/appleJwsVerify.js";

const fixtures = resolve(fileURLToPath(new URL("../fixtures/apple-jws", import.meta.url)));
const pemB64 = (name) =>
  readFileSync(resolve(fixtures, name), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("-----"))
    .join("");
const der = (name) => new Uint8Array(Buffer.from(pemB64(name), "base64"));

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const ROOT = pemB64("root.pem");
const INTER = pemB64("intermediate.pem");
const LEAF = pemB64("leaf.pem");
const TEST_ROOT_DER = der("root.pem");
const OPTS = { trustedRootDer: TEST_ROOT_DER, now: NOW };

const b64url = (bytes) =>
  Buffer.from(bytes).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

const leafKeyPromise = crypto.subtle.importKey(
  "pkcs8",
  Buffer.from(pemB64("leaf-key.p8.pem"), "base64"),
  { name: "ECDSA", namedCurve: "P-256" },
  false,
  ["sign"]
);

async function makeJws(header, payload) {
  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await leafKeyPromise,
    Buffer.from(h + "." + p)
  );
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

const PAYLOAD = { notificationType: "REFUND", signedDate: NOW - 60_000, data: { bundleId: "test" } };

test("a valid Apple-shaped chain verifies with the injected test root", async () => {
  const jws = await makeJws({ alg: "ES256", x5c: [LEAF, INTER, ROOT] }, PAYLOAD);
  const { payload, leafKey } = await verifyAppleNotificationJws(jws, OPTS);
  assert.deepEqual(payload, PAYLOAD);
  assert.equal(leafKey.algorithm.namedCurve, "P-256");

  // A two-certificate chain (root omitted) must chain to the trusted root.
  const short = await makeJws({ alg: "ES256", x5c: [LEAF, INTER] }, PAYLOAD);
  assert.deepEqual((await verifyAppleNotificationJws(short, OPTS)).payload, PAYLOAD);
});

test("the same chain is rejected by the embedded production Apple root", async () => {
  const jws = await makeJws({ alg: "ES256", x5c: [LEAF, INTER, ROOT] }, PAYLOAD);
  await assert.rejects(() => verifyAppleNotificationJws(jws, { now: NOW }), /trusted Apple root/);
  const short = await makeJws({ alg: "ES256", x5c: [LEAF, INTER] }, PAYLOAD);
  await assert.rejects(() => verifyAppleNotificationJws(short, { now: NOW }));
});

test("a look-alike root with the same name but a different key is rejected", async () => {
  const opts = { trustedRootDer: der("other-root.pem"), now: NOW };
  const full = await makeJws({ alg: "ES256", x5c: [LEAF, INTER, ROOT] }, PAYLOAD);
  await assert.rejects(() => verifyAppleNotificationJws(full, opts), /trusted Apple root/);
  const short = await makeJws({ alg: "ES256", x5c: [LEAF, INTER] }, PAYLOAD);
  await assert.rejects(() => verifyAppleNotificationJws(short, opts), /Intermediate certificate signature is invalid/);
  // Substituting the look-alike root in x5c does not help either.
  const swapped = await makeJws({ alg: "ES256", x5c: [LEAF, INTER, pemB64("other-root.pem")] }, PAYLOAD);
  await assert.rejects(() => verifyAppleNotificationJws(swapped, OPTS), /trusted Apple root/);
});

test("a leaf without the Apple App Store OID is rejected", async () => {
  const jws = await makeJws({ alg: "ES256", x5c: [pemB64("leaf-no-oid.pem"), INTER, ROOT] }, PAYLOAD);
  await assert.rejects(() => verifyAppleNotificationJws(jws, OPTS), /Leaf certificate is missing the Apple App Store marker/);
});

test("an intermediate without the Apple WWDR OID is rejected", async () => {
  const jws = await makeJws({ alg: "ES256", x5c: [LEAF, pemB64("intermediate-no-oid.pem"), ROOT] }, PAYLOAD);
  await assert.rejects(() => verifyAppleNotificationJws(jws, OPTS), /Apple WWDR marker/);
});

test("an intermediate that is not a CA is rejected", async () => {
  const jws = await makeJws({ alg: "ES256", x5c: [LEAF, pemB64("intermediate-not-ca.pem"), ROOT] }, PAYLOAD);
  await assert.rejects(() => verifyAppleNotificationJws(jws, OPTS), /not a CA/);
});

test("a tampered payload or signature is rejected", async () => {
  const jws = await makeJws({ alg: "ES256", x5c: [LEAF, INTER, ROOT] }, PAYLOAD);
  const [h, , s] = jws.split(".");
  const forged = b64url(Buffer.from(JSON.stringify({ ...PAYLOAD, notificationType: "DID_RENEW" })));
  await assert.rejects(() => verifyAppleNotificationJws(`${h}.${forged}.${s}`, OPTS), /JWS signature verification failed/);

  const sig = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  sig[10] ^= 0x01;
  await assert.rejects(() => verifyAppleNotificationJws(`${h}.${jws.split(".")[1]}.${b64url(sig)}`, OPTS));
});

test("a tampered certificate in the chain is rejected", async () => {
  const leafBytes = der("leaf.pem");
  // Flip a byte inside the leaf's subject CN, keeping the DER structure intact.
  const idx = Buffer.from(leafBytes).indexOf(Buffer.from("StoreKit"));
  leafBytes[idx] ^= 0x01;
  const jws = await makeJws({ alg: "ES256", x5c: [Buffer.from(leafBytes).toString("base64"), INTER, ROOT] }, PAYLOAD);
  await assert.rejects(() => verifyAppleNotificationJws(jws, OPTS), /Leaf certificate signature is invalid/);
});

test("an expired leaf certificate is rejected at the signing time", async () => {
  const jws = await makeJws({ alg: "ES256", x5c: [pemB64("leaf-expired.pem"), INTER, ROOT] }, PAYLOAD);
  await assert.rejects(() => verifyAppleNotificationJws(jws, OPTS), /not valid at the signing time/);

  // Without signedDate, validity is checked against `now`.
  const { signedDate: _omit, ...undated } = PAYLOAD;
  const dated = await makeJws({ alg: "ES256", x5c: [LEAF, INTER, ROOT] }, undated);
  await assert.rejects(
    () => verifyAppleNotificationJws(dated, { ...OPTS, now: Date.parse("2036-01-01T00:00:00Z") }),
    /not valid at the signing time/
  );
  assert.ok(await verifyAppleNotificationJws(dated, OPTS));
});

test("a JWS whose alg is not ES256 is rejected", async () => {
  for (const alg of ["ES384", "none", "HS256", undefined]) {
    const jws = await makeJws({ alg, x5c: [LEAF, INTER, ROOT] }, PAYLOAD);
    await assert.rejects(() => verifyAppleNotificationJws(jws, OPTS), /Unsupported JWS algorithm/);
  }
});

test("malformed chains and JWS shapes are rejected", async () => {
  await assert.rejects(() => verifyAppleNotificationJws("a.b", OPTS));
  await assert.rejects(() => verifyAppleNotificationJws("", OPTS));
  for (const x5c of [undefined, [], [LEAF], [LEAF, INTER, ROOT, ROOT], [LEAF, "not base64!", ROOT]]) {
    const jws = await makeJws({ alg: "ES256", x5c }, PAYLOAD);
    await assert.rejects(() => verifyAppleNotificationJws(jws, OPTS));
  }
  // Leaf and intermediate swapped.
  const swapped = await makeJws({ alg: "ES256", x5c: [INTER, LEAF, ROOT] }, PAYLOAD);
  await assert.rejects(() => verifyAppleNotificationJws(swapped, OPTS));
});

test("inner JWS verifies with the outer leaf key and rejects tampering or wrong alg", async () => {
  const outer = await makeJws({ alg: "ES256", x5c: [LEAF, INTER, ROOT] }, PAYLOAD);
  const { leafKey } = await verifyAppleNotificationJws(outer, OPTS);
  const txn = { productId: "p", originalTransactionId: "1", signedDate: NOW };
  const inner = await makeJws({ alg: "ES256" }, txn);
  assert.deepEqual(await verifyInnerJws(inner, leafKey, OPTS), txn);

  const [h, , s] = inner.split(".");
  const forged = b64url(Buffer.from(JSON.stringify({ ...txn, productId: "q" })));
  await assert.rejects(() => verifyInnerJws(`${h}.${forged}.${s}`, leafKey, OPTS));
  // With an x5c fallback, a tampered inner JWS still fails full verification.
  const innerX5c = await makeJws({ alg: "ES256", x5c: [LEAF, INTER, ROOT] }, txn);
  const [hx, , sx] = innerX5c.split(".");
  await assert.rejects(() => verifyInnerJws(`${hx}.${forged}.${sx}`, leafKey, OPTS));
  const wrongAlg = await makeJws({ alg: "HS256" }, txn);
  await assert.rejects(() => verifyInnerJws(wrongAlg, leafKey, OPTS), /Unsupported JWS algorithm/);
});

test("DER ECDSA signatures convert to fixed-width raw r||s", () => {
  // r = 0x00 0x80.. (leading zero pad for a high-bit integer), s = 0x01 (short).
  const r = new Uint8Array(32).fill(0x80);
  const sigDer = new Uint8Array([0x30, 0x26, 0x02, 0x21, 0x00, ...r, 0x02, 0x01, 0x01]);
  const raw = derEcdsaSignatureToRaw(sigDer, 32);
  assert.equal(raw.length, 64);
  assert.deepEqual(raw.subarray(0, 32), r);
  assert.deepEqual(raw.subarray(32, 63), new Uint8Array(31));
  assert.equal(raw[63], 1);
  assert.equal(derEcdsaSignatureToRaw(sigDer, 48).length, 96);
  // Integers wider than the curve size are rejected.
  const tooWide = new Uint8Array([0x30, 0x25, 0x02, 0x21, 0x01, ...r, 0x02, 0x00]);
  assert.throws(() => derEcdsaSignatureToRaw(tooWide, 32));
});

test("the embedded production root is the genuine P-384 Apple Root CA G3", async () => {
  const rootDer = new Uint8Array(Buffer.from(APPLE_ROOT_CA_G3_B64, "base64"));
  assert.equal(rootDer.length, 583);
  const digest = Buffer.from(await crypto.subtle.digest("SHA-256", rootDer)).toString("hex").toUpperCase();
  assert.equal(
    digest.match(/../g).join(":"),
    "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79"
  );
  const root = parseCertificate(rootDer);
  assert.equal(root.curve.name, "P-384");
  assert.equal(root.sigHash, "SHA-384");
  assert.equal(root.notAfter, Date.parse("2039-04-30T18:19:06Z"));
  // Self-signature verifies with the P-384 key and SHA-384 (exercises the
  // same import/convert/verify path used for Apple's intermediate).
  const key = await crypto.subtle.importKey("spki", root.spki.slice(), { name: "ECDSA", namedCurve: "P-384" }, false, ["verify"]);
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-384" },
    key,
    derEcdsaSignatureToRaw(root.signatureDer, 48),
    root.tbsBytes.slice()
  );
  assert.equal(ok, true);
});
