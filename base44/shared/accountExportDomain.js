// What base44/functions/exportAccountData returns: every record the account
// deletion cascade would remove, so "export" and "delete" always cover the
// same data. Driven by accountDeletionPlan, whose filters are bound to the
// authenticated user and never empty (tests/security/account-deletion.test.js
// keeps every entity in that plan). Shared with the app for CSV conversion.

import { accountDeletionPlan } from "./accountDeletionDomain.js";

export const EXPORT_FORMAT_VERSION = 1;
export const EXPORT_PAGE_SIZE = 500;
// Per entity. Far above any real account; a truncated entity is reported.
export const EXPORT_MAX_ROWS = 20_000;

// Values that are credentials or internal plumbing rather than the user's
// data. They are replaced, not dropped, so the export still shows the field.
const REDACTED_FIELDS = Object.freeze({
  PushDevice: ["token"]
});

function matchesQuery(row, query) {
  return Object.entries(query).every(([field, value]) => row?.[field] === value);
}

function redact(entity, row) {
  const fields = REDACTED_FIELDS[entity];
  if (!fields) return row;
  const copy = { ...row };
  for (const field of fields) if (field in copy) copy[field] = "[redacted]";
  return copy;
}

/**
 * Reads every row the deletion plan covers for `user` through `entities` (the
 * service-role accessor, since some entities are server-owned). Rows that do
 * not match their step's owner filter are dropped, so a store that ignored the
 * filter still could not leak another account's data into the export.
 */
export async function collectAccountExport(entities, user, { nowMs = Date.now(), maxRows = EXPORT_MAX_ROWS } = {}) {
  const steps = accountDeletionPlan(user);
  const byEntity = new Map();
  const truncated = [];

  for (const { entity, query } of steps) {
    const rows = byEntity.get(entity) ?? new Map();
    let skip = 0;
    for (;;) {
      const page = await entities[entity].filter(query, "created_date", EXPORT_PAGE_SIZE, skip);
      for (const row of page) {
        if (matchesQuery(row, query) && row?.id && !rows.has(row.id)) rows.set(row.id, redact(entity, row));
      }
      skip += page.length;
      if (page.length < EXPORT_PAGE_SIZE) break;
      if (rows.size >= maxRows) {
        truncated.push(entity);
        break;
      }
    }
    byEntity.set(entity, rows);
  }

  const result = {};
  const counts = {};
  for (const [entity, rows] of byEntity) {
    result[entity] = [...rows.values()];
    counts[entity] = rows.size;
  }
  return {
    format_version: EXPORT_FORMAT_VERSION,
    exported_at: new Date(nowMs).toISOString(),
    account: { id: user.id, email: user.email ?? null, full_name: user.full_name ?? null },
    counts,
    truncated: [...new Set(truncated)],
    entities: result
  };
}

const LEADING_COLUMNS = ["id", "date", "created_date", "updated_date"];

function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Text starting with = + - @ (or a tab/CR) runs as a formula in spreadsheet
  // apps; prefixing a quote keeps it as text. Numbers (a -1.2 lb change) are
  // left alone.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One CSV table for a list of records: a column for every field any row has. */
export function recordsToCsv(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const fields = new Set();
  for (const row of list) for (const key of Object.keys(row ?? {})) fields.add(key);
  const columns = [
    ...LEADING_COLUMNS.filter((key) => fields.has(key)),
    ...[...fields].filter((key) => !LEADING_COLUMNS.includes(key)).sort()
  ];
  const lines = [columns.map(csvCell).join(",")];
  for (const row of list) lines.push(columns.map((key) => csvCell(row?.[key])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
