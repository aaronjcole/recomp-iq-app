import { expect } from "@playwright/test";
import {
  normalizeTrackingRequest,
  reconcileTrackingRecords
} from "../../../base44/shared/trackingRecordDomain.js";
import {
  buildMealSwap,
  normalizeSwapRequest
} from "../../../base44/shared/adaptiveMealPlanDomain.js";
import { WeeklyCheckInError } from "../../../base44/shared/weeklyCheckInDomain.js";
import { decideWeeklyCheckIn } from "../../../base44/shared/weeklyCheckInPersistence.js";
import {
  AUTH_USER,
  ADAPTIVE_MEAL_PLAN,
  ADAPTIVE_TRAINING_BLOCK,
  BODY_COMPOSITION_RESULT,
  ENTITY_FIXTURES,
  FOREIGN_ENTITY_FIXTURES,
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

function matchesCondition(value, condition) {
  if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
    return Object.entries(condition).every(([operator, operand]) => {
      switch (operator) {
        case "$gte": return value != null && value >= operand;
        case "$gt": return value != null && value > operand;
        case "$lte": return value != null && value <= operand;
        case "$lt": return value != null && value < operand;
        case "$ne": return value !== operand;
        case "$in": return Array.isArray(operand) && operand.includes(value);
        default: throw new Error(`Unsupported mock query operator: ${operator}`);
      }
    });
  }
  return value === condition;
}

/** Apply a Base44 `q` filter (equality plus the comparison operators the app uses). */
function matchesQuery(row, query) {
  return Object.entries(query ?? {}).every(([field, condition]) =>
    matchesCondition(row?.[field], condition)
  );
}

function parseEntityQuery(url) {
  const raw = new URL(url).searchParams.get("q");
  if (!raw) return {};
  try {
    return JSON.parse(raw) ?? {};
  } catch {
    return null;
  }
}

let inMemorySequence = 0;

/**
 * A Base44-shaped `entities` client over the mock's rows, so a backend domain
 * (decideWeeklyCheckIn) runs for real against the same data the app reads.
 * Rows are looked up on every call because routes replace the arrays.
 */
function inMemoryEntities(entities, userId) {
  return new Proxy({}, {
    get(_target, name) {
      const rows = () => (entities[name] ??= []);
      const copy = (row) => ({ ...row });
      return {
        async filter(query, sort, limit = 50) {
          const field = sort?.replace(/^[-+]/, "");
          const direction = sort?.startsWith("-") ? -1 : 1;
          const compare = (a, b) => {
            if (!field) return 0;
            const left = a[field] ?? "";
            const right = b[field] ?? "";
            return (left < right ? -1 : left > right ? 1 : 0) * direction;
          };
          return rows()
            .filter((row) => matchesQuery(row, query))
            .sort(compare)
            .slice(0, limit)
            .map(copy);
        },
        async create(data) {
          inMemorySequence += 1;
          const row = {
            ...data,
            id: `${String(name)}-mem-${inMemorySequence}`,
            created_by_id: userId,
            created_date: new Date(Date.now() + inMemorySequence).toISOString()
          };
          rows().push(row);
          return copy(row);
        },
        async update(id, data) {
          const row = rows().find((item) => item.id === id && item.created_by_id === userId);
          if (!row) throw Object.assign(new Error("Not found"), { status: 404 });
          Object.assign(row, data);
          return copy(row);
        },
        async delete(id) {
          entities[name] = rows().filter((item) => !(item.id === id && item.created_by_id === userId));
          return { success: true };
        }
      };
    }
  });
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
 * Rows without `created_by_id` belong to the signed-in user. Another
 * account's rows (`foreignEntities`) are served too, and every entity list or
 * filter must name the signed-in user as `created_by_id`: Base44 RLS grants
 * admins every row, so an unscoped query is rejected here as a contract bug.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ user?: object, entities?: Record<string, object[]>, foreignEntities?: Record<string, object[]>, ensuredHabits?: object[], ensureHabitsError?: boolean, premiumAccess?: object, mealPlan?: object, trainingBlock?: object, autopilotReview?: object, bodyCompositionResult?: object, failingEntities?: string[], functionErrors?: Record<string, number>, analysisUploads?: string[], foodPhotoResult?: object }} [options]
 */
