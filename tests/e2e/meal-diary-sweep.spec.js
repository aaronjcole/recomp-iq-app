import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44 } from "./support/base44.js";
import { AUTH_USER, ENTITY_FIXTURES } from "./support/fixtures.js";
import { addDaysStr, todayStr } from "../../src/lib/loggingDateUtils.js";

const TODAY = todayStr();
const PAST = addDaysStr(TODAY, -9);
const FOOD_ROUTE = "**/entities/FoodLogEntry**";
const food = {
  id: "meal-diary-sweep-original", name: "Sweep oats", date: PAST, meal: "breakfast",
  serving_description: "1 bowl", quantity: 1, calories: 400,
  protein_g: 20, carbs_g: 60, fat_g: 8, fiber_g: 6, source: "manual"
};
const diary = (page) => page.getByRole("region", { name: "Food diary", exact: true });
const editor = (page) => page.getByRole("dialog", { name: "Edit food entry", exact: true });
const ownRows = (entities) => entities.FoodLogEntry.filter((row) => row.created_by_id === AUTH_USER.id);
const calories = (entities, date) => entities.DailyLog.find((row) => row.created_by_id === AUTH_USER.id && row.date === date)?.calories ?? 0;
const duplicateClick = (locator) => locator.evaluate((button) => { button.click(); button.click(); });

function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

