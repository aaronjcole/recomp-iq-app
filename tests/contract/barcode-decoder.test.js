import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import zxingLibrary from "@zxing/library";
import zxingBrowser from "@zxing/browser";

/**
 * Both packages ship a CommonJS `main`, and how much of it Node can expose as
 * named ESM imports varies between releases — @zxing/library 0.21.x permits
 * `import { BarcodeFormat }`, 0.23.x does not. Vite resolves the `module`
 * field and is unaffected either way, so a named-import failure here would be
 * a fact about Node's CJS interop rather than about the app. Interop is
 * normalized once, so the tests below measure decoding rather than packaging.
 */
function interop(mod) {
  return mod?.default && !mod.BarcodeFormat && !mod.BrowserMultiFormatReader ? mod.default : mod;
}

const {
  MultiFormatReader,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  DecodeHintType,
  BarcodeFormat,
  NotFoundException,
} = interop(zxingLibrary);
const { BrowserMultiFormatReader } = interop(zxingBrowser);

/**
 * Decoder coverage for the barcode scanner.
 *
 * `src/components/nutrition/BarcodeScanner.jsx` is the only consumer of
 * `@zxing/library` and `@zxing/browser`, and before this file nothing in the
 * suite decoded a barcode. That meant CI went green on a ZXing upgrade that
 * broke scanning outright — which matters because both packages are pre-1.0,
 * where the minor position carries breaking changes, and they are versioned
 * separately, so each is exercised here on its own.
 *
 * Barcodes are generated from the EAN/UPC specification rather than loaded as
 * image fixtures, so every expected string is derived from the encoding rules
 * instead of asserted against a blob nobody can re-derive. Check digits are
 * recomputed, so a typo'd fixture fails as a bad fixture rather than
 * masquerading as a decoder regression.
 *
 * The camera is the only part not covered. `decodeFromConstraints` needs
 * `getUserMedia` and a real `<video>`, so its presence is asserted but its
 * streaming behavior is not: a scan on a device remains unproven by CI.
 */

// --- EAN/UPC symbology -----------------------------------------------------

const L_CODE = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G_CODE = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R_CODE = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];

// Which of the first six digits use G-code instead of L-code, selected by the
// leading digit. This is how EAN-13 encodes a 13th digit into 12 digits' worth
// of modules.
const PARITY = ["000000", "001011", "001101", "001110", "010011", "011001", "011100", "010101", "010110", "011010"];

const GUARD_EDGE = "101";
const GUARD_CENTER = "01010";

/** EAN-13 check digit: weights alternate 1,3 across the first twelve digits. */
function ean13CheckDigit(first12) {
  const sum = [...first12].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/** EAN-8 check digit: weights alternate 3,1 across the first seven digits. */
function ean8CheckDigit(first7) {
  const sum = [...first7].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

function ean13Modules(code) {
  const d = [...code].map(Number);
  const parity = PARITY[d[0]];
  let out = GUARD_EDGE;
  for (let i = 1; i <= 6; i++) out += (parity[i - 1] === "0" ? L_CODE : G_CODE)[d[i]];
  out += GUARD_CENTER;
  for (let i = 7; i <= 12; i++) out += R_CODE[d[i]];
  return out + GUARD_EDGE;
}

function ean8Modules(code) {
  const d = [...code].map(Number);
  let out = GUARD_EDGE;
  for (let i = 0; i < 4; i++) out += L_CODE[d[i]];
  out += GUARD_CENTER;
  for (let i = 4; i < 8; i++) out += R_CODE[d[i]];
  return out + GUARD_EDGE;
}

// --- Rendering -------------------------------------------------------------

/**
 * Render a module string to a grayscale raster with quiet zones. Real quiet
 * zones matter: ZXing refuses to locate a symbol without them, so omitting
 * them would make every test below fail for a reason unrelated to decoding.
 */
function bitmapFor(modules, { moduleWidth = 3, height = 60, quietModules = 12 } = {}) {
  const width = (modules.length + quietModules * 2) * moduleWidth;
  const luminances = new Uint8ClampedArray(width * height).fill(255);
  for (let m = 0; m < modules.length; m++) {
    if (modules[m] !== "1") continue;
    for (let sub = 0; sub < moduleWidth; sub++) {
      const column = (quietModules + m) * moduleWidth + sub;
      for (let row = 0; row < height; row++) luminances[row * width + column] = 0;
    }
  }
  return new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminances, width, height)));
}

