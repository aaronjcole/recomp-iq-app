import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44 } from "./support/base44.js";
import { AUTH_USER, ENTITY_FIXTURES } from "./support/fixtures.js";
import {
  addDaysStr,
  formatLongDate,
  getCurrentWeekStart,
  todayStr,
} from "../../src/lib/loggingDateUtils.js";

const TODAY = todayStr();
const HISTORY_DATE = addDaysStr(getCurrentWeekStart(), -7);
const MACROS = ["calories", "protein_g", "carbs_g", "fat_g"];
const FOOD_LOG_ROUTE = "**/entities/FoodLogEntry**";
const FOOD = {
  id: "commit-recovery-oats",
  name: "Commit recovery oats",
  serving_description: "1 bowl",
  calories: 200,
  protein_g: 10,
  carbs_g: 30,
  fat_g: 4,
  source: "manual",
};
const SECOND_FOOD = {
  ...FOOD,
  id: "commit-recovery-milk",
  name: "Commit recovery milk",
  calories: 100,
};

const reviewSheet = (page) =>
  page.getByRole("dialog", { name: "Review food", exact: true });
const saveButton = (page) =>
  reviewSheet(page).getByRole("button", { name: /^Add to / });
const diary = (page, includeHidden = false) =>
  page.getByRole("region", { name: "Food diary", includeHidden });
const ownFoodRows = (entities, name = FOOD.name) =>
  entities.FoodLogEntry.filter(
    (row) => row.created_by_id === AUTH_USER.id && row.name === name,
  );
const dailyTotals = (entities, date) => {
  const log = entities.DailyLog.find(
    (row) => row.created_by_id === AUTH_USER.id && row.date === date,
  );
  return Object.fromEntries(MACROS.map((key) => [key, log?.[key] ?? 0]));
};

function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release: () => release() };
}

async function chooseSavedFood(page, name) {
  await reviewSheet(page).getByText(/Choose a saved food/).click();
  await reviewSheet(page).getByRole("button", { name, exact: true }).click();
}

async function openSavedFoodReview(page) {
  await page.getByRole("button", { name: "Add food to Lunch", exact: true }).click();
  await chooseSavedFood(page, FOOD.name);
}

async function softRefreshNutrition(page) {
  await page.getByRole("heading", { name: "Nutrition", exact: true }).evaluate((heading) => {
    window.scrollTo(0, 0);
    for (const [type, clientY] of [["touchstart", 100], ["touchmove", 280], ["touchend", 280]]) {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, "touches", { value: [{ clientX: 100, clientY }] });
      heading.dispatchEvent(event);
    }
  });
}

const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
});
test.afterEach(async ({ page }) => expect(pageErrors.get(page)).toEqual([]));

