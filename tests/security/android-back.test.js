import test from "node:test";
import assert from "node:assert/strict";
import { resolveAndroidBack } from "../../src/lib/androidBack.js";

const EXIT = { type: "exit" };
const BACK = { type: "back" };

test("Back on /login leaves the app instead of looping through RootRedirect", () => {
  // Cold start on /login (idx 0).
  assert.deepEqual(resolveAndroidBack("/login", 0), EXIT);
  // After navigate("/") was replaced by RootRedirect with /login at idx 1.
  assert.deepEqual(resolveAndroidBack("/login", 1), EXIT);
  assert.deepEqual(resolveAndroidBack("/login/", 3), EXIT);
  assert.deepEqual(resolveAndroidBack("/", 0), EXIT);
  assert.deepEqual(resolveAndroidBack("/coming-soon", 2), EXIT);
  assert.deepEqual(resolveAndroidBack("/hero", 0), EXIT);
});

test("auth flow pages go back to their entry point, or exit with no history", () => {
  for (const path of ["/register", "/forgot-password", "/reset-password"]) {
    assert.deepEqual(resolveAndroidBack(path, 0), EXIT, path);
    assert.deepEqual(resolveAndroidBack(path, 1), BACK, path);
  }
  assert.deepEqual(resolveAndroidBack("/register", undefined), EXIT);
});

test("tab roots exit; child routes go back or return to their tab root", () => {
  for (const path of ["/today", "/nutrition", "/training", "/progress", "/more"]) {
    assert.deepEqual(resolveAndroidBack(path, 0), EXIT, path);
    assert.deepEqual(resolveAndroidBack(path, 4), EXIT, path);
  }
  assert.deepEqual(resolveAndroidBack("/more/coach", 2), BACK);
  assert.deepEqual(resolveAndroidBack("/privacy", 1), BACK);
  assert.deepEqual(resolveAndroidBack("/more/coach", 0), {
    type: "navigate",
    to: "/more",
    replace: true
  });
  assert.deepEqual(resolveAndroidBack("/privacy", 0), {
    type: "navigate",
    to: "/",
    replace: false
  });
});