export async function installAuthenticatedBase44(page, options = {}) {
  const user = options.user ?? AUTH_USER;
  const own = (rows) => (rows ?? []).map((row) => ({ created_by_id: user.id, ...row }));
  const ownedEntities = Object.fromEntries(
    Object.entries(options.entities ?? ENTITY_FIXTURES).map(([name, rows]) => [name, own(rows)])
  );
  const foreignEntities = options.foreignEntities ?? FOREIGN_ENTITY_FIXTURES;
  const entities = Object.fromEntries(
    [...new Set([...Object.keys(ownedEntities), ...Object.keys(foreignEntities)])].map((name) => [
      name,
      [...(ownedEntities[name] ?? []), ...(foreignEntities[name] ?? [])]
    ])
  );
  const ensuredHabits = own(options.ensuredHabits ?? ownedEntities.Habit);
  const ensureHabitsError = options.ensureHabitsError ?? false;
  const premiumAccess = options.premiumAccess ?? PREMIUM_TESTER_ACCESS;
  const mealPlan = options.mealPlan ?? ADAPTIVE_MEAL_PLAN;
  const trainingBlock = options.trainingBlock ?? ADAPTIVE_TRAINING_BLOCK;
  const autopilotReview = options.autopilotReview ?? WEEKLY_AUTOPILOT_REVIEW;
  const bodyCompositionResult = options.bodyCompositionResult ?? BODY_COMPOSITION_RESULT;
  const failingEntities = new Set(options.failingEntities ?? []);
  // Function name -> HTTP status, to force a backend function to fail.
  const functionErrors = options.functionErrors ?? {};
  let privateUploadCount = 0;
  // Mirrors the AnalysisUpload records uploadAnalysisPhoto writes: the analyze
  // functions only accept references this signed-in user uploaded.
  const analysisUploads = new Set(options.analysisUploads ?? []);
  const refuseUnownedRefs = (refs) =>
    refs.length === 0 || refs.some((ref) => typeof ref !== "string" || !analysisUploads.has(ref));

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

    if (url.includes("/functions/uploadAnalysisPhoto")) {
      if (method !== "POST") return json({ error: "Method not allowed" }, 405);
      privateUploadCount += 1;
      // Derive the reference from the uploaded filename rather than from arrival
      // order. BodyCompositionScan uploads all three poses concurrently through
      // Promise.all, so a counter handed out refs in whatever order the requests
      // happened to land, and the caller's pose -> ref assertion flaked under
      // load. Echoing the filename also makes that assertion meaningful: it now
      // proves each pose sent the file that was put in its own slot.
      const uploadedName = /filename="([^"]+)"/.exec(request.postData() ?? "")?.[1];
      const slug = uploadedName
        ? uploadedName.replace(/\.[^.]+$/, "")
        : `upload-${privateUploadCount}`;
      const fileUri = `private/${user.id}/${slug}.png`;
      analysisUploads.add(fileUri);
      return json({ file_uri: fileUri });
    }

    const entityMatch = url.match(/\/entities\/([A-Za-z0-9_]+)/);
    if (entityMatch) {
      const name = entityMatch[1];
      const rows = entities[name] ?? [];
      if (method === "GET" && failingEntities.has(name)) {
        return json({ error: `${name} is unavailable` }, 503);
      }
      if (method === "GET") {
        const recordId = idFromEntityUrl(url);
        if (recordId) {
          const row = rows.find((item) => item.id === recordId);
          return row?.created_by_id === user.id ? json(row) : json({ error: "Not found" }, 404);
        }
        const query = parseEntityQuery(url);
        if (query?.created_by_id !== user.id) {
          return json({
            error: `Unscoped ${name} query: user-owned entity reads must filter by created_by_id`
          }, 400);
        }
        return json(rows.filter((row) => matchesQuery(row, query)));
      }
      if (method === "POST") {
        // Stored like Base44 does, with a unique id, so later reads and test
        // assertions see what the app wrote.
        inMemorySequence += 1;
        const created = {
          id: `${name}-e2e-created-${inMemorySequence}`,
          ...readBody(request),
          created_by_id: user.id,
          created_date: new Date(Date.now() + inMemorySequence).toISOString()
        };
        entities[name] = [...rows, created];
        return json(created);
      }
      if (method === "PUT" || method === "PATCH") {
        // Base44 returns the whole updated record, not only the changed fields.
        const recordId = idFromEntityUrl(url) ?? `${name}-e2e`;
        const existing = rows.find((item) => item.id === recordId && item.created_by_id === user.id);
        const updated = { ...(existing ?? {}), id: recordId, ...readBody(request) };
        if (existing) entities[name] = rows.map((item) => (item === existing ? updated : item));
        return json(updated);
      }
      if (method === "DELETE") {
        const recordId = idFromEntityUrl(url);
        entities[name] = rows.filter((item) => !(item.id === recordId && item.created_by_id === user.id));
        return json({ success: true });
      }
    }

    if (url.includes("/functions/")) {
      const functionName = url.match(/\/functions\/([A-Za-z0-9_]+)/)?.[1];
      if (functionName && functionErrors[functionName]) {
        return json({ error: `${functionName} failed (forced by test)` }, functionErrors[functionName]);
      }
      if (url.includes("/functions/ensureDefaultHabits")) {
        if (method !== "POST") return json({ error: "Method not allowed" }, 405);
        if (ensureHabitsError) return json({ error: "Temporary repair outage" }, 503);
        return json({
          habits: ensuredHabits,
          habit_entries: ownedEntities.HabitEntry ?? [],
          observed_duplicates: 0,
          cleanup_pending: 0
        });
      }
      // Run decideWeeklyCheckIn's own state machine against the fixture rows,
      // so apply/keep/customize, 409 refreshes and idempotent repeats behave
      // exactly as the function does.
      if (url.includes("/functions/decideWeeklyCheckIn")) {
        if (method !== "POST") return json({ error: "Method not allowed" }, 405);
        try {
          return json(await decideWeeklyCheckIn({ entities: inMemoryEntities(entities, user.id) }, user, readBody(request)));
        } catch (error) {
          if (error instanceof WeeklyCheckInError) {
            return json({ error: error.message, code: error.code, ...error.extra }, error.status);
          }
          throw error;
        }
      }
      if (url.includes("/functions/getPremiumAccess")) {
        if (method !== "POST") return json({ error: "Method not allowed" }, 405);
        return json(premiumAccess);
      }
      if (url.includes("/functions/generateAdaptiveMealPlan")) {
        if (method !== "POST") return json({ error: "Method not allowed" }, 405);
        return json(mealPlan);
      }
      // Run swapAdaptiveMeal's own validation and swap logic so the page is
      // exercised against the real request contract.
      if (url.includes("/functions/swapAdaptiveMeal")) {
        if (method !== "POST") return json({ error: "Method not allowed" }, 405);
        let swapped;
        try {
          swapped = buildMealSwap(normalizeSwapRequest(readBody(request)));
        } catch (error) {
          return json({ error: error.message, message: error.message }, 400);
        }
        if (!swapped) return json({ error: "No compatible swap available for this meal" }, 404);
        return json({ meal: swapped });
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
        if (refuseUnownedRefs(Object.values(readBody(request).photoRefs ?? {}))) {
          return json({ error: "These photos were not uploaded by your account." }, 403);
        }
        return json(bodyCompositionResult);
      }
      if (url.includes("/functions/analyzeFoodPhoto")) {
        if (method !== "POST") return json({ error: "Method not allowed" }, 405);
        if (refuseUnownedRefs([readBody(request).photoUri])) {
          return json({ error: "This photo was not uploaded by your account." }, 403);
        }
        return json(options.foodPhotoResult ?? {
          name: "Grilled chicken bowl", calories: 520, protein_g: 42, carbs_g: 48, fat_g: 16
        });
      }
      // Mirror upsertTrackingRecord: the saved record has the request's
      // `fields` flattened onto it (value/done for a habit, macros for a log),
      // so an optimistic write reconciles instead of reverting.
      const body = readBody(request);
      if (body.kind === "daily_log") {
        // Run the function's own request and reconcile logic against the
        // fixture rows so `fields` replace values and `increments` add to the
        // stored totals exactly as upsertTrackingRecord does.
        let tracking;
        try {
          tracking = normalizeTrackingRequest(body, user.id);
        } catch (error) {
          return json({ error: error.message }, 400);
        }
        entities.DailyLog = entities.DailyLog ?? [];
        const existing = entities.DailyLog.filter((row) => matchesQuery(row, tracking.query));
        const stored = existing.length
          ? existing
          : [{ id: `DailyLog-e2e-${body.date}`, ...tracking.createData, created_by_id: user.id, created_date: new Date().toISOString() }];
        const { canonical, fields, unsetFields } = reconcileTrackingRecords(
          stored,
          tracking.fields,
          tracking.mutableFields,
          tracking.increments
        );
        const saved = { ...canonical, ...fields };
        // The function $unsets fields sent as null and returns the re-read record.
        for (const field of unsetFields) delete saved[field];
        entities.DailyLog = [
          saved,
          ...entities.DailyLog.filter((row) => !stored.some((item) => item.id === row.id))
        ];
        return json({ record: saved });
      }
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

  // Tests that simulate another device writing to the backend mutate these
  // rows directly; the app only sees the change through its own requests.
  return { entities, user };
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