test("failed compensation stays visible, blocks resubmit, and explicit discard leaves daily totals alone", async ({ page }) => {
  const functionErrors = { upsertTrackingRecord: 503 };
  const { entities } = await installAuthenticatedBase44(page, {
    entities: {
      ...ENTITY_FIXTURES,
      FoodItem: [FOOD, SECOND_FOOD],
      FoodLogEntry: [],
    },
    functionErrors,
  });
  let failCompensation = true;
  let creates = 0;
  let totalUpdates = 0;
  let currentWeekReads = 0;
  await page.route(FOOD_LOG_ROUTE, async (route) => {
    const request = route.request();
    if (request.method() === "POST") creates += 1;
    if (request.method() === "GET") {
      const query = JSON.parse(new URL(request.url()).searchParams.get("q") || "{}");
      if (query.date?.$gte) currentWeekReads += 1;
    }
    if (request.method() === "DELETE" && failCompensation) {
      const id = new URL(request.url()).pathname.split("/").pop();
      if (ownFoodRows(entities).some((row) => row.id === id)) {
        // A definitive refusal models known noncommit. A 503 acknowledgement
        // is uncertain and must remain blocked rather than allow discard.
        return route.fulfill({ status: 403, json: { error: "Forced compensation refusal" } });
      }
    }
    return route.fallback();
  });
  await page.route("**/functions/upsertTrackingRecord", (route) => {
    if (route.request().postDataJSON()?.kind === "daily_log") totalUpdates += 1;
    return route.fallback();
  });
  await page.goto(`/nutrition?date=${TODAY}`);
  const before = dailyTotals(entities, TODAY);
  await openSavedFoodReview(page);
  await reviewSheet(page).getByRole("button", { name: "Add another food", exact: true }).click();
  await chooseSavedFood(page, SECOND_FOOD.name);
  await saveButton(page).click();

  await expect(reviewSheet(page).getByRole("alert")).toContainText(/incomplete|unfinished|review/i);
  await expect(saveButton(page)).toBeDisabled();
  expect(creates).toBe(2);
  expect(ownFoodRows(entities)).toHaveLength(1);
  expect(ownFoodRows(entities, SECOND_FOOD.name)).toHaveLength(0);
  expect(dailyTotals(entities, TODAY)).toEqual(before);

  // A reconciliationRequired/pending survivor is visible but is not an ordinary
  // committed food: edit, repeat, and normal delete must not adjust its totals.
  await expect(diary(page, true).getByText(FOOD.name, { exact: true })).toBeVisible();
  for (const action of ["Edit", "Repeat", "Delete"]) {
    const control = diary(page, true).getByRole("button", {
      name: `${action} ${FOOD.name}`, exact: true, includeHidden: true,
    });
    await expect(control.and(page.locator("button:enabled"))).toHaveCount(0);
  }

  delete functionErrors.upsertTrackingRecord;
  failCompensation = false;
  // Restored connectivity must not make the same partially committed draft
  // resubmittable. Native click() on a disabled button must issue no writes.
  await expect(saveButton(page)).toBeDisabled();
  await saveButton(page).evaluate((button) => button.click());
  await reviewSheet(page).getByRole("link", { name: "Review diary", exact: true }).click();
  await expect(reviewSheet(page)).toHaveCount(0);
  expect(creates).toBe(2);
  await expect(diary(page).getByText(FOOD.name, { exact: true })).toBeVisible();
  await expect(diary(page)).toContainText(/totals/i);
  await expect(diary(page)).toContainText(/check|review/i);

  // A new review must not bypass the day-level reconciliation guard.
  await openSavedFoodReview(page);
  await saveButton(page).click();
  await expect(reviewSheet(page).getByRole("alert")).toContainText(/incomplete|review/i);
  expect(creates).toBe(2);
  // The receipt confirms noncommit, permitting exactly one safe retry.
  // Read-only nutrition_operation_status calls are not totals writes.
  expect(totalUpdates).toBe(2);
  await reviewSheet(page).getByRole("link", { name: "Review diary", exact: true }).click();
  await expect(reviewSheet(page)).toHaveCount(0);

  // reload() reads a plain server row. The client-only recovery overlay must
  // reapply both flags rather than exposing that row as an ordinary saved food.
  expect(ownFoodRows(entities)[0]).not.toHaveProperty("pending");
  expect(ownFoodRows(entities)[0]).not.toHaveProperty("reconciliationRequired");
  const readsBeforeRefresh = currentWeekReads;
  await softRefreshNutrition(page);
  await expect.poll(() => currentWeekReads).toBeGreaterThan(readsBeforeRefresh);
  await expect(diary(page).getByRole("button", { name: /discard incomplete item/i })).toBeVisible();
  await expect(diary(page).getByRole("button", { name: `Delete ${FOOD.name}`, exact: true })).toHaveCount(0);
  await diary(page).getByRole("button", { name: /discard/i }).click();
  await expect.poll(() => ownFoodRows(entities).length).toBe(0);
  await expect(diary(page).getByText(FOOD.name, { exact: true })).toHaveCount(0);
  expect(totalUpdates).toBe(2);
  expect(dailyTotals(entities, TODAY)).toEqual(before);

  // A fresh, explicitly reviewed attempt after discard is a single new commit.
  await openSavedFoodReview(page);
  await saveButton(page).click();
  await expect(reviewSheet(page)).toHaveCount(0);
  expect(creates).toBe(3);
  expect(ownFoodRows(entities)).toHaveLength(1);
  expect(dailyTotals(entities, TODAY)).toEqual(
    Object.fromEntries(MACROS.map((key) => [key, before[key] + FOOD[key]])),
  );
});

