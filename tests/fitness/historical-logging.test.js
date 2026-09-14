import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isValidLocalDate,
  sanitizeDateParam,
  addDaysStr,
  formatLongDate,
  formatShortDate,
  computeSessionDateMoveEffects,
  todayStr
} from "../../src/lib/loggingDateUtils.js";

function readSrc(relPath) {
  return readFileSync(join(process.cwd(), relPath), "utf8");
}

// --- Utility function tests ---

test("isValidLocalDate rejects malformed and impossible dates", () => {
  assert.ok(isValidLocalDate("2024-01-15"));
  assert.ok(isValidLocalDate("2024-02-29")); // leap year
  // Malformed
  assert.ok(!isValidLocalDate("2024-1-5"));
  assert.ok(!isValidLocalDate("01-15-2024"));
  assert.ok(!isValidLocalDate("2024/01/15"));
  assert.ok(!isValidLocalDate(""));
  assert.ok(!isValidLocalDate(null));
  assert.ok(!isValidLocalDate(20240115));
  // Impossible calendar dates
  assert.ok(!isValidLocalDate("2024-02-30"));
  assert.ok(!isValidLocalDate("2024-13-01"));
  assert.ok(!isValidLocalDate("2024-00-10"));
  assert.ok(!isValidLocalDate("2024-01-32"));
  // Future dates are rejected
  const future = new Date();
  future.setDate(future.getDate() + 1);
  const futureStr = future.toISOString().slice(0, 10);
  assert.ok(!isValidLocalDate(futureStr));
});

test("sanitizeDateParam falls back to today for invalid or future dates", () => {
  assert.strictEqual(sanitizeDateParam("2024-01-15"), "2024-01-15");
  assert.strictEqual(sanitizeDateParam("garbage"), todayStr());
  assert.strictEqual(sanitizeDateParam(""), todayStr());
  assert.strictEqual(sanitizeDateParam(null), todayStr());
  assert.strictEqual(sanitizeDateParam(undefined), todayStr());
  const future = new Date();
  future.setDate(future.getDate() + 1);
  const futureStr = future.toISOString().slice(0, 10);
  assert.strictEqual(sanitizeDateParam(futureStr), todayStr());
});

test("addDaysStr handles forward, backward, and month boundaries", () => {
  assert.strictEqual(addDaysStr("2024-01-15", 1), "2024-01-16");
  assert.strictEqual(addDaysStr("2024-01-15", -1), "2024-01-14");
  assert.strictEqual(addDaysStr("2024-01-31", 1), "2024-02-01");
  assert.strictEqual(addDaysStr("2024-02-28", 1), "2024-02-29"); // leap year
  assert.strictEqual(addDaysStr("2024-12-31", 1), "2025-01-01");
  assert.strictEqual(addDaysStr("2024-03-01", -1), "2024-02-29"); // leap year backward
  assert.strictEqual(addDaysStr("2024-01-15", 0), "2024-01-15");
});

test("formatLongDate and formatShortDate produce human-readable labels", () => {
  const long = formatLongDate("2024-01-15");
  assert.ok(long.includes("January"));
  assert.ok(long.includes("15"));
  assert.ok(long.includes("Monday"));

  const short = formatShortDate("2024-01-15");
  assert.ok(short.includes("Jan"));
  assert.ok(short.includes("15"));
  assert.ok(short.includes("Mon"));
});

// --- computeSessionDateMoveEffects ---

test("computeSessionDateMoveEffects returns null when the date is unchanged", () => {
  assert.strictEqual(computeSessionDateMoveEffects("2024-01-15", "2024-01-15", []), null);
  assert.strictEqual(computeSessionDateMoveEffects(null, "2024-01-15", []), null);
  assert.strictEqual(computeSessionDateMoveEffects("2024-01-15", null, []), null);
});

test("computeSessionDateMoveEffects clears old marker when no sessions remain on old date", () => {
  const sessions = [
    { id: "a", date: "2024-01-14" },
    { id: "b", date: "2024-01-16" }
  ];
  const result = computeSessionDateMoveEffects("2024-01-15", "2024-01-20", sessions);
  assert.ok(result);
  assert.strictEqual(result.oldDate, "2024-01-15");
  assert.strictEqual(result.newDate, "2024-01-20");
  assert.strictEqual(result.shouldClearOld, true);
});

test("computeSessionDateMoveEffects keeps old marker when another session remains on old date", () => {
  const sessions = [
    { id: "a", date: "2024-01-15" },
    { id: "b", date: "2024-01-15" },
    { id: "c", date: "2024-01-16" }
  ];
  const result = computeSessionDateMoveEffects("2024-01-15", "2024-01-20", sessions);
  assert.ok(result);
  assert.strictEqual(result.shouldClearOld, false);
});

// --- Component source-code contract tests ---

