// Apple App Store Server Notifications V2 — JWS signature + x5c chain verification.
//
// Apple sends notifications as a JWS (ES256) whose header carries an x5c
// certificate chain [leaf, WWDR intermediate, Apple Root CA G3].  Without
// verifying the signature, the chain, and the Apple-specific certificate
// markers, any caller could craft a payload and revoke or extend user
// entitlements.  This module performs full verification using only standard
// JS and the Web Crypto API (crypto.subtle) so it runs unchanged in Deno and
// Node.
//
// Chain shape enforced (mirrors Apple's app-store-server-library):
//   leaf          P-256 key, extension 1.2.840.113635.100.6.11.1, not a CA
//   intermediate  extension 1.2.840.113635.100.6.2.1, basicConstraints CA:TRUE
//   root          byte-identical to the pinned Apple Root CA G3
// Each certificate's signature is verified with its issuer's key using the
// curve from the issuer's SPKI and the hash from the certificate's
// signatureAlgorithm (Apple's root and intermediate are P-384 and sign with
// ecdsa-with-SHA384).  Validity is checked at the payload's signedDate when
// present (as Apple's library does without online revocation checks), else
// at the current time.

// Apple Root CA G3 (self-signed, P-384, valid 2014-04-30 .. 2039-04-30).
// Source: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
// SHA-256: 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
export const APPLE_ROOT_CA_G3_B64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS" +
  "QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u" +
  "IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN" +
  "MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS" +
  "b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y" +
  "aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49" +
  "AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf" +
  "TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517" +
  "IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr" +
  "MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA" +
  "MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4" +
  "at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM" +
  "6BgD56KyKA==";

const OID_EC_PUBLIC_KEY = "1.2.840.10045.2.1";
const CURVES = {
  "1.2.840.10045.3.1.7": { name: "P-256", size: 32 },
  "1.3.132.0.34": { name: "P-384", size: 48 }
};
const SIG_HASHES = {
  "1.2.840.10045.4.3.2": "SHA-256", // ecdsa-with-SHA256
  "1.2.840.10045.4.3.3": "SHA-384" // ecdsa-with-SHA384
};
const OID_BASIC_CONSTRAINTS = "2.5.29.19";
export const APPLE_LEAF_OID = "1.2.840.113635.100.6.11.1";
export const APPLE_WWDR_INTERMEDIATE_OID = "1.2.840.113635.100.6.2.1";

// --- Base64 helpers ---
function binToBytes(bin) {
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlDecode(str) {
  const s = String(str);
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("Invalid base64url");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return binToBytes(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
}

function b64Decode(str) {
  if (typeof str !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(str)) {
    throw new Error("Invalid base64 certificate");
  }
  return binToBytes(atob(str));
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// --- Minimal, bounds-checked DER parser ---
function readTLV(buf, pos, limit = buf.length) {
  if (pos + 2 > limit) throw new Error("DER: truncated");
  const tag = buf[pos];
  if ((tag & 0x1f) === 0x1f) throw new Error("DER: multi-byte tags unsupported");
  let len = buf[pos + 1];
  let next = pos + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 3 || next + n > limit) throw new Error("DER: bad length");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[next + i];
    next += n;
  }
  const valueEnd = next + len;
  if (valueEnd > limit) throw new Error("DER: length exceeds buffer");
  return { tag, start: pos, end: valueEnd, valueStart: next, valueEnd };
}

function children(buf, tlv) {
  const out = [];
  let p = tlv.valueStart;
  while (p < tlv.valueEnd) {
    const c = readTLV(buf, p, tlv.valueEnd);
    out.push(c);
    p = c.end;
  }
  return out;
}

function expectTag(tlv, tag, what) {
  if (!tlv || tlv.tag !== tag) throw new Error("DER: expected " + what);
  return tlv;
}

function decodeOid(buf, tlv) {
  expectTag(tlv, 0x06, "OID");
  const bytes = buf.subarray(tlv.valueStart, tlv.valueEnd);
  if (bytes.length === 0) throw new Error("DER: empty OID");
  const parts = [];
  let value = 0;
  for (let i = 0; i < bytes.length; i++) {
    value = value * 128 + (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) {
      if (parts.length === 0) {
        const first = value < 80 ? Math.floor(value / 40) : 2;
        parts.push(first, value - first * 40);
      } else {
        parts.push(value);
      }
      value = 0;
    } else if (i === bytes.length - 1) {
      throw new Error("DER: truncated OID");
    }
  }
  return parts.join(".");
}

function decodeTime(buf, tlv) {
  const s = new TextDecoder().decode(buf.subarray(tlv.valueStart, tlv.valueEnd));
  let m;
  if (tlv.tag === 0x17) {
    m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s);
    if (!m) throw new Error("DER: bad UTCTime");
    const yy = Number(m[1]);
    m[1] = String(yy >= 50 ? 1900 + yy : 2000 + yy);
  } else if (tlv.tag === 0x18) {
    m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s);
    if (!m) throw new Error("DER: bad GeneralizedTime");
  } else {
    throw new Error("DER: expected time");
  }
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