for (const delayedLoad of ["background history", "on-demand date"]) {
  test(`a delayed ${delayedLoad} snapshot cannot resurrect a confirmed-deleted food`, async ({ page }) => {
    const original = {
      ...FOOD,
      id: "commit-recovery-history-entry",
      date: HISTORY_DATE,
      meal: "lunch",
      quantity: 1,
    };
    const sentinel = {
      ...original,
      id: "commit-recovery-history-sentinel",
      name: "Commit recovery later snapshot",
    };
    const onDemand = delayedLoad === "on-demand date";
    const { entities } = await installAuthenticatedBase44(page, {
      entities: {
        ...ENTITY_FIXTURES,
        // Keep an empty sibling date in the week strip. Its loading indicator
        // lets the background test wait for the merge, not merely HTTP headers.
        DailyLog: ENTITY_FIXTURES.DailyLog.filter(
          (row) => row.date === TODAY || row.date === HISTORY_DATE,
        ),
        ExerciseSession: [], // Sessions also mark the sibling date as active.
        FoodLogEntry: onDemand ? [original, sentinel] : [original],
      },
    });
    const responseGate = gate();
    let snapshotHeld = false;
    await page.route(FOOD_LOG_ROUTE, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const query = JSON.parse(new URL(route.request().url()).searchParams.get("q") || "{}");
      const isHistory = Boolean(query.date?.$lt);
      const isSelectedDate = query.date === HISTORY_DATE;
      if (!isHistory && !isSelectedDate) return route.fallback();
      expect(query.created_by_id).toBe(AUTH_USER.id);
      const snapshot = structuredClone(entities.FoodLogEntry.filter((row) =>
        row.created_by_id === AUTH_USER.id &&
        (isHistory ? row.date < query.date.$lt : row.date === HISTORY_DATE),
      ));
      if (onDemand && isHistory) {
        // Model a slightly older background snapshot; only the delayed exact-
        // date response knows about the sentinel, so its appearance proves that
        // ensureDateLoaded has actually finished applying that response.
        return route.fulfill({ json: snapshot.filter((row) => row.id !== sentinel.id) });
      }
      if ((onDemand && isSelectedDate) || (!onDemand && isHistory)) {
        snapshotHeld = true;
        await responseGate.promise;
        return route.fulfill({ json: snapshot });
      }
      return route.fallback();
    });

    try {
      await page.goto(`/nutrition?date=${HISTORY_DATE}`);
      await expect.poll(() => snapshotHeld).toBe(true);
      const remove = diary(page).getByRole("button", { name: `Delete ${FOOD.name}`, exact: true });
      await expect(remove).toBeVisible();
      const before = dailyTotals(entities, HISTORY_DATE);
      await remove.click();
      await expect.poll(() => ownFoodRows(entities).length).toBe(0);
      await expect(remove).toHaveCount(0);
      const afterDelete = Object.fromEntries(MACROS.map((key) => [key, before[key] - FOOD[key]]));
      await expect.poll(() => dailyTotals(entities, HISTORY_DATE)).toEqual(afterDelete);
      responseGate.release();

      if (onDemand) {
        await expect(diary(page).getByText(sentinel.name, { exact: true })).toBeVisible();
      } else {
        const emptyDate = formatLongDate(addDaysStr(HISTORY_DATE, 1));
        await expect(page.getByRole("group", { name: "Logging week" }).getByRole("button", {
          name: `${emptyDate}. No loaded activity`, exact: true,
        })).toBeVisible();
      }
      await expect(diary(page).getByText(FOOD.name, { exact: true })).toHaveCount(0);
      await expect(remove).toHaveCount(0);
      expect(ownFoodRows(entities)).toHaveLength(0);
      expect(dailyTotals(entities, HISTORY_DATE)).toEqual(afterDelete);
    } finally {
      responseGate.release();
    }
  });
}

test("Undo follows two recreated-ID aliases and eventually removes the food exactly once", async ({ page }) => {
  const functionErrors = {};
  const { entities } = await installAuthenticatedBase44(page, {
    entities: { ...ENTITY_FIXTURES, FoodItem: [FOOD], FoodLogEntry: [] },
    functionErrors,
  });
  const deletedIds = [];
  await page.route(FOOD_LOG_ROUTE, (route) => {
    const request = route.request();
    if (request.method() === "DELETE") {
      const id = new URL(request.url()).pathname.split("/").pop();
      deletedIds.push(id);
      // The generic mock accepts an absent ID. Reject it here so a stale-ID
      // request cannot falsely make the alias-chain regression pass.
      if (!ownFoodRows(entities).some((row) => row.id === id)) {
        return route.fulfill({ status: 404, json: { error: "Food entry not found" } });
      }
    }
    return route.fallback();
  });
  await page.goto(`/nutrition?date=${TODAY}`);
  const before = dailyTotals(entities, TODAY);
  await openSavedFoodReview(page);
  await saveButton(page).click();
  await expect(reviewSheet(page)).toHaveCount(0);
  const committed = dailyTotals(entities, TODAY);
  const ids = [ownFoodRows(entities)[0].id];
  const undo = page.getByRole("button", { name: "Undo", exact: true });

  functionErrors.upsertTrackingRecord = 503;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await undo.click();
    await expect.poll(() => ownFoodRows(entities)[0]?.id).not.toBe(ids[attempt]);
    await expect.poll(() => ownFoodRows(entities).length).toBe(1);
    await expect(diary(page).getByRole("button", {
      name: `Delete ${FOOD.name}`, exact: true,
    })).toBeEnabled();
    ids.push(ownFoodRows(entities)[0].id);
    expect(dailyTotals(entities, TODAY)).toEqual(committed);
  }
  expect(new Set(ids).size).toBe(3);

  delete functionErrors.upsertTrackingRecord;
  await undo.click();
  await expect.poll(() => ownFoodRows(entities).length).toBe(0);
  await expect(diary(page).getByText(FOOD.name, { exact: true })).toHaveCount(0);
  expect(deletedIds).toEqual(ids);
  await expect.poll(() => dailyTotals(entities, TODAY)).toEqual(before);
});
