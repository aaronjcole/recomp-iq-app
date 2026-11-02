import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { ENTITY_FIXTURES } from "./support/fixtures.js";

// Training progression: last time and a conservative next target in the live
// workout, PRs called out on save, per-exercise history with volume, and
// plateau advice that accounts for recovery.

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const e1rm = (weight, reps) => Math.round(weight * (1 + reps / 30));

function bench(id, daysAgo, weight, reps, name = "Bench Press") {
  return { id, date: isoDaysAgo(daysAgo), lift_name: name, weight, reps, sets: 3, estimated_1rm: e1rm(weight, reps) };
}

function benchSession(id, daysAgo, weight, reps) {
  return {
    id,
    date: isoDaysAgo(daysAgo),
    type: "strength",
    title: "Push",
    duration_minutes: 50,
    sets: [1, 2, 3].map((index) => ({ exercise_name: "Bench Press", weight_lbs: weight, reps, set_index: index }))
  };
}

function dataset({ strengthLogs, sessions = [], sleepHours } = {}) {
  return {
    ...ENTITY_FIXTURES,
    StrengthLog: strengthLogs,
    ExerciseSession: sessions,
    ...(sleepHours === undefined
      ? {}
      : { DailyLog: ENTITY_FIXTURES.DailyLog.map((log) => ({ ...log, sleep_hours: sleepHours, energy_rating: 2 })) })
  };
}

const progressing = [bench("b1", 9, 180, 6), bench("b2", 5, 185, 5), bench("b3", 2, 185, 6, "bench press")];

test("the live workout shows last time and a next target, and Fill uses it", async ({ page }) => {
  await installAuthenticatedBase44(page, { entities: dataset({ strengthLogs: progressing }) });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/training");

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.getByRole("button", { name: "Add exercise" }).click();
  // Typed differently from history; it still matches.
  await page.getByPlaceholder("Exercise name").fill("BENCH press");

  const suggestion = page.getByTestId("lift-suggestion");
  await expect(suggestion).toContainText("185 × 6 · 3 sets");
  await expect(suggestion).toContainText("Try: 185 × 7");
  await suggestion.getByRole("button", { name: "Fill 185 × 7" }).click();
  await expect(page.getByPlaceholder("135")).toHaveValue("185");
  await expect(page.getByPlaceholder("8")).toHaveValue("7");
  assertNoPageErrors();
});

test("saving a workout that beats the best e1RM calls out the PR", async ({ page }) => {
  const { entities } = await installAuthenticatedBase44(page, { entities: dataset({ strengthLogs: progressing }) });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/training");

  await page.getByRole("button", { name: "Start workout" }).click();
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByPlaceholder("Exercise name").fill("Bench Press");
  await page.getByPlaceholder("135").fill("195");
  await page.getByPlaceholder("8").fill("6");
  await page.getByRole("button", { name: "Finish workout" }).click();
  await page.getByRole("button", { name: "Save workout" }).click();

  await expect(page.getByText("Workout saved: new PR")).toBeVisible();
  await expect(page.getByText(`Bench Press: e1RM ${e1rm(195, 6)} lb (was ${e1rm(185, 6)})`)).toBeVisible();
  await expect.poll(() => (entities.StrengthLog ?? []).filter((row) => row.weight === 195).length).toBe(1);
  assertNoPageErrors();
});

test("an exercise's history lists every session with PRs and weekly volume", async ({ page }) => {
  await installAuthenticatedBase44(page, {
    entities: dataset({
      strengthLogs: progressing,
      sessions: [benchSession("s1", 9, 180, 6), benchSession("s2", 5, 185, 5), benchSession("s3", 2, 185, 6)]
    })
  });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/training");

  // Both spellings are one lift.
  await page.getByRole("button", { name: "bench press history" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("3 sessions");
  // 180 × 6 and 185 × 5 are the same e1RM (216); only 185 × 6 (222) beat it.
  await expect(sheet.getByText("PR", { exact: true })).toHaveCount(1);
  await expect(sheet.getByRole("listitem").filter({ hasText: "PR" }).filter({ hasText: "185 lb × 6" })).toHaveCount(1);
  await expect(sheet).toContainText("Weekly volume");
  await expect(sheet).toContainText("Next session");
  await expect(sheet).toContainText("185 lb × 7");
  assertNoPageErrors();
});

test("a plateau with poor recovery suggests a lighter session", async ({ page }) => {
  await installAuthenticatedBase44(page, {
    entities: dataset({
      strengthLogs: [bench("p1", 8, 185, 5), bench("p2", 5, 185, 5), bench("p3", 2, 185, 5)],
      sleepHours: 5
    })
  });
  const assertNoPageErrors = watchPageErrors(page);
  await page.goto("/training");
  await expect(page.getByText("Plateaued")).toBeVisible();
  await expect(page.getByText("Next: 167.5 lbs × 5. Stalled for 3 sessions and recovery is poor.", { exact: false })).toBeVisible();
  assertNoPageErrors();
});
