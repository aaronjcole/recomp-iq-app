import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const entityDirectory = join(repoRoot, "base44/entities");
const crudOperations = ["create", "read", "update", "delete"];
const userOwnedEntities = [
  "CurrentStrategy",
  "DailyLog",
  "DecisionLedger",
  "ExerciseSession",
  "FoodItem",
  "Habit",
  "HabitEntry",
  "MealTemplate",
  "Recipe",
  "StrengthLog",
  "UserPreferences",
  "UserProfile",
  "WeeklyCheckIn"
];

function readEntity(name) {
  return JSON.parse(readFileSync(join(entityDirectory, `${name}.jsonc`), "utf8"));
}

function serializedRule(entity, operation) {
  return JSON.stringify(entity.rls?.[operation] ?? {});
}

test("all Base44 entity schemas parse and declare complete CRUD rules", () => {
  const schemas = readdirSync(entityDirectory).filter((file) => file.endsWith(".jsonc"));
  assert.ok(schemas.length > 0);

  for (const schemaFile of schemas) {
    const schema = JSON.parse(readFileSync(join(entityDirectory, schemaFile), "utf8"));
    assert.equal(schema.type, "object", `${schemaFile} must be an object entity`);
    for (const operation of crudOperations) {
      assert.ok(schema.rls?.[operation], `${schemaFile} is missing ${operation} RLS`);
    }
  }
});

test("user-owned entities keep ownership checks on every CRUD operation", () => {
  for (const entityName of userOwnedEntities) {
    const entity = readEntity(entityName);
    for (const operation of crudOperations) {
      const rule = serializedRule(entity, operation);
      assert.match(
        rule,
        /"created_by_id":"\{\{user\.id\}\}"/,
        `${entityName}.${operation} must be scoped to the signed-in owner`
      );
    }
  }
});

test("the waitlist remains admin-only and the reserved User entity is not overridden", () => {
  const waitlist = readEntity("WaitlistEntry");
  for (const operation of crudOperations) {
    const rule = serializedRule(waitlist, operation);
    assert.match(rule, /"role":"admin"/, `WaitlistEntry.${operation} must require admin`);
    assert.doesNotMatch(rule, /created_by_id/, `WaitlistEntry.${operation} must not be public`);
  }

  assert.equal(existsSync(join(entityDirectory, "User.jsonc")), false);
});

test("tracked source does not include environment files or high-confidence secret formats", () => {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8"
  })
    .split("\0")
    .filter(Boolean);

  const trackedEnvironmentFiles = tracked.filter(
    (path) => /(^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith(".env.example")
  );
  assert.deepEqual(trackedEnvironmentFiles, [], "environment files must never be committed");

  const textExtensions = new Set([
    ".cjs",
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsonc",
    ".jsx",
    ".md",
    ".mjs",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml"
  ]);
  const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bghp_[A-Za-z0-9]{30,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bsk-[A-Za-z0-9]{32,}\b/
  ];
  const findings = [];

  for (const path of tracked) {
    if (!textExtensions.has(extname(path))) continue;
    const absolutePath = join(repoRoot, path);
    // `git ls-files` still reports a tracked file after it has been removed
    // from the worktree but before its deletion is staged.
    if (!existsSync(absolutePath)) continue;
    const contents = readFileSync(absolutePath, "utf8");
    if (secretPatterns.some((pattern) => pattern.test(contents))) findings.push(path);
  }

  assert.deepEqual(findings, [], "tracked source contains a high-confidence secret pattern");
});

test("service-role account deletion stays scoped to the authenticated user", () => {
  const source = readFileSync(join(repoRoot, "base44/functions/deleteAccount/entry.ts"), "utf8");

  assert.match(source, /user = await base44\.auth\.me\(\)/);
  assert.match(source, /deleteMany\(\{ created_by_id: user\.id \}\)/);
  assert.match(source, /confirmation !== "DELETE"/);
  assert.doesNotMatch(source, /deleteMany\(\{\s*\}\)/);
});

test("AI analysis features never use Base44 public file storage", () => {
  const analysisComponents = [
    "src/components/nutrition/FoodPhotoScan.jsx",
    "src/components/progress/BodyCompositionScan.jsx"
  ];

  for (const path of analysisComponents) {
    const source = readFileSync(join(repoRoot, path), "utf8");
    assert.doesNotMatch(source, /\.Core\.UploadFile\s*\(/, `${path} must not upload publicly`);
    assert.match(source, /createPrivateAnalysisUrl/, `${path} must use private signed URLs`);
  }
});