// The exact format set BarcodeScanner.jsx narrows to. The static contract test
// at the bottom asserts the component still requests these same four.
const FOOD_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];

function foodHints(formats = FOOD_FORMATS) {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
  return hints;
}

/**
 * Decode through the same class and hint plumbing the component uses:
 * `new BrowserMultiFormatReader(hints)`, whose `decodeBitmap` routes to
 * `decodeWithState` and honors the constructor hints. Only the camera source
 * differs.
 */
function decodeAsComponent(modules, { formats, ...render } = {}) {
  const reader = new BrowserMultiFormatReader(foodHints(formats));
  return reader.decodeBitmap(bitmapFor(modules, render));
}

// --- Fixtures --------------------------------------------------------------

// Real retail codes, so a maintainer can sanity-check them against a physical
// package. Each check digit is recomputed below rather than trusted.
const EAN13 = "5000159484695";
const EAN8 = "96385074";
const UPC_A_AS_EAN13 = "0038000138416";

// --- Fixture integrity -----------------------------------------------------

test("barcode fixtures carry valid check digits", () => {
  assert.equal(String(ean13CheckDigit(EAN13.slice(0, 12))), EAN13[12], "EAN-13 fixture check digit");
  assert.equal(String(ean8CheckDigit(EAN8.slice(0, 7))), EAN8[7], "EAN-8 fixture check digit");
  assert.equal(
    String(ean13CheckDigit(UPC_A_AS_EAN13.slice(0, 12))),
    UPC_A_AS_EAN13[12],
    "UPC-A fixture check digit"
  );
});

// --- The decode oracle, through the component's own code path --------------

test("an EAN-13 symbol decodes to its digits", () => {
  const result = decodeAsComponent(ean13Modules(EAN13));
  assert.equal(result.getText(), EAN13);
  assert.equal(result.getBarcodeFormat(), BarcodeFormat.EAN_13);
});

test("an EAN-8 symbol decodes to its digits", () => {
  const result = decodeAsComponent(ean8Modules(EAN8));
  assert.equal(result.getText(), EAN8);
  assert.equal(result.getBarcodeFormat(), BarcodeFormat.EAN_8);
});

test("a UPC-A symbol decodes as UPC_A with the leading zero stripped", () => {
  // The case most likely to break silently on an upgrade. A UPC-A code is an
  // EAN-13 whose leading digit is 0, and ZXing reports it as twelve digits,
  // not thirteen. That twelve-digit string is what reaches `barcodeLookup` and
  // therefore Open Food Facts, so a change in this normalization turns every
  // US-packaged product into a failed lookup while the scanner still appears
  // to work.
  const result = decodeAsComponent(ean13Modules(UPC_A_AS_EAN13));
  assert.equal(result.getBarcodeFormat(), BarcodeFormat.UPC_A);
  assert.equal(result.getText(), "038000138416");
  assert.equal(result.getText().length, 12);
  assert.equal(result.getText(), UPC_A_AS_EAN13.slice(1));
});

test("decoding survives the range of module widths a camera produces", () => {
  // A phone held closer or further away changes how many pixels each module
  // covers. Decoding at exactly one scale would pass even if the binarizer
  // regressed for every realistic framing but one.
  for (const moduleWidth of [2, 3, 4, 6]) {
    const result = decodeAsComponent(ean13Modules(EAN13), { moduleWidth });
    assert.equal(result.getText(), EAN13, `module width ${moduleWidth}`);
  }
});

// --- Negative controls -----------------------------------------------------
//
// Without these, every assertion above would still pass if the decoder were
// replaced by something that echoed back the code it was handed. These prove
// it is reading the image.

