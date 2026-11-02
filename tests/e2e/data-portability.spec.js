import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { AUTH_USER, ENTITY_FIXTURES, FOREIGN_ENTITY_FIXTURES } from "./support/fixtures.js";

// Export and deletion end to end. The mock runs the real exportAccountData and
// deleteAccount code against the fixture rows, which include another account's.

const ownDailyLogs = ENTITY_FIXTURES.DailyLog.length;

async function openYourData(page) {
  await page.goto("/more");
  await page.getByRole("button", { name: /Your data/ }).click();
  await expect(page).toHaveURL(/\/more\/data$/);
}

test("the JSON export has the account's records and none of another account's", async ({ page }) => {
  await installAuthenticatedBase44(page);
  const assertNoPageErrors = watchPageErrors(page);
  await openYourData(page);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download everything (JSON)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^recompone-export-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile(await file.path(), "utf8"));

  expect(data.account.id).toBe(AUTH_USER.id);
  expect(data.entities.DailyLog).toHaveLength(ownDailyLogs);
  const foreignIds = new Set(Object.values(FOREIGN_ENTITY_FIXTURES).flat().map((row) => row.id));
  for (const rows of Object.values(data.entities)) {
    expect(rows.filter((row) => foreignIds.has(row.id))).toEqual([]);
  }
  await expect(page.getByRole("status").filter({ hasText: "downloaded." })).toHaveText(/^recompone-export-.*\.json downloaded\.$/);
  assertNoPageErrors();
});

test("stored records are counted, and one table downloads as CSV", async ({ page }) => {
  await installAuthenticatedBase44(page);
  await openYourData(page);

  await page.getByRole("button", { name: "Show what's stored" }).click();
  const dailyRow = page.getByRole("listitem").filter({ hasText: "Daily logs" });
  await expect(dailyRow).toContainText(String(ownDailyLogs));

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Daily logs as CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^recompone-daily-logs-\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = (await readFile(await file.path(), "utf8")).trim().split("\r\n");
  expect(lines[0].startsWith("id,date")).toBe(true);
  expect(lines).toHaveLength(ownDailyLogs + 1);
});

test("in an app shell without file sharing, the user is sent to the web app instead of a silent failure", async ({ page }) => {
  await page.addInitScript(() => {
    window.wixMobileNativeBridge = { requestPurchase() {}, restorePurchases() {}, finishTransaction() {} };
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
  });
  await installAuthenticatedBase44(page);
  await openYourData(page);
  await page.getByRole("button", { name: "Download everything (JSON)" }).click();
  await expect(page.getByRole("alert")).toHaveText(/Open RecompOne in a web browser to download your export/);
});

test("where the WebView can share files, the export goes to the share sheet", async ({ page }) => {
  await page.addInitScript(() => {
    window.wixMobileNativeBridge = { requestPurchase() {}, restorePurchases() {}, finishTransaction() {} };
    window.__shared = [];
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      value: async ({ files }) => { window.__shared.push(...files.map((f) => f.name)); },
      configurable: true
    });
  });
  await installAuthenticatedBase44(page);
  await openYourData(page);
  await page.getByRole("button", { name: "Download everything (JSON)" }).click();
  await expect(page.getByRole("status").filter({ hasText: "is ready to save." })).toBeAttached();
  expect(await page.evaluate(() => window.__shared)).toEqual([expect.stringMatching(/^recompone-export-.*\.json$/)]);
});

test("deleting the account removes every record the export listed, and only the caller's", async ({ page }) => {
  // Profile needs the fields onboarding always sets (the shared fixture lacks some).
  const profile = {
    ...ENTITY_FIXTURES.UserProfile[0],
    goal: "body_recomposition",
    job_activity: "lightly_active",
    training_days_per_week: 4,
    cardio_days_per_week: 2,
    average_steps: 8000,
    experience_level: "intermediate"
  };
  const { entities, deletedAccounts } = await installAuthenticatedBase44(page, {
    entities: { ...ENTITY_FIXTURES, UserProfile: [profile] }
  });
  const foreignBefore = Object.fromEntries(
    Object.entries(FOREIGN_ENTITY_FIXTURES).map(([name, rows]) => [name, rows.length])
  );
  await page.goto("/more/profile");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

  await expect.poll(() => deletedAccounts.has(AUTH_USER.id)).toBe(true);
  for (const [name, rows] of Object.entries(entities)) {
    expect(rows.filter((row) => row.created_by_id === AUTH_USER.id || row.owner_id === AUTH_USER.id), name).toEqual([]);
  }
  for (const [name, count] of Object.entries(foreignBefore)) {
    expect(entities[name].length, `${name} rows of the other account`).toBe(count);
  }
});
