import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEGACY_ONBOARDING_DRAFT_KEY,
  clearAllOnboardingDrafts,
  clearOnboardingDraft,
  loadOnboardingDraft,
  onboardingDraftKey,
  pickPreferenceDraftFields,
  pickProfileDraftFields,
  sanitizeOnboardingDraft,
  saveOnboardingDraft
} from "../../src/lib/onboardingDraft.js";
import { signOutWith } from "../../src/lib/signOutCore.js";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); }
  };
}

const draft = {
  p: { goal: "fat_loss", age: "34", current_weight_lbs: "180", waist_in: "34" },
  pref: { diet_style: "balanced", safety_flags: ["pregnancy"], known_barriers: ["time"] },
  units: "imperial",
  step: 2
};

test("each account gets its own draft key", () => {
  assert.equal(onboardingDraftKey("user-a"), "recompiq_onboarding_v2:user-a");
  assert.notEqual(onboardingDraftKey("user-a"), onboardingDraftKey("user-b"));
  assert.notEqual(onboardingDraftKey("user-a"), LEGACY_ONBOARDING_DRAFT_KEY);
  assert.equal(onboardingDraftKey(""), null);
  assert.equal(onboardingDraftKey(undefined), null);
});

test("a draft saved for one user is never loaded for another", () => {
  const storage = memoryStorage();
  assert.equal(saveOnboardingDraft(storage, "user-a", draft), true);
  assert.equal(loadOnboardingDraft(storage, "user-b"), null);
  assert.deepEqual(loadOnboardingDraft(storage, "user-a"), draft);
  // Without a known user nothing is saved or loaded.
  assert.equal(saveOnboardingDraft(storage, null, draft), false);
  assert.equal(loadOnboardingDraft(storage, null), null);
});

test("the allowlist strips server-record metadata and unknown fields", () => {
  const sanitized = sanitizeOnboardingDraft({
    ...draft,
    email: "a@example.com",
    p: {
      ...draft.p,
      id: "profile-1",
      created_by: "a@example.com",
      created_by_id: "user-a",
      created_date: "2026-01-01",
      age: 34
    },
    pref: { ...draft.pref, id: "pref-1", created_by: "a@example.com", safety_flags: ["pregnancy", 7, ""] }
  });
  const serialized = JSON.stringify(sanitized);
  for (const leaked of ["profile-1", "pref-1", "a@example.com", "created_by", "created_date", "email"]) {
    assert.ok(!serialized.includes(leaked), `${leaked} must not be stored`);
  }
  assert.equal(sanitized.p.age, "34");
  assert.deepEqual(sanitized.pref.safety_flags, ["pregnancy"]);

  const storage = memoryStorage();
  saveOnboardingDraft(storage, "user-a", { ...draft, p: { ...draft.p, created_by: "a@example.com" } });
  assert.ok(!storage.getItem(onboardingDraftKey("user-a")).includes("a@example.com"));

  assert.deepEqual(
    pickProfileDraftFields({ id: "x", created_by_id: "u", height_in: 70, goal: null }),
    { height_in: "70" }
  );
  assert.deepEqual(pickPreferenceDraftFields({ id: "x", tone: "direct", safety_flags: null }), { tone: "direct" });
  assert.equal(sanitizeOnboardingDraft("nope"), null);
  assert.equal(sanitizeOnboardingDraft({ ...draft, step: 99, units: "cubits" }).step, undefined);
});

test("the legacy unscoped draft is deleted on load and never restored", () => {
  const storage = memoryStorage({ [LEGACY_ONBOARDING_DRAFT_KEY]: JSON.stringify(draft) });
  assert.equal(loadOnboardingDraft(storage, "user-b"), null);
  assert.equal(storage.getItem(LEGACY_ONBOARDING_DRAFT_KEY), null);
});

test("a malformed scoped draft is dropped", () => {
  const key = onboardingDraftKey("user-a");
  const storage = memoryStorage({ [key]: "{not json" });
  assert.equal(loadOnboardingDraft(storage, "user-a"), null);
  assert.equal(storage.getItem(key), null);
});

test("clearing removes the user's draft, the legacy key, and on logout every draft", () => {
  const storage = memoryStorage({ [LEGACY_ONBOARDING_DRAFT_KEY]: "{}", unrelated: "keep" });
  saveOnboardingDraft(storage, "user-a", draft);
  saveOnboardingDraft(storage, "user-b", draft);
  clearOnboardingDraft(storage, "user-a");
  assert.equal(storage.getItem(onboardingDraftKey("user-a")), null);
  assert.equal(storage.getItem(LEGACY_ONBOARDING_DRAFT_KEY), null);
  assert.notEqual(storage.getItem(onboardingDraftKey("user-b")), null);

  storage.setItem(LEGACY_ONBOARDING_DRAFT_KEY, "{}");
  clearAllOnboardingDrafts(storage);
  assert.deepEqual([...storage.map.keys()], ["unrelated"]);
});

test("storage failures never throw", () => {
  const broken = {
    get length() { throw new Error("blocked"); },
    key() { throw new Error("blocked"); },
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); }
  };
  assert.equal(loadOnboardingDraft(broken, "user-a"), null);
  assert.equal(saveOnboardingDraft(broken, "user-a", draft), false);
  assert.doesNotThrow(() => clearOnboardingDraft(broken, "user-a"));
  assert.doesNotThrow(() => clearAllOnboardingDrafts(broken));
  assert.doesNotThrow(() => clearAllOnboardingDrafts(null));
});

test("signing out clears every onboarding draft before the SDK logout runs", () => {
  for (const redirectUrl of [undefined, "https://example.test/login"]) {
    const storage = memoryStorage({ unrelated: "keep" });
    saveOnboardingDraft(storage, "user-a", draft);
    saveOnboardingDraft(storage, "user-b", draft);
    storage.setItem(LEGACY_ONBOARDING_DRAFT_KEY, "{}");
    const calls = [];
    const auth = {
      logout(...args) {
        // Logout can navigate away immediately, so the drafts must already be gone.
        calls.push({ args, keysAtLogout: [...storage.map.keys()] });
      }
    };
    signOutWith(auth, storage, redirectUrl);
    assert.deepEqual(calls, [{
      args: redirectUrl === undefined ? [] : [redirectUrl],
      keysAtLogout: ["unrelated"]
    }]);
  }
  // Blocked storage never prevents the logout itself.
  const calls = [];
  signOutWith({ logout: () => calls.push("logout") }, null);
  assert.deepEqual(calls, ["logout"]);
});

test("every logout path goes through signOut, which uses the shared sequence", () => {
  // Wiring only: the clearing order is executed in the test above.
  const signOut = read("src/lib/signOut.js");
  assert.match(signOut, /signOutWith\(base44\.auth, browserStorage\(\), redirectUrl\)/);
  assert.doesNotMatch(signOut, /auth\.logout\(/);
  for (const path of ["src/pages/More.jsx", "src/pages/Profile.jsx", "src/lib/AuthContext.jsx"]) {
    const source = read(path);
    assert.doesNotMatch(source, /auth\.logout\(/, `${path} must log out through signOut`);
    assert.match(source, /signOut\(/, path);
  }
  const onboarding = read("src/pages/Onboarding.jsx");
  assert.doesNotMatch(onboarding, /recompiq_onboarding_v1|localStorage\.(get|set)Item/);
  assert.doesNotMatch(onboarding, /\.\.\.profile\b|\.\.\.preferences\b/);
});