test("a blank image is not decoded as a barcode", () => {
  const blank = new BinaryBitmap(
    new HybridBinarizer(new RGBLuminanceSource(new Uint8ClampedArray(400 * 60).fill(255), 400, 60))
  );
  assert.throws(() => new BrowserMultiFormatReader(foodHints()).decodeBitmap(blank), NotFoundException);
});

test("a corrupted symbol is rejected rather than misread", () => {
  // Invert the center guard. The result still looks like a barcode, which
  // separates "found no symbol at all" from "decoded whatever was there".
  const modules = ean13Modules(EAN13);
  const centerStart = GUARD_EDGE.length + 42;
  const corrupted =
    modules.slice(0, centerStart) + "10101" + modules.slice(centerStart + GUARD_CENTER.length);
  assert.notEqual(corrupted, modules, "corruption must actually change the symbol");
  assert.throws(() => decodeAsComponent(corrupted), NotFoundException);
});

test("POSSIBLE_FORMATS restricts which symbologies decode", () => {
  // BarcodeScanner.jsx narrows to four food formats specifically to keep
  // per-frame decoding fast enough for iOS Safari to keep up with the camera
  // stream. If this hint stopped being honored, that comment would become
  // false and frame rate would quietly collapse on device — something no other
  // test can observe.
  const modules = ean13Modules(EAN13);
  assert.equal(decodeAsComponent(modules).getText(), EAN13, "decodes under the food formats");
  assert.throws(
    () => decodeAsComponent(modules, { formats: [BarcodeFormat.QR_CODE] }),
    NotFoundException,
    "an EAN-13 must not decode when only QR is permitted"
  );
});

// --- @zxing/library, exercised independently of @zxing/browser -------------

test("the library reader honors hints passed to decode()", () => {
  // Covers @zxing/library on its own, since it versions separately from
  // @zxing/browser and can regress without it.
  //
  // Note the trap for anyone extending this file: the single-argument
  // `decode(image)` explicitly resets hints to null (MultiFormatReader.js),
  // so `setHints(...)` followed by `decode(image)` silently decodes every
  // supported symbology. Hints must be passed to `decode` directly, or set via
  // `setHints` and used through `decodeWithState`.
  const reader = new MultiFormatReader();
  assert.equal(
    reader.decode(bitmapFor(ean13Modules(EAN13)), foodHints()).getText(),
    EAN13
  );
  assert.throws(
    () => new MultiFormatReader().decode(bitmapFor(ean13Modules(EAN13)), foodHints([BarcodeFormat.QR_CODE])),
    NotFoundException
  );
});

// --- API surface the component depends on ----------------------------------

test("@zxing/browser still exposes the streaming API the scanner calls", () => {
  // The camera path itself cannot run here, so this asserts only that the
  // method the component calls still exists with the name it calls.
  const reader = new BrowserMultiFormatReader(foodHints());
  assert.equal(typeof reader.decodeFromConstraints, "function");
  assert.equal(typeof reader.decodeBitmap, "function");
});

test("a decode result exposes getText, which the scan callback calls", () => {
  const result = decodeAsComponent(ean13Modules(EAN13));
  assert.equal(typeof result.getText, "function");
  assert.equal(typeof result.getBarcodeFormat, "function");
});

test("the scanner component still uses the API this file covers", () => {
  // Guards the inverse failure: this suite staying green while
  // BarcodeScanner.jsx moves to a different API and goes untested.
  const source = readFileSync(
    new URL("../../src/components/nutrition/BarcodeScanner.jsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /from "@zxing\/browser"/);
  assert.match(source, /new BrowserMultiFormatReader\(/);
  assert.match(source, /DecodeHintType\.POSSIBLE_FORMATS/);
  assert.match(source, /decodeFromConstraints/);
  assert.match(source, /\.getText\(\)/);
  for (const format of ["EAN_13", "EAN_8", "UPC_A", "UPC_E"]) {
    assert.match(source, new RegExp(`BarcodeFormat\\.${format}\\b`), `scanner requests ${format}`);
  }
});
