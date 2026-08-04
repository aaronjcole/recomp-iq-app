import { expect } from "@playwright/test";
import {
  AUTH_USER,
  ADAPTIVE_MEAL_PLAN,
  ADAPTIVE_TRAINING_BLOCK,
  BODY_COMPOSITION_RESULT,
  ENTITY_FIXTURES,
  PREMIUM_TESTER_ACCESS,
  PUBLIC_SETTINGS,
  WEEKLY_AUTOPILOT_REVIEW
} from "./fixtures.js";

/**
 * Fulfil the single Base44 request made before public routes render. This keeps
 * local public-page smoke tests deterministic and credential-free; it does not
 * mock any authenticated entity or function calls.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function installUnauthenticatedBase44(page) {
  await page.route("**/api/apps/public/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "playwright-local",
        public_settings: {},
      }),
    });
  });

  // A few route transitions can defensively re-check the current user. Keep
  // those checks explicitly signed out instead of letting Vite proxy them to a
  // fake local Base44 origin.
  await page.route("**/api/apps/playwright-local/entities/User/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Unauthenticated Playwright visitor" }),
    });
  });

  // Local smoke tests do not need analytics, and the placeholder API origin
  // intentionally points at Vite. Swallow batches so the dev proxy cannot
  // recursively send them back to itself.
  await page.route("**/api/apps/playwright-local/analytics/**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
}

function readBody(request) {
  try {
    return request.postDataJSON() ?? {};
  } catch {
    return {};
  }
}

function idFromEntityUrl(url) {
  const m = url.match(/\/entities\/[A-Za-z0-9_]+\/([A-Za-z0-9_-]+)/);
  return m && m[1] !== "me" ? m[1] : null;
}

/**
 * Boot the real app as a signed-in user with a fixture dataset, without any
 * network or credentials. Seeds a stored token so AuthContext takes the
 * authenticated path, then serves every Base44 /api call from ENTITY_FIXTURES.
 *
 * This is the runtime oracle for the Wave 1 data-layer / mega-context refactor:
 * if a refactor drops a context consumer, mis-gates first paint, or white-
 * screens a tab, the screen fails to render its heading or throws a page error.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ user?: object, entities?: Record<string, object[]>, premiumAccess?: object, mealPlan?: object, trainingBlock?: object, autopilotReview?: object, bodyCompositionResult?: object }} [options]
 */
export async function installAuthenticatedBase44(page, options = {}) {
  const user = options.user ?? AUTH_USER;
  const entities = options.entities ?? ENTITY_FIXTURES;
  const premiumAccess = options.premiumAccess ?? PREMIUM_TESTER_ACCESS;
  const mealPlan = options.mealPlan ?? ADAPTIVE_MEAL_PLAN;
  const trainingBlock = options.trainingBlock ?? ADAPTIVE_TRAINING_BLOCK;
  const autopilotReview = options.autopilotReview ?? WEEKLY_AUTOPILOT_REVIEW;
  const bodyCompositionResult = options.bodyCompositionResult ?? BODY_COMPOSITION_RESULT;
  let privateUploadCount = 0;

  await page.addInitScript(() => {
    try {
      const token = "e2e-authenticated-token-playwright-local";
      window.localStorage.setItem("base44_access_token", token);
      window.localStorage.setItem("token", token);
    } catch {
      // Storage can be unavailable; the test will surface it as an auth failure.
    }
  });

  // Scope strictly to the Base44 backend (/api/apps/**). A broad **/api/**
  // would also shadow the app's own module at /src/api/base44Client.js and
  // break the dev server's module MIME type.
  await page.route("**/api/apps/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.includes("/apps/public/")) return json(PUBLIC_SETTINGS);
    if (url.includes("/analytics/")) return route.fulfill({ status: 204, body: "" });
    if (/\/entities\/User\/me\b/.test(url)) return json(user);

    if (url.includes("/integration-endpoints/Core/UploadPrivateFile")) {
      if (method !== "POST") return json({ error: "Method not allowed" }, 405);
      privateUploadCount += 1;
      return json({ file_uri: `private/user-test/body-scan-${privateUploadCount}.png` });
    }

    const entityMatch = url.match(/\/entities\/([A-Za-z0-9_]+)/);
    if (entityMatch) {
      const name = entityMatch[1];
      const rows = entities[name] ?? [];
      if (method === "GET") return json(rows);
      if (method === "POST") return json({ id: `${name}-e2e-created`, ...readBody(request) });
      if (method === "PUT" || method === "PATCH") {
        return json({ id: idFromEntityUrl(url) ?? `${name}-e2e`, ...readBody(request) });
      }
      if (method === "DELETE") return json({ success: true });
    }

    if (url.includes("/functions/")) {
      if (url.includes("/functions/getPremiumAccess")) {
        if (method !== "POST") return json({ error: "Method not allowed" }, 405);
        return json(premiumAccess);
      }
      if (url.includes("/functions/generateAdaptiveMealPlan")) {
        if (method !== "POST") return json({ error: "Method not allowed" }, 405);
        return json(mealPlan);
      }
      if (url.includes("/functions/generateAdaptiveTrainingBlock")) {
        if (method !== "POST") return json({ error: "Method not allowed" }, 405);
        return json(trainingBlock);
      }
      if (url.includes("/functions/generateWeeklyAutopilot")) {
        if (method !== "POST") return json({ error: "Method not allowed" }, 405);
        return json(autopilotReview);
      }
      if (url.includes("/functions/analyzeBodyComposition")) {
        if (method !== "POST") return json({ error: "Method not allowed" }, 405);
        return json(bodyCompositionResult);
      }
      // Mirror upsertTrackingRecord: the saved record has the request's
      // `fields` flattened onto it (value/done for a habit, macros for a log),
      // so an optimistic write reconciles instead of reverting.
      const body = readBody(request);
      const record = { id: "record-e2e", habit_id: body.habit_id, date: body.date, ...(body.fields || {}) };
      // The function's HTTP body is { record }; the SDK's invoke() wraps it as
      // { data: <body> }, which is why callers read result.data.record.
      return json({ record });
    }

    // Fail loudly: an unmatched /api/apps/** call likely means a route or entity
    // contract changed and the fixtures/harness have not accounted for it, which
    // is exactly the kind of regression this oracle should surface.
    return json({ error: `Unhandled Base44 mock route: ${method} ${url}` }, 404);
  });
}

/**
 * Fail a smoke test if React or a browser script throws an uncaught error.
 * Call this before navigation and assert after the page has settled.
 *
 * @param {import('@playwright/test').Page} page
 */
export function watchPageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  return () => expect(errors, "uncaught browser errors").toEqual([]);
}
