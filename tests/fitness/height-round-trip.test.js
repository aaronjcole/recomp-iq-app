import test from "node:test";
import assert from "node:assert/strict";
import {
  CM_PER_INCH,
  cmToStoredInches,
  feetInchesToStored,
  splitFeetInches,
  storedInchesToCm
} from "../../src/lib/heightConversion.js";
import { BIOMETRIC_RANGES } from "../../src/lib/biometricRanges.js";

// The bounds of the metric height input in StepAbout.
const CM_MIN = 92;
const CM_MAX = 274;

test("every metric height redisplays as the value the user typed", () => {
  const drifted = [];
  for (let cm = CM_MIN; cm <= CM_MAX; cm++) {
    const shown = storedInchesToCm(cmToStoredInches(cm));
    if (shown !== cm) drifted.push(`${cm}->${shown}`);
  }
  assert.deepEqual(drifted, [], `metric heights changed under their own round-trip: ${drifted}`);
});

test("storing whole inches would drift, which is why tenths are stored", () => {
  // Pins the reason for the precision: one inch spans 2.54 cm, so whole inches
  // cannot represent every centimetre. This is the behaviour that was fixed.
  const wholeInch = (cm) => Math.round(cm / CM_PER_INCH);
  let drifted = 0;
  for (let cm = CM_MIN; cm <= CM_MAX; cm++) {
    if (storedInchesToCm(wholeInch(cm)) !== cm) drifted++;
  }
  assert.ok(drifted > 100, `expected whole-inch storage to drift badly, saw ${drifted}`);
});

test("feet and inches never render a 12-inch remainder", () => {
  const bad = [];
  for (let cm = CM_MIN; cm <= CM_MAX; cm++) {
    const { ft, inch } = splitFeetInches(cmToStoredInches(cm));
    if (!Number.isInteger(inch) || inch < 0 || inch > 11) bad.push(`${cm}cm -> ${ft}ft ${inch}in`);
  }
  assert.deepEqual(bad, [], `invalid inch remainder: ${bad}`);
});

test("a stored fraction splits to the nearest whole inch, carrying into feet", () => {
  assert.deepEqual(splitFeetInches(71.7), { ft: 6, inch: 0 }, "71.7in must carry, not read 5ft 12in");
  assert.deepEqual(splitFeetInches(69.7), { ft: 5, inch: 10 });
  assert.deepEqual(splitFeetInches(68), { ft: 5, inch: 8 });
  assert.deepEqual(splitFeetInches(72), { ft: 6, inch: 0 });
  assert.deepEqual(splitFeetInches("70"), { ft: 5, inch: 10 }, "accepts the stored string form");
});

test("the imperial selects round-trip through feet and inches losslessly", () => {
  for (let total = BIOMETRIC_RANGES.height_in[0]; total <= BIOMETRIC_RANGES.height_in[1]; total++) {
    const { ft, inch } = splitFeetInches(total);
    assert.equal(feetInchesToStored(ft, inch), total, `${total}in did not survive the split`);
    assert.equal(feetInchesToStored(String(ft), String(inch)), total, "string inputs must coerce");
  }
});

test("a metric entry inside the inch range stays inside it", () => {
  const [min, max] = BIOMETRIC_RANGES.height_in;
  for (let cm = CM_MIN; cm <= CM_MAX; cm++) {
    const stored = cmToStoredInches(cm);
    assert.ok(Number.isFinite(stored), `${cm}cm produced a non-finite height`);
    const asCm = storedInchesToCm(stored);
    if (stored >= min && stored <= max) {
      assert.ok(asCm >= CM_MIN && asCm <= CM_MAX, `${cm}cm -> ${stored}in left the cm range`);
    }
  }
});
