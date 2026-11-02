import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ACCOUNT_DELETION_CASCADE } from "../../base44/shared/accountDeletionDomain.js";
import { EXPORT_PAGE_SIZE, collectAccountExport, recordsToCsv } from "../../base44/shared/accountExportDomain.js";
import { fakeBase44Client } from "./fakeBase44Client.js";

// The export reads exactly what account deletion would remove, through the
// service role, with the same owner-bound filters.

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const USER = { id: "user-caller", email: "me@example.com", full_name: "Me" };
const OTHER = "user-other";
const NOW = Date.parse("2026-10-06T12:00:00.000Z");

function tables() {
  return {
    DailyLog: [
      { id: "log-mine", created_by_id: USER.id, date: "2026-10-05", weight_lbs: 180 },
      { id: "log-theirs", created_by_id: OTHER, date: "2026-10-05", weight_lbs: 250 }
    ],
    PremiumEntitlement: [
      { id: "ent-mine", owner_id: USER.id, status: "active" },
      { id: "ent-theirs", owner_id: OTHER, status: "active" }
    ],
    PushDevice: [{ id: "push-mine", owner_id: USER.id, token: "ExponentPushToken[secret]", platform: "ios" }],
    Referral: [
      { id: "ref-as-referrer", referrer_id: USER.id, referee_id: OTHER },
      { id: "ref-as-referee", referrer_id: OTHER, referee_id: USER.id },
      { id: "ref-unrelated", referrer_id: OTHER, referee_id: "user-third" }
    ],
    WaitlistEntry: [
      { id: "wait-mine", email: "me@example.com" },
      { id: "wait-theirs", email: "them@example.com" }
    ]
  };
}

test("the export covers every entity the deletion cascade covers, and only the caller's rows", async () => {
  const base44 = fakeBase44Client({ callerId: USER.id, tables: tables() });
  const result = await collectAccountExport(base44.asServiceRole.entities, USER, { nowMs: NOW });

  const cascadeEntities = [...new Set(ACCOUNT_DELETION_CASCADE.map((step) => step.entity))].sort();
  assert.deepEqual(Object.keys(result.entities).sort(), cascadeEntities);
  assert.deepEqual(result.entities.DailyLog.map((row) => row.id), ["log-mine"]);
  assert.deepEqual(result.entities.PremiumEntitlement.map((row) => row.id), ["ent-mine"]);
  assert.deepEqual(result.entities.Referral.map((row) => row.id).sort(), ["ref-as-referee", "ref-as-referrer"]);
  assert.deepEqual(result.entities.WaitlistEntry.map((row) => row.id), ["wait-mine"]);
  assert.equal(result.counts.Referral, 2);
  assert.equal(result.exported_at, new Date(NOW).toISOString());
  assert.deepEqual(result.account, { id: USER.id, email: USER.email, full_name: USER.full_name });
  // Everything goes through the service role; nothing is written.
  assert.ok(base44.calls.every((call) => call.scope === "service" && call.method === "filter"));
});

test("every query the export issues is bound to the caller's id or email", async () => {
  const base44 = fakeBase44Client({ callerId: USER.id, tables: tables() });
  await collectAccountExport(base44.asServiceRole.entities, USER, { nowMs: NOW });
  assert.ok(base44.calls.length >= ACCOUNT_DELETION_CASCADE.length);
  for (const call of base44.calls) {
    const values = Object.values(call.args[0] ?? {});
    assert.ok(values.length > 0, `${call.entity} query is empty`);
    assert.ok(values.every((value) => value === USER.id || value === USER.email), `${call.entity} query ${JSON.stringify(call.args[0])}`);
  }
});

test("push tokens are redacted, not dropped", async () => {
  const base44 = fakeBase44Client({ callerId: USER.id, tables: tables() });
  const result = await collectAccountExport(base44.asServiceRole.entities, USER, { nowMs: NOW });
  assert.deepEqual(result.entities.PushDevice, [{ id: "push-mine", owner_id: USER.id, token: "[redacted]", platform: "ios" }]);
});

test("rows from a store that ignores the owner filter never reach the export", async () => {
  // Every entity answers with another account's row whatever the query says.
  const leaky = new Proxy({}, {
    get: () => ({ filter: async () => [{ id: "leaked", created_by_id: OTHER, owner_id: OTHER, email: "them@example.com" }] })
  });
  const result = await collectAccountExport(leaky, USER, { nowMs: NOW });
  assert.ok(Object.values(result.counts).every((count) => count === 0));
});

test("large entities are paged in full, and a capped entity is reported as truncated", async () => {
  const many = Array.from({ length: EXPORT_PAGE_SIZE * 2 + 3 }, (_, index) => ({
    id: `log-${String(index).padStart(4, "0")}`,
    created_by_id: USER.id,
    created_date: `2026-01-01T00:00:${String(index % 60).padStart(2, "0")}.${String(index).padStart(3, "0")}Z`,
    date: "2026-01-01"
  }));
  const full = await collectAccountExport(fakeBase44Client({ callerId: USER.id, tables: { DailyLog: many } }).asServiceRole.entities, USER);
  assert.equal(full.counts.DailyLog, many.length);
  assert.deepEqual(full.truncated, []);

  const capped = await collectAccountExport(
    fakeBase44Client({ callerId: USER.id, tables: { DailyLog: many } }).asServiceRole.entities,
    USER,
    { maxRows: EXPORT_PAGE_SIZE }
  );
  assert.deepEqual(capped.truncated, ["DailyLog"]);
});

test("an account without an id is refused before anything is read", async () => {
  const base44 = fakeBase44Client({ callerId: USER.id, tables: tables() });
  await assert.rejects(() => collectAccountExport(base44.asServiceRole.entities, { id: "" }), /authenticated user id/);
  assert.equal(base44.calls.length, 0);
});

test("CSV has a column per field, quotes safely, and neutralizes spreadsheet formulas", () => {
  const csv = recordsToCsv([
    { id: "a", date: "2026-10-05", name: 'Oats, "steel cut"', calories: 300, weight_change: -1.2, tags: ["breakfast"] },
    { id: "b", date: "2026-10-06", name: "=HYPERLINK(\"http://x\")", notes: "+1 rep\nnext time" }
  ]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "id,date,calories,name,notes,tags,weight_change");
  assert.equal(lines[1], 'a,2026-10-05,300,"Oats, ""steel cut""",,"[""breakfast""]",-1.2');
  // The embedded newline stays inside its quoted cell.
  assert.equal(lines[2], `b,2026-10-06,,"'=HYPERLINK(""http://x"")","'+1 rep\nnext time",,`);
  assert.equal(recordsToCsv([]), "\r\n");
});

test("exportAccountData authenticates and never takes the account from the request", () => {
  const source = readFileSync(resolve(repoRoot, "base44/functions/exportAccountData/entry.ts"), "utf8");
  assert.match(source, /user = await base44\.auth\.me\(\)/);
  assert.match(source, /if \(!user\?\.id\) return json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/);
  assert.match(source, /collectAccountExport\(base44\.asServiceRole\.entities, user\)/);
  assert.doesNotMatch(source, /req\.json\(\)|body\?\./);
});
