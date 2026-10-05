#!/usr/bin/env sh
# Regenerates the TEST-ONLY certificate fixtures used by
# tests/security/apple-jws-verify.test.js. None of these keys or certificates
# are trusted in production; they mirror the shape of Apple's App Store chain:
#   P-384 root (self-signed, ecdsa-with-SHA384)
#   P-384 intermediate with the WWDR OID 1.2.840.113635.100.6.2.1, CA:TRUE
#   P-256 leaf with the App Store receipt-signing OID 1.2.840.113635.100.6.11.1,
#   signed by the intermediate with ecdsa-with-SHA384.
# Requires OpenSSL 3.x. Run: sh tests/fixtures/apple-jws/generate.sh
set -eu
cd "$(dirname "$0")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/ext.cnf" <<CNF
[ ca ]
default_ca = test_ca
[ test_ca ]
database = $WORK/index.txt
new_certs_dir = $WORK
serial = $WORK/serial
default_md = sha384
policy = any
unique_subject = no
copy_extensions = none
[ any ]
commonName = supplied
organizationName = optional
countryName = optional
[ root_ext ]
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
[ inter_ext ]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
1.2.840.113635.100.6.2.1 = ASN1:NULL
[ inter_noid_ext ]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
[ inter_notca_ext ]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
1.2.840.113635.100.6.2.1 = ASN1:NULL
[ leaf_ext ]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
1.2.840.113635.100.6.11.1 = ASN1:NULL
[ leaf_noid_ext ]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
CNF

# sign CSR ISSUER_CERT ISSUER_KEY EXT START END OUT
sign() {
  : > "$WORK/index.txt"
  openssl rand -hex 8 > "$WORK/serial"
  openssl ca -batch -config "$WORK/ext.cnf" -notext -in "$1" -cert "$2" -keyfile "$3" \
    -extensions "$4" -startdate "$5" -enddate "$6" -out "$7" 2>/dev/null
}

# selfsign KEY SUBJECT OUT
selfsign() {
  openssl req -new -key "$1" -subj "$2" -out "$WORK/self.csr"
  : > "$WORK/index.txt"
  openssl rand -hex 8 > "$WORK/serial"
  openssl ca -batch -selfsign -config "$WORK/ext.cnf" -notext -in "$WORK/self.csr" -keyfile "$1" \
    -extensions root_ext -startdate 20250101000000Z -enddate 20450101000000Z -out "$3" 2>/dev/null
}

openssl ecparam -name secp384r1 -genkey -noout -out "$WORK/root.key"
openssl ecparam -name secp384r1 -genkey -noout -out "$WORK/other-root.key"
openssl ecparam -name secp384r1 -genkey -noout -out "$WORK/inter.key"
openssl ecparam -name prime256v1 -genkey -noout -out "$WORK/leaf.key"
openssl pkcs8 -topk8 -nocrypt -in "$WORK/leaf.key" -out leaf-key.p8.pem

selfsign "$WORK/root.key" "/CN=Test Root CA - G3/O=RecompIQ Test" root.pem
# Same subject name, different key: a look-alike root that must not be trusted.
selfsign "$WORK/other-root.key" "/CN=Test Root CA - G3/O=RecompIQ Test" other-root.pem

openssl req -new -key "$WORK/inter.key" -subj "/CN=Test WWDR CA - G6/O=RecompIQ Test" -out "$WORK/inter.csr"
sign "$WORK/inter.csr" root.pem "$WORK/root.key" inter_ext 20250101000000Z 20400101000000Z intermediate.pem
sign "$WORK/inter.csr" root.pem "$WORK/root.key" inter_noid_ext 20250101000000Z 20400101000000Z intermediate-no-oid.pem
sign "$WORK/inter.csr" root.pem "$WORK/root.key" inter_notca_ext 20250101000000Z 20400101000000Z intermediate-not-ca.pem

openssl req -new -key "$WORK/leaf.key" -subj "/CN=Test StoreKit Signing/O=RecompIQ Test" -out "$WORK/leaf.csr"
sign "$WORK/leaf.csr" intermediate.pem "$WORK/inter.key" leaf_ext 20250101000000Z 20350101000000Z leaf.pem
sign "$WORK/leaf.csr" intermediate.pem "$WORK/inter.key" leaf_noid_ext 20250101000000Z 20350101000000Z leaf-no-oid.pem
sign "$WORK/leaf.csr" intermediate.pem "$WORK/inter.key" leaf_ext 20240101000000Z 20260101000000Z leaf-expired.pem
