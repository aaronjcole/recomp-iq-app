import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";

const review = (page) => page.getByRole("dialog", { name: "Review food", exact: true });
const barcode = (page) => page.getByRole("button", { name: "Barcode", exact: true });
const scanner = (page) => page.getByRole("dialog", { name: "Scan food barcode", exact: true });
function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}
// A native navigation/back action can change routes while a modal has pointer
// capture. Exercise React Router without reloading away the cached tab roots.
async function navigateBehindModal(page, name) {
  await page.getByRole("navigation", { name: "Primary", includeHidden: true }).getByRole("link", { name, exact: true, includeHidden: true })
    .evaluate((link) => link.click());
}
async function clickableCenter(locator) {
  return locator.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return r.x >= 0 && r.y >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight
      && element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
}
test.use({ viewport: { width: 320, height: 568 } });

test("cached Fuel cannot leave a meal review over another tab or reopen it on return", async ({ page }) => {
  const state = await installAuthenticatedBase44(page);
  const noErrors = watchPageErrors(page);
  const before = structuredClone(state.entities.FoodLogEntry);
  await page.goto("/nutrition");
  await page.getByRole("button", { name: "Add food to Breakfast", exact: true }).click();
  await expect(review(page)).toBeVisible();
  await navigateBehindModal(page, "More");
  await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
  await expect(review(page)).toHaveCount(0);
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Fuel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nutrition", exact: true })).toBeVisible();
  await expect(review(page)).toHaveCount(0);
  expect(state.entities.FoodLogEntry).toEqual(before);
  noErrors();
});

test("cached Fuel dismisses its scanner and releases scroll lock on route departure", async ({ page }) => {
  await installAuthenticatedBase44(page);
  const noErrors = watchPageErrors(page);
  await page.goto("/nutrition");
  await barcode(page).click();
  await expect(scanner(page)).toBeVisible();
  await navigateBehindModal(page, "More");
  await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
  await expect(scanner(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Fuel", exact: true }).click();
  await expect(scanner(page)).toHaveCount(0);
  noErrors();
});

test("a slow scanner download stays above navigation and can be cancelled without reopening", async ({ page }) => {
  await installAuthenticatedBase44(page);
  const pending = gate();
  await page.route("**/src/components/nutrition/BarcodeScanner.jsx*", async (route) => {
    await pending.promise;
    await route.continue();
  });
  try {
    await page.goto("/nutrition");
    const launch = barcode(page);
    await launch.click();
    const loading = page.getByRole("dialog", { name: "Loading scanner", exact: true });
    await expect(loading).toBeVisible();
    const cancel = loading.getByRole("button", { name: "Cancel scanner", exact: true });
    await expect.poll(() => clickableCenter(cancel)).toBe(true);
    await cancel.click();
    await expect(loading).toHaveCount(0);
    await expect(launch).toBeFocused();
    pending.release();
    // A second launch reuses the now downloaded module, not the cancelled open.
    await launch.click();
    await expect(scanner(page)).toBeVisible();
    await scanner(page).getByRole("button", { name: "Close scanner", exact: true }).click();
    await expect(scanner(page)).toHaveCount(0);
  } finally { pending.release(); }
});

test("short landscape scanner keeps manual controls inside the viewport while camera startup waits", async ({ page }) => {
  await installAuthenticatedBase44(page);
  await page.setViewportSize({ width: 320, height: 240 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true, value: { getUserMedia: () => new Promise(() => {}) }
    });
  });
  await page.goto("/nutrition");
  await barcode(page).click();
  const lookup = scanner(page).getByRole("button", { name: "Lookup", exact: true });
  await expect(lookup).toBeVisible();
  await expect.poll(() => clickableCenter(lookup)).toBe(true);
  await expect.poll(() => clickableCenter(scanner(page).getByRole("button", { name: "Close scanner", exact: true }))).toBe(true);
  await scanner(page).getByRole("button", { name: "Close scanner", exact: true }).click();
});

test("scanner Tab recaptures focus when lookup removes the focused manual control", async ({ page }) => {
  await installAuthenticatedBase44(page);
  const pending = gate();
  await page.route("**/functions/barcodeLookup", async (route) => {
    await pending.promise;
    await route.fulfill({ json: { found: false } });
  });
  try {
    await page.goto("/nutrition");
    await barcode(page).click();
    await scanner(page).getByRole("textbox", { name: "Barcode number", exact: true }).fill("0123456789012");
    await scanner(page).getByRole("button", { name: "Lookup", exact: true }).click();
    await expect(scanner(page).getByRole("button", { name: "Lookup", exact: true })).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(scanner(page).getByRole("button", { name: "Close scanner", exact: true })).toBeFocused();
  } finally { pending.release(); }
});