test("Today page reads the selected date from useLoggingDate and finds the matching log", () => {
  const src = readSrc("src/pages/Today.jsx");
  assert.ok(src.includes("useLoggingDate"), "Today.jsx should import useLoggingDate");
  assert.ok(
    /logs\.find\(\s*\(?\s*l\s*\)?\s*=>\s*l\.date\s*===\s*selectedDate/.test(src) ||
    /selectedLog/.test(src),
    "Today.jsx should find the log matching selectedDate"
  );
});

test("QuickLogSheet accepts a date prop and saves to that date", () => {
  const src = readSrc("src/components/today/QuickLogSheet.jsx");
  assert.ok(
    /date\s*=\s*todayStr\(\)/.test(src),
    "QuickLogSheet should accept a date prop defaulting to todayStr()"
  );
  assert.ok(
    /upsertDailyLog\(\s*date\b/.test(src),
    "QuickLogSheet should call upsertDailyLog with the date prop"
  );
});

test("HabitsCard accepts a date prop and uses it for habit entries", () => {
  const src = readSrc("src/components/today/HabitsCard.jsx");
  assert.ok(
    /date\s*=\s*todayStr\(\)/.test(src),
    "HabitsCard should accept a date prop defaulting to todayStr()"
  );
  // The prop is aliased to `today` internally; upsertHabitEntry should use it.
  assert.ok(
    /const today = date/.test(src),
    "HabitsCard should alias the date prop to today"
  );
  assert.ok(
    /upsertHabitEntry\(\s*habit\.id,\s*today/.test(src),
    "HabitsCard should call upsertHabitEntry with the today alias"
  );
});

test("Nutrition page reads the selected date from useLoggingDate", () => {
  const src = readSrc("src/pages/Nutrition.jsx");
  assert.ok(src.includes("useLoggingDate"), "Nutrition.jsx should import useLoggingDate");
  assert.ok(
    /selectedDate/.test(src),
    "Nutrition.jsx should reference selectedDate"
  );
});

test("FoodDiaryCard accepts a date prop and filters entries by it", () => {
  const src = readSrc("src/components/nutrition/FoodDiaryCard.jsx");
  assert.ok(
    /date\s*=\s*todayStr\(\)/.test(src),
    "FoodDiaryCard should accept a date prop defaulting to todayStr()"
  );
  // The prop is aliased to `today` internally; entries are filtered by it.
  assert.ok(
    /const today = date/.test(src),
    "FoodDiaryCard should alias the date prop to today"
  );
  assert.ok(
    /entry\.date\s*===\s*today/.test(src),
    "FoodDiaryCard should filter entries by the today alias"
  );
});

test("MealTemplatesCard accepts a date prop and passes it to logMealTemplate", () => {
  const src = readSrc("src/components/nutrition/MealTemplatesCard.jsx");
  assert.ok(
    /date\s*=\s*todayStr\(\)/.test(src),
    "MealTemplatesCard should accept a date prop defaulting to todayStr()"
  );
  assert.ok(
    /logMealTemplate\(\s*t(?:pl)?\s*,\s*date/.test(src),
    "MealTemplatesCard should pass date to logMealTemplate"
  );
});

test("SessionEditSheet has a date field and passes the edited date to updateSession", () => {
  const src = readSrc("src/components/training/SessionEditSheet.jsx");
  assert.ok(
    /date:\s*session\??\.date/.test(src),
    "sessionToEditState should include a date field from the session"
  );
  assert.ok(
    /date:\s*state\.date/.test(src),
    "handleSave should pass state.date to updateSession"
  );
});

test("SessionBuilder always marks the daily log for the session's date", () => {
  const src = readSrc("src/lib/RecompContext.jsx");
  assert.ok(
    /upsertDailyLog\(\s*session\.date/.test(src),
    "saveTrainingSession should call upsertDailyLog with session.date"
  );
});

test("updateSession in RecompContext handles date changes with marker updates", () => {
  const src = readSrc("src/lib/RecompContext.jsx");
  assert.ok(
    /computeSessionDateMoveEffects/.test(src),
    "updateSession should call computeSessionDateMoveEffects"
  );
  assert.ok(
    /shouldClearOld/.test(src),
    "updateSession should check shouldClearOld from the effects"
  );
});

test("logMealTemplate in RecompContext accepts a date parameter", () => {
  const src = readSrc("src/lib/RecompContext.jsx");
  assert.match(
    src,
    /logMealTemplate[\s\S]*?date[\s\S]*?todayStr/,
    "logMealTemplate should accept a date parameter defaulting to todayStr"
  );
  assert.doesNotMatch(
    src,
    /logMealTemplate\s*=\s*useCallback\(\s*async\s*\(template\)\s*=>/,
    "logMealTemplate should not have the old single-arg signature"
  );
});

test("AppLayout wraps content with LoggingDateProvider", () => {
  const src = readSrc("src/components/AppLayout.jsx");
  assert.ok(
    src.includes("LoggingDateProvider"),
    "AppLayout should import and use LoggingDateProvider"
  );
});

test("LoggingDatePicker disables future dates and has 44px tap targets", () => {
  const src = readSrc("src/components/LoggingDatePicker.jsx");
  assert.ok(
    /disabled=\s*\{?\s*isToday/.test(src),
    "Next-day button should be disabled when isToday"
  );
  assert.ok(
    /min-h-11/.test(src),
    "LoggingDatePicker should have min-h-11 (44px) tap targets"
  );
  assert.ok(
    src.includes("useLoggingDate"),
    "LoggingDatePicker should use useLoggingDate"
  );
});