async function seed(page, entries = [food]) {
  return installAuthenticatedBase44(page, {
    entities: {
      ...ENTITY_FIXTURES,
      DailyLog: [
        { id: "meal-diary-day", date: PAST, calories: 800, protein_g: 40, carbs_g: 120, fat_g: 16 },
        { id: "meal-diary-today", date: TODAY, calories: 1200, protein_g: 60, carbs_g: 160, fat_g: 24 }
      ],
      FoodLogEntry: entries, ExerciseSession: []
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

for (const width of [320, 390]) {
  test(`historical diary names, servings, meal headers and actions fit at ${width}px`, async ({ page }) => {
    const longFood = { ...food, name: "LongUnbrokenFoodName".repeat(10), serving_description: "LongUnbrokenServing".repeat(10) };
    await page.setViewportSize({ width, height: 844 });
    await seed(page, [longFood]);
    await page.goto(`/nutrition?date=${PAST}`);
    const section = diary(page).getByRole("region", { name: "Breakfast", exact: true });
    const name = section.getByText(longFood.name, { exact: true });
    await expect(name).toBeVisible();
    await expect.poll(() => diary(page).evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await name.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    const card = await diary(page).boundingBox();
    const heading = await section.getByRole("heading", { name: "Breakfast", exact: true }).boundingBox();
    expect(card).not.toBeNull();
    expect(heading).not.toBeNull();
    for (const label of ["Add food to Breakfast", "Copy Breakfast to today", `Repeat ${longFood.name}`, `Edit ${longFood.name}`, `Delete ${longFood.name}`]) {
      const button = section.getByRole("button", { name: label, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(card.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 1);
      expect(box.height).toBeGreaterThanOrEqual(44);
      const overlapsHeading = box.x < heading.x + heading.width && box.x + box.width > heading.x
        && box.y < heading.y + heading.height && box.y + box.height > heading.y;
      expect(overlapsHeading, `${label} overlaps meal heading`).toBe(false);
    }
  });
}

test("editor rejects blank, negative, zero and out-of-range values without mutating history", async ({ page }) => {
  const { entities } = await seed(page);
  const original = structuredClone(ownRows(entities)[0]);
  await page.goto(`/nutrition?date=${PAST}`);
  await diary(page).getByRole("button", { name: `Edit ${food.name}`, exact: true }).click();
  const save = editor(page).getByRole("button", { name: "Save changes", exact: true });
  for (const value of ["", "0", "-1", "1001"]) {
    await editor(page).getByLabel("Quantity", { exact: true }).fill(value);
    await expect(save).toBeDisabled();
    await duplicateClick(save);
    expect(ownRows(entities)).toEqual([original]);
  }
  await editor(page).getByLabel("Quantity", { exact: true }).fill("1");
  for (const value of ["", "-10", "20001"]) {
    await editor(page).getByLabel("Calories", { exact: true }).fill(value);
    await expect(save).toBeDisabled();
    await duplicateClick(save);
    expect(ownRows(entities)).toEqual([original]);
  }
  await editor(page).getByLabel("Calories", { exact: true }).fill("400");
  await editor(page).getByLabel("Quantity", { exact: true }).fill("1.5");
  await expect(save).toBeEnabled();
  await duplicateClick(save);
  await expect(editor(page)).toHaveCount(0);
  expect(ownRows(entities)).toEqual([expect.objectContaining({ date: PAST, quantity: 1.5, calories: 600, fiber_g: 9 })]);
  expect(calories(entities, PAST)).toBe(1000);
  expect(calories(entities, TODAY)).toBe(1200);
});

for (const destination of ["/training", "/nutrition?segment=tools", `/nutrition?date=${TODAY}`]) {
  test(`cached diary editor closes on navigation to ${destination} and never reappears`, async ({ page }) => {
    await seed(page);
    await page.goto(`/nutrition?date=${PAST}`);
    await diary(page).getByRole("button", { name: `Edit ${food.name}`, exact: true }).click();
    await expect(editor(page)).toBeVisible();
    // Model a client-side location change (e.g. browser history) while a modal
    // is open. A full page.goto would unmount the cache and conceal this bug.
    await page.evaluate((url) => {
      history.pushState(null, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, destination);
    await expect(editor(page)).toHaveCount(0);
    await page.evaluate((url) => {
      history.pushState(null, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `/nutrition?date=${PAST}`);
    await expect(diary(page)).toBeVisible();
    await expect(editor(page)).toHaveCount(0);
  });
}

test("repeat stays on the historical date, blocks duplicate submissions, and Undo removes only the repeat", async ({ page }) => {
  const { entities } = await seed(page);
  const createGate = gate();
  let creates = 0;
  await page.route(FOOD_ROUTE, async (route) => {
    if (route.request().method() === "POST") { creates += 1; await createGate.promise; }
    return route.fallback();
  });
  try {
    await page.goto(`/nutrition?date=${PAST}`);
    await duplicateClick(diary(page).getByRole("button", { name: `Repeat ${food.name}`, exact: true }));
    await expect.poll(() => creates).toBe(1);
    await expect(diary(page).getByRole("button", { name: `Edit ${food.name}`, exact: true }).first()).toBeDisabled();
    createGate.release();
    await expect(page.getByText(`${food.name} repeated`, { exact: true })).toBeVisible();
    await expect.poll(() => ownRows(entities).length).toBe(2);
    expect(ownRows(entities).every((row) => row.date === PAST && row.meal === "breakfast")).toBe(true);
    expect(calories(entities, PAST)).toBe(1200);
    expect(calories(entities, TODAY)).toBe(1200);
    await duplicateClick(page.getByRole("button", { name: "Undo", exact: true }));
    await expect.poll(() => ownRows(entities).length).toBe(1);
    await expect.poll(() => calories(entities, PAST)).toBe(800);
    expect(ownRows(entities)[0].id).toBe(food.id);
    expect(creates).toBe(1);
  } finally { createGate.release(); }
});

test("delete Undo can be double tapped without restoring the same food twice", async ({ page }) => {
  const { entities } = await seed(page);
  const restoreGate = gate();
  let restores = 0;
  await page.route(FOOD_ROUTE, async (route) => {
    if (route.request().method() === "POST") { restores += 1; await restoreGate.promise; }
    return route.fallback();
  });
  try {
    await page.goto(`/nutrition?date=${PAST}`);
    await diary(page).getByRole("button", { name: `Delete ${food.name}`, exact: true }).click();
    await expect(page.getByText(`${food.name} removed`, { exact: true })).toBeVisible();
    expect(ownRows(entities)).toHaveLength(0);
    expect(calories(entities, PAST)).toBe(400);
    await duplicateClick(page.getByRole("button", { name: "Undo", exact: true }));
    await expect.poll(() => restores).toBe(1);
    restoreGate.release();
    await expect.poll(() => ownRows(entities).length).toBe(1);
    await expect.poll(() => calories(entities, PAST)).toBe(800);
    expect(ownRows(entities)[0]).toMatchObject({ date: PAST, calories: 400 });
    expect(restores).toBe(1);
    expect(calories(entities, TODAY)).toBe(1200);
  } finally { restoreGate.release(); }
});

test("partial copy Undo retries only failed copies, not foods already removed", async ({ page }) => {
  const second = { ...food, id: "meal-diary-sweep-second", name: "Sweep fruit", calories: 100 };
  const { entities } = await seed(page, [food, second]);
  let failOnce = true;
  const deletes = [];
  await page.route(FOOD_ROUTE, async (route) => {
    if (route.request().method() === "DELETE") {
      const id = new URL(route.request().url()).pathname.split("/").pop();
      deletes.push(id);
      if (failOnce) { failOnce = false; return route.fulfill({ status: 409, json: { error: "Delete rejected before commit" } }); }
    }
    return route.fallback();
  });
  await page.goto(`/nutrition?date=${PAST}`);
  await duplicateClick(diary(page).getByRole("button", { name: "Copy Breakfast to today", exact: true }));
  await expect(page.getByText("Breakfast copied to today", { exact: true })).toBeVisible();
  expect(ownRows(entities).filter((row) => row.date === TODAY)).toHaveLength(2);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await duplicateClick(undo);
  await expect(page.getByText("Some copied items couldn't be removed", { exact: true })).toBeVisible();
  await expect.poll(() => ownRows(entities).filter((row) => row.date === TODAY).length).toBe(1);
  await undo.click();
  await expect.poll(() => ownRows(entities).filter((row) => row.date === TODAY).length).toBe(0);
  await expect.poll(() => calories(entities, TODAY)).toBe(1200);
  expect(deletes).toHaveLength(3);
  expect(deletes[2]).toBe(deletes[0]);
  expect(ownRows(entities).filter((row) => row.date === PAST)).toHaveLength(2);
});

test("incomplete historical rows expose recovery without repeat, edit or meal-copy actions", async ({ page }) => {
  const { entities } = await seed(page, [{ ...food, reconciliationRequired: true }]);
  await page.goto(`/nutrition?date=${PAST}`);
  await expect(diary(page).getByRole("alert")).toBeVisible();
  for (const action of ["Repeat", "Edit", "Delete"]) {
    await expect(diary(page).getByRole("button", { name: `${action} ${food.name}`, exact: true })).toHaveCount(0);
  }
  await expect(diary(page).getByRole("button", { name: "Copy Breakfast to today", exact: true })).toHaveCount(0);
  const before = calories(entities, PAST);
  await diary(page).getByRole("button", { name: /Discard incomplete item/ }).click();
  await expect.poll(() => ownRows(entities).length).toBe(0);
  expect(calories(entities, PAST)).toBe(before);
});
