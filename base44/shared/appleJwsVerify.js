// Apple App Store Server Notifications V2 — JWS signature + x5c chain verification.
//
// Apple sends notifications as a JWS whose header carries an x5c certificate
// chain that must terminate at Apple Root CA G3.  Without verifying both the
// signature and the chain, any caller could craft a payload and revoke user
// entitlements.  This module performs full verification using only the Web
// Crypto API (no external dependencies).

// Apple Root CA G3 (self-signed, valid until 2039-04-30).
// Source: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
const APPLE_ROOT_CA_G3_B64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS" +
  "QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u" +
  "QXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAG" +
  "ByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWm" +
  "BSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5d" +
  "vMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6" +
  "966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49" +
  "BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPU" +
  "nPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkL" +
  "F1vLUagM6BgD56KyKA==";

// --- Base64 helpers ---
function b64urlDecode(str) {
  const b64 = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64Decode(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// --- Minimal DER parser ---
function readDerLength(buf, pos) {
  const b = buf[pos];
  if (b < 0x80) return { length: b, next: pos + 1 };
  const numBytes = b & 0x7f;
  let length = 0;
  for (let i = 0; i < numBytes; i++) {
    length = (length << 8) | buf[pos + 1 + i];
  }
  return { length, next: pos + 1 + numBytes };
}

function readDerTLV(buf, pos) {
  const tag = buf[pos];
  const { length, next } = readDerLength(buf, pos + 1);
  const valueStart = next;
  const valueEnd = next + length;
  return { tag, start: pos, end: valueEnd, valueStart, valueEnd };
}

// Extract SubjectPublicKeyInfo TLV bytes from a DER-encoded X.509 certificate.
function extractSPKI(certDer) {
  const cert = readDerTLV(certDer, 0);
  if (cert.tag !== 0x30) throw new Error("Invalid certificate: expected SEQUENCE");

  const tbs = readDerTLV(certDer, cert.valueStart);

  // tbsCertificate fields: [version?] serialNumber signature issuer validity subject SPKI ...
  let p = tbs.valueStart;
  let elem = readDerTLV(certDer, p);

  // Skip optional version (context tag 0xA0)
  if (elem.tag === 0xa0) {
    p = elem.end;
    elem = readDerTLV(certDer, p);
  }

  // Skip serialNumber, signature, issuer, validity, subject (5 elements)
  for (let i = 0; i < 5; i++) {
    p = elem.end;
    elem = readDerTLV(certDer, p);
  }

  return certDer.subarray(elem.start, elem.end);
}

// Extract TBS Certificate bytes and signature from a DER-encoded X.509 certificate.
function extractTbsAndSignature(certDer) {
  const cert = readDerTLV(certDer, 0);
  if (cert.tag !== 0x30) throw new Error("Invalid certificate: expected SEQUENCE");

  const tbs = readDerTLV(certDer, cert.valueStart);
  const tbsBytes = certDer.subarray(tbs.start, tbs.end);

  let pos = tbs.end;
  const sigAlg = readDerTLV(certDer, pos);
  pos = sigAlg.end;
  const sigBitString = readDerTLV(certDer, pos);
  // BIT STRING: first content byte is unused-bits count; rest is the signature
  const signature = certDer.subarray(sigBitString.valueStart + 1, sigBitString.valueEnd);

  return { tbsBytes, signature, sigAlgBytes: certDer.subarray(sigAlg.start, sigAlg.end) };
}

// ECDSA with SHA-256 OID: 1.2.840.10045.4.3.2
const ES256_OID = [0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02];

function isEcdsaSha256(sigAlgBytes) {
  if (sigAlgBytes.length < ES256_OID.length) return false;
  for (let i = 0; i < ES256_OID.length; i++) {
    if (sigAlgBytes[i] !== ES256_OID[i]) return false;
  }
  return true;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function importEcdsaKey(spkiBytes) {
  return crypto.subtle.importKey(
    "spki",
    spkiBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
}

async function verifyCertSignedBy(certDer, issuerKey) {
  const { tbsBytes, signature, sigAlgBytes } = extractTbsAndSignature(certDer);
  if (!isEcdsaSha256(sigAlgBytes)) throw new Error("Unsupported certificate signature algorithm");
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, issuerKey, signature, tbsBytes);
}

/**
 * Verify an Apple App Store Server Notification V2 JWS: checks the x5c
 * certificate chain terminates at Apple Root CA G3 and that the JWS
 * signature is valid.  Returns the decoded payload and the leaf public
 * key (for verifying inner signedTransactionInfo / signedRenewalInfo).
 */
export async function verifyAppleNotificationJws(jwsString) {
  const parts = String(jwsString).split(".");
  if (parts.length < 3) throw new Error("Invalid JWS: expected 3 parts");

  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
  const signedData = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const signature = b64urlDecode(parts[2]);

  if (header.alg !== "ES256") throw new Error("Unsupported JWS algorithm: " + header.alg);
  if (!Array.isArray(header.x5c) || header.x5c.length < 2) {
    throw new Error("JWS header missing x5c certificate chain");
  }

  const certs = header.x5c.map(b64Decode);
  const rootCertDer = b64Decode(APPLE_ROOT_CA_G3_B64);

  // If the last cert in x5c is not the root itself, verify it chains to root.
  if (!bytesEqual(certs[certs.length - 1], rootCertDer)) {
    const rootKey = await importEcdsaKey(extractSPKI(rootCertDer));
    const signedByRoot = await verifyCertSignedBy(certs[certs.length - 1], rootKey);
    if (!signedByRoot) throw new Error("Certificate chain does not terminate at Apple Root CA G3");
    certs.push(rootCertDer);
  }

  // Verify each certificate is signed by the next one in the chain.
  for (let i = 0; i < certs.length - 1; i++) {
    const issuerKey = await importEcdsaKey(extractSPKI(certs[i + 1]));
    const valid = await verifyCertSignedBy(certs[i], issuerKey);
    if (!valid) throw new Error("Certificate chain verification failed at index " + i);
  }

  // Verify the JWS signature using the leaf certificate's public key.
  const leafKey = await importEcdsaKey(extractSPKI(certs[0]));
  const jwsValid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    leafKey,
    signature,
    signedData
  );
  if (!jwsValid) throw new Error("JWS signature verification failed");

  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  return { payload, leafKey };
}

/**
 * Verify an inner JWS (e.g. signedTransactionInfo) using a public key
 * already trusted from the outer notification's verified certificate chain.
 */
export async function verifyInnerJws(jwsString, publicKey) {
  const parts = String(jwsString).split(".");
  if (parts.length < 3) throw new Error("Invalid inner JWS");
  const signedData = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const signature = b64urlDecode(parts[2]);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signature,
    signedData
  );
  if (!valid) throw new Error("Inner JWS signature verification failed");
  return JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
}