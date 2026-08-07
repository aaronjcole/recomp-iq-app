import assert from "node:assert/strict";
import test from "node:test";
import {
  VisualComparisonError,
  buildVisualComparison
} from "../../src/lib/fitness/visualProgress.js";

const first = {
  id: "photo-a",
  userId: "user-1",
  date: "2026-07-01",
  pose: "Front",
  weight_lbs: 184,
  note: "private note"
};

const second = {
  id: "photo-b",
  userId: "user-1",
  date: "2026-08-01",
  pose: "Front",
  weight_lbs: 180.5,
  note: "another private note"
};

test("visual progress orders photos and returns descriptive comparison context", () => {
  const result = buildVisualComparison(second, first);

  assert.equal(result.earlierId, "photo-a");
  assert.equal(result.laterId, "photo-b");
  assert.equal(result.daysApart, 31);
  assert.equal(result.weightDeltaLbs, -3.5);
  assert.equal(result.poseMatch, true);
  assert.equal(result.readiness, "ready");
  assert.equal(Object.hasOwn(result, "note"), false);
  assert.equal(JSON.stringify(result).includes("private note"), false);
});

test("mismatched poses produce alignment guidance instead of an estimate", () => {
  const result = buildVisualComparison(first, {
    ...second,
    pose: "Side",
    weight_lbs: null
  });

  assert.equal(result.poseMatch, false);
  assert.equal(result.weightDeltaLbs, null);
  assert.equal(result.readiness, "needs_alignment");
  assert.match(result.guidance.join(" "), /same pose/i);
  assert.equal(Object.hasOwn(result, "bodyFatPercentage"), false);
  assert.equal(Object.hasOwn(result, "leanMass"), false);
});

test("short intervals stay descriptive and ask for more time", () => {
  const result = buildVisualComparison(first, {
    ...second,
    date: "2026-07-05"
  });

  assert.equal(result.daysApart, 4);
  assert.equal(result.readiness, "early");
  assert.match(result.guidance.join(" "), /short interval/i);
});

test("visual comparison rejects the same photo, invalid dates, and cross-account metadata", () => {
  assert.throws(() => buildVisualComparison(first, first), (error) => error instanceof VisualComparisonError);
  assert.throws(
    () => buildVisualComparison(first, { ...second, date: "08/01/2026" }),
    (error) => error instanceof VisualComparisonError
  );
  assert.throws(
    () => buildVisualComparison(first, { ...second, userId: "user-2" }),
    (error) => error instanceof VisualComparisonError
  );
});