/** Parse the fields of a DER X.509 certificate that this verifier relies on. */
export function parseCertificate(der) {
  const cert = expectTag(readTLV(der, 0), 0x30, "Certificate SEQUENCE");
  if (cert.end !== der.length) throw new Error("Certificate has trailing data");
  const [tbs, sigAlg, sigBits, ...extra] = children(der, cert);
  if (extra.length) throw new Error("Certificate has unexpected fields");
  expectTag(tbs, 0x30, "tbsCertificate");
  expectTag(sigAlg, 0x30, "signatureAlgorithm");
  expectTag(sigBits, 0x03, "signatureValue");

  const fields = children(der, tbs);
  let i = 0;
  if (fields[i]?.tag === 0xa0) i++; // version
  expectTag(fields[i++], 0x02, "serialNumber");
  const tbsSigAlg = expectTag(fields[i++], 0x30, "signature");
  const issuer = expectTag(fields[i++], 0x30, "issuer");
  const validity = expectTag(fields[i++], 0x30, "validity");
  const subject = expectTag(fields[i++], 0x30, "subject");
  const spki = expectTag(fields[i++], 0x30, "subjectPublicKeyInfo");
  let extensionsTlv = null;
  for (; i < fields.length; i++) {
    if (fields[i].tag === 0xa3) extensionsTlv = fields[i];
  }

  // signatureAlgorithm must match the one inside the signed TBS.
  if (!bytesEqual(der.subarray(sigAlg.start, sigAlg.end), der.subarray(tbsSigAlg.start, tbsSigAlg.end))) {
    throw new Error("Certificate signature algorithm mismatch");
  }
  const sigAlgParts = children(der, sigAlg);
  if (sigAlgParts.length !== 1) throw new Error("Unsupported certificate signature algorithm");
  const sigHash = SIG_HASHES[decodeOid(der, sigAlgParts[0])];
  if (!sigHash) throw new Error("Unsupported certificate signature algorithm");

  if (sigBits.valueEnd - sigBits.valueStart < 2 || der[sigBits.valueStart] !== 0) {
    throw new Error("Invalid certificate signature BIT STRING");
  }
  const signatureDer = der.subarray(sigBits.valueStart + 1, sigBits.valueEnd);

  const [notBeforeTlv, notAfterTlv] = children(der, validity);
  if (!notBeforeTlv || !notAfterTlv) throw new Error("Invalid validity");
  const notBefore = decodeTime(der, notBeforeTlv);
  const notAfter = decodeTime(der, notAfterTlv);

  const [spkiAlg, spkiKey] = children(der, spki);
  expectTag(spkiAlg, 0x30, "SPKI AlgorithmIdentifier");
  expectTag(spkiKey, 0x03, "SPKI BIT STRING");
  const [keyAlgOid, curveOid] = children(der, spkiAlg);
  if (decodeOid(der, keyAlgOid) !== OID_EC_PUBLIC_KEY) throw new Error("Certificate key is not an EC key");
  const curve = CURVES[decodeOid(der, curveOid)];
  if (!curve) throw new Error("Unsupported certificate curve");

  const extensions = new Map();
  if (extensionsTlv) {
    const [extSeq] = children(der, extensionsTlv);
    expectTag(extSeq, 0x30, "Extensions");
    for (const ext of children(der, extSeq)) {
      const parts = children(der, expectTag(ext, 0x30, "Extension"));
      const oid = decodeOid(der, parts[0]);
      const value = expectTag(parts[parts.length - 1], 0x04, "extnValue");
      if (extensions.has(oid)) throw new Error("Duplicate certificate extension");
      extensions.set(oid, der.subarray(value.valueStart, value.valueEnd));
    }
  }

  return {
    der,
    tbsBytes: der.subarray(tbs.start, tbs.end),
    sigHash,
    signatureDer,
    issuer: der.subarray(issuer.start, issuer.end),
    subject: der.subarray(subject.start, subject.end),
    notBefore,
    notAfter,
    spki: der.subarray(spki.start, spki.end),
    curve,
    extensions
  };
}

