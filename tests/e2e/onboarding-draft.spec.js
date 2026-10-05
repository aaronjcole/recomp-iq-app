import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { AUTH_USER } from "./support/fixtures.js";

// The onboarding draft holds health answers (weights, safety flags), so it
// must stay with the account that typed it and must not survive logout.

const LEGACY_KEY = "recompiq_onboarding_v1";
const draftKey = (userId) => `recompiq_onboarding_v2:${userId}`;
const USER_A = { id: "user-a", email: "a@example.com", full_name: "User A", role: "user" };
const USER_B = { id: "user-b", email: "b@example.com", full_name: "User B", role: "user" };
// No profile, preferences, or strategy: the account has not onboarded yet.
const NEW_ACCOUNT = { entities: {}, foreignEntities: {} };

const readStorage = (page) =>
  page.evaluate(() => Object.fromEntries(Object.entries(window.localStorage)));

test("user A's onboarding draft is never shown to user B on the same device", async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);
  await installAuthenticatedBase44(page, { ...NEW_ACCOUNT, user: USER_A });

  await page.goto("/onboarding");
  const goals = page.getByRole("radio");
  await expect(goals.first()).toBeAttached();
  await goals.first().check({ force: true });
  await expect(goals.first()).toBeChecked();

  // A's draft is stored under A's key only, with no account metadata.
  await expect.poll(async () => JSON.parse((await readStorage(page))[draftKey(USER_A.id)] ?? "{}").p?.goal)
    .toBeTruthy();
  const stored = await readStorage(page);
  expect(stored[LEGACY_KEY]).toBeUndefined();
  expect(stored[draftKey(USER_A.id)]).not.toContain(USER_A.email);

  // A leaves without finishing (session expiry, account switch); B signs in.
  // A pre-scoping draft is also present, as it would be after an app update.
  await page.evaluate(([legacyKey, draft]) => {
    window.localStorage.setItem(legacyKey, draft);
  }, [LEGACY_KEY, stored[draftKey(USER_A.id)]]);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await installAuthenticatedBase44(page, { ...NEW_ACCOUNT, user: USER_B });
  await page.goto("/onboarding?step=0");

  await expect(page.getByRole("radio").first()).toBeAttached();
  for (const radio of await page.getByRole("radio").all()) {
    await expect(radio).not.toBeChecked();
  }
  const afterSwitch = await readStorage(page);
  expect(afterSwitch[LEGACY_KEY]).toBeUndefined();
  expect(JSON.parse(afterSwitch[draftKey(USER_B.id)] ?? "{}").p?.goal ?? "").toBe("");

  assertNoPageErrors();
});

test("logging out clears every onboarding draft on the device", async ({ page }) => {
  await installAuthenticatedBase44(page);

  await page.goto("/more");
  await expect(page.getByRole("heading", { level: 1, name: "More" })).toBeVisible();
  await page.evaluate(([keys]) => {
    for (const key of keys) window.localStorage.setItem(key, JSON.stringify({ p: { age: "40" } }));
  }, [[LEGACY_KEY, draftKey(AUTH_USER.id), draftKey("another-account")]]);

  // The SDK navigates to the hosted logout URL; keep that navigation local.
  await page.route("**/api/apps/auth/logout**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<p>signed out</p>" })
  );
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByText("signed out")).toBeVisible();

  const remaining = Object.keys(await readStorage(page));
  expect(remaining.filter((key) => key.startsWith("recompiq_onboarding"))).toEqual([]);
});
