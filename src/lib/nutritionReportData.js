import { ownedQuery } from "../../base44/shared/ownerScope.js";
import { nutritionReportRange } from "./nutritionReport.js";

export const NUTRITION_REPORT_PAGE_SIZE = 250;
export const NUTRITION_REPORT_MAX_RECORDS = 20000;

/** Fetch until an empty page, not merely a short page: a server-side per-page
 * cap can otherwise masquerade as a complete report. A unique id sort keeps
 * equal-date records from arbitrarily moving between offset pages.
 */
export async function fetchNutritionReportEntity(entity, { ownerId, startDate, endDate,
  pageSize = NUTRITION_REPORT_PAGE_SIZE, maxRecords = NUTRITION_REPORT_MAX_RECORDS, maxPages = 200 }) {
  const query = ownedQuery(ownerId, { date: { $gte: startDate, $lte: endDate } });
  const records = new Map();
  let pages = 0;
  let offset = 0;
  let issue = null;
  while (pages < maxPages && offset < maxRecords) {
    let page;
    try {
      page = await entity.filter(query, "id", Math.min(pageSize, maxRecords - offset), offset);
      pages += 1;
    } catch {
      return { records: [...records.values()], complete: false, issue: "error", pages };
    }
    if (!Array.isArray(page) || page.length > Math.min(pageSize, maxRecords - offset)) {
      return { records: [...records.values()], complete: false, issue: "invalid-response", pages };
    }
    if (page.length === 0) return { records: [...records.values()], complete: !issue, issue, pages };
    let added = 0;
    for (const row of page) {
      if (!row || typeof row.id !== "string" || !row.id || row.created_by_id !== ownerId
        || typeof row.date !== "string" || row.date < startDate || row.date > endDate) {
        issue = "invalid-response";
        continue;
      }
      if (records.has(row.id)) issue = "pagination";
      else added += 1;
      const previous = records.get(row.id);
      if (!previous || (row.updated_date || row.created_date || "") > (previous.updated_date || previous.created_date || "")) records.set(row.id, row);
    }
    // Repeated pages (e.g. ignored skip) must never become a complete report.
    if (!added) return { records: [...records.values()], complete: false, issue: issue || "pagination", pages };
    offset += page.length;
  }
  return { records: [...records.values()], complete: false, issue: "limit", pages };
}

export async function fetchNutritionReportData(entities, { ownerId, endDate, days = 7, ...options }) {
  const range = nutritionReportRange(endDate, days);
  // Validate the owner before starting either request; never fall back to an
  // unscoped list, including for admin users whose RLS permits all records.
  ownedQuery(ownerId);
  const [daily, foods] = await Promise.all([
    fetchNutritionReportEntity(entities.DailyLog, { ...options, ...range, ownerId }),
    fetchNutritionReportEntity(entities.FoodLogEntry, { ...options, ...range, ownerId })
  ]);
  return { daily, foods, ...range };
}