function isCa(cert) {
  const value = cert.extensions.get(OID_BASIC_CONSTRAINTS);
  if (!value) return false;
  const seq = expectTag(readTLV(value, 0), 0x30, "BasicConstraints");
  const [first] = children(value, seq);
  return Boolean(first && first.tag === 0x01 && value[first.valueStart] !== 0);
}

/**
 * Convert a DER ECDSA-Sig-Value (SEQUENCE { INTEGER r, INTEGER s }) into the
 * fixed-width raw r||s form WebCrypto expects.
 */
export function derEcdsaSignatureToRaw(sigDer, size) {
  const seq = expectTag(readTLV(sigDer, 0), 0x30, "ECDSA-Sig-Value");
  if (seq.end !== sigDer.length) throw new Error("ECDSA signature has trailing data");
  const ints = children(sigDer, seq);
  if (ints.length !== 2) throw new Error("ECDSA signature must have r and s");
  const raw = new Uint8Array(size * 2);
  ints.forEach((tlv, idx) => {
    expectTag(tlv, 0x02, "INTEGER");
    let v = sigDer.subarray(tlv.valueStart, tlv.valueEnd);
    if (v.length === 0 || v[0] & 0x80) throw new Error("ECDSA signature integer must be positive");
    while (v.length > 1 && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new Error("ECDSA signature integer too large");
    raw.set(v, idx * size + (size - v.length));
  });
  return raw;
}

function importKey(cert) {
  return crypto.subtle.importKey(
    "spki",
    cert.spki.slice(),
    { name: "ECDSA", namedCurve: cert.curve.name },
    false,
    ["verify"]
  );
}

async function verifyIssuedBy(cert, issuer, label) {
  if (!bytesEqual(cert.issuer, issuer.subject)) {
    throw new Error(label + " issuer does not match its parent's subject");
  }
  const key = await importKey(issuer);
  const raw = derEcdsaSignatureToRaw(cert.signatureDer, issuer.curve.size);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: cert.sigHash }, key, raw, cert.tbsBytes.slice());
  if (!ok) throw new Error(label + " certificate signature is invalid");
}

function checkValidity(cert, at, label) {
  if (!(at >= cert.notBefore && at <= cert.notAfter)) {
    throw new Error(label + " certificate is not valid at the signing time");
  }
}

function toDer(value) {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  throw new Error("trustedRootDer must be a Uint8Array or ArrayBuffer");
}

function splitJws(jwsString) {
  const parts = String(jwsString).trim().split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    throw new Error("Invalid JWS: expected 3 non-empty parts");
  }
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
  if (!header || typeof header !== "object") throw new Error("Invalid JWS header");
  if (header.alg !== "ES256") throw new Error("Unsupported JWS algorithm");
  if (header.crit !== undefined) throw new Error("Unsupported JWS crit header");
  const signature = b64urlDecode(parts[2]);
  if (signature.length !== 64) throw new Error("Invalid ES256 signature length");
  return {
    header,
    signedData: new TextEncoder().encode(parts[0] + "." + parts[1]),
    signature,
    payloadB64: parts[1]
  };
}