test("a previous scanner's delayed library save cannot dismiss a newly opened scanner", async ({ page }) => {
  const state = await installAuthenticatedBase44(page);
  await page.route("**/functions/barcodeLookup", (route) => route.fulfill({ json: { found: true, food: {
    name: "Late scanner save", serving_description: "1 serving", calories: 200, protein_g: 20, carbs_g: 20, fat_g: 4
  } } }));
  const pending = gate();
  let started = false;
  await page.route("**/entities/FoodItem", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    started = true;
    await pending.promise;
    await route.fallback();
  });
  try {
    await page.goto("/nutrition");
    await barcode(page).click();
    await scanner(page).getByRole("textbox", { name: "Barcode number", exact: true }).fill("0123456789012");
    await scanner(page).getByRole("button", { name: "Lookup", exact: true }).click();
    await scanner(page).getByRole("button", { name: "Save to library", exact: true }).click();
    await expect.poll(() => started).toBe(true);
    await navigateBehindModal(page, "More");
    await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Fuel", exact: true }).click();
    await barcode(page).click();
    await expect(scanner(page)).toBeVisible();
    pending.release();
    await expect.poll(() => state.entities.FoodItem.some((row) => row.name === "Late scanner save")).toBe(true);
    await expect(page.getByText("Food saved to library", { exact: true })).toHaveCount(0);
    await expect(scanner(page)).toBeVisible();
    await scanner(page).getByRole("button", { name: "Close scanner", exact: true }).click();
  } finally { pending.release(); }
});

test("manual library save locks its draft and excludes an overlapping review action", async ({ page }) => {
  const state = await installAuthenticatedBase44(page);
  const noErrors = watchPageErrors(page);
  await page.goto("/nutrition");
  await page.getByText("Add manually", { exact: true }).click();
  await page.getByLabel("Food name", { exact: true }).fill("Pending meal sweep food");
  for (const [label, value] of [["Food calories", "220"], ["Food protein (g)", "20"], ["Food carbs (g)", "26"], ["Food fat (g)", "4"]]) {
    await page.getByRole("spinbutton", { name: label, exact: true }).fill(value);
  }
  const pending = gate();
  let started = false;
  await page.route("**/entities/FoodItem", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    started = true;
    await pending.promise;
    await route.fallback();
  });
  try {
    const save = page.getByRole("button", { name: "Save to library", exact: true });
    await save.evaluate((button) => {
      button.click();
      [...button.closest("fieldset").querySelectorAll("button")].find((item) => item.textContent.includes("Review food")).click();
    });
    await expect.poll(() => started).toBe(true);
    await expect(page.getByLabel("Food name", { exact: true })).toBeDisabled();
    await expect(review(page)).toHaveCount(0);
    pending.release();
    await expect(page.getByText("Food saved to library", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Food name", { exact: true })).toHaveValue("");
    expect(state.entities.FoodItem.filter((row) => row.name === "Pending meal sweep food")).toHaveLength(1);
    noErrors();
  } finally { pending.release(); }
});

for (const unable of [false, true]) {
  test(`short photo-scanner ${unable ? "error recovery" : "preview and results"} controls remain reachable`, async ({ page }) => {
    await installAuthenticatedBase44(page);
    const noErrors = watchPageErrors(page);
    await page.setViewportSize({ width: 320, height: 320 });
    await page.route("**/functions/uploadAnalysisPhoto", (route) => route.fulfill({ json: { file_uri: "private/test/food.png" } }));
    await page.route("**/functions/analyzeFoodPhoto", (route) => route.fulfill({ json: unable
      ? { estimate_status: "unable_to_estimate", notes: "The image is unclear. ".repeat(30) }
      : { version: 2, estimate_status: "estimated", items: [
        { name: "A long meal name with plenty of ingredients and descriptions", serving_description: "1 plate", calories: 330, protein_g: 22, carbs_g: 40, fat_g: 8, confidence: "moderate" },
        { name: "Rice", serving_description: "1 cup", calories: 200, protein_g: 4, carbs_g: 44, fat_g: 1 }
      ] }
    }));
    await page.goto("/tests/e2e/fixtures/food-photo.html");
    await page.locator('input[type="file"]').setInputFiles({
      name: "meal.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=", "base64")
    });
    await page.getByRole("checkbox").check();
    const estimate = page.getByRole("button", { name: "Estimate macros", exact: true });
    await estimate.scrollIntoViewIfNeeded();
    await expect.poll(() => clickableCenter(estimate)).toBe(true);
    await estimate.click();
    const action = page.getByRole("button", { name: unable ? "Try another photo" : "Review food", exact: true });
    // The estimate button unmounted; Tab must not escape to the page beneath.
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await action.scrollIntoViewIfNeeded();
    await expect.poll(() => clickableCenter(action)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    noErrors();
  });
}