function decodePayload(payloadB64) {
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
  if (!payload || typeof payload !== "object") throw new Error("Invalid JWS payload");
  return payload;
}

/**
 * Verify an Apple App Store signed JWS (notification or signed transaction):
 * checks the x5c chain [leaf, intermediate, (root)] terminates at the pinned
 * Apple Root CA G3, carries Apple's certificate markers, is valid at the
 * signing time, and that the ES256 signature verifies with the leaf key.
 * Returns the decoded payload and the leaf public key (for verifying inner
 * signedTransactionInfo / signedRenewalInfo).
 *
 * `options` exists for tests only; production callers pass nothing so the
 * trust anchor is always the embedded Apple root.
 *
 * @param {string} jwsString
 * @param {{ trustedRootDer?: Uint8Array | ArrayBuffer, now?: number | Date }} [options]
 */
export async function verifyAppleNotificationJws(jwsString, options = {}) {
  const { header, signedData, signature, payloadB64 } = splitJws(jwsString);
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2 || x5c.length > 3) {
    throw new Error("JWS header must carry an x5c chain of 2 or 3 certificates");
  }

  const rootDer = options.trustedRootDer ? toDer(options.trustedRootDer) : b64Decode(APPLE_ROOT_CA_G3_B64);
  const certDers = x5c.map(b64Decode);
  if (x5c.length === 3 && !bytesEqual(certDers[2], rootDer)) {
    throw new Error("Certificate chain does not terminate at the trusted Apple root");
  }

  const root = parseCertificate(rootDer);
  const intermediate = parseCertificate(certDers[1]);
  const leaf = parseCertificate(certDers[0]);

  if (!intermediate.extensions.has(APPLE_WWDR_INTERMEDIATE_OID)) {
    throw new Error("Intermediate certificate is missing the Apple WWDR marker");
  }
  if (!isCa(intermediate)) throw new Error("Intermediate certificate is not a CA");
  if (!leaf.extensions.has(APPLE_LEAF_OID)) {
    throw new Error("Leaf certificate is missing the Apple App Store marker");
  }
  if (isCa(leaf)) throw new Error("Leaf certificate must not be a CA");
  if (leaf.curve.name !== "P-256") throw new Error("Leaf key must be P-256 for ES256");

  await verifyIssuedBy(intermediate, root, "Intermediate");
  await verifyIssuedBy(leaf, intermediate, "Leaf");

  const leafKey = await importKey(leaf);
  const jwsValid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, leafKey, signature, signedData);
  if (!jwsValid) throw new Error("JWS signature verification failed");

  const payload = decodePayload(payloadB64);
  const nowMs = options.now === undefined ? Date.now() : Number(options.now);
  const signedDate = Number(payload.signedDate);
  const at = Number.isFinite(signedDate) && signedDate > 0 ? signedDate : nowMs;
  checkValidity(leaf, at, "Leaf");
  checkValidity(intermediate, at, "Intermediate");
  checkValidity(root, at, "Root");

  return { payload, leafKey };
}

/**
 * Verify an inner JWS (e.g. signedTransactionInfo).  It must be ES256 and
 * verify with the leaf key already trusted from the outer notification.  If
 * Apple signed it with a different leaf, it is accepted only when its own
 * x5c chain passes the same full verification as the outer notification.
 *
 * @param {string} jwsString
 * @param {CryptoKey} publicKey
 * @param {{ trustedRootDer?: Uint8Array | ArrayBuffer, now?: number | Date }} [options]
 */
export async function verifyInnerJws(jwsString, publicKey, options = {}) {
  const { header, signedData, signature, payloadB64 } = splitJws(jwsString);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signature, signedData);
  if (valid) return decodePayload(payloadB64);
  if (Array.isArray(header.x5c)) {
    return (await verifyAppleNotificationJws(jwsString, options)).payload;
  }
  throw new Error("Inner JWS signature verification failed");
}
