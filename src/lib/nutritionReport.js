import { addDaysStr } from "./loggingDateUtils.js";

export const NUTRITION_REPORT_METRICS = [
  { key: "calories", label: "Calories", unit: "kcal", target: "calorie_target" },
  { key: "protein_g", label: "Protein", unit: "g", target: "protein_target_g", energyFactor: 4 },
  { key: "carbs_g", label: "Carbs", unit: "g", target: "carb_target_g", energyFactor: 4 },
  { key: "fat_g", label: "Fat", unit: "g", target: "fat_target_g", energyFactor: 9 },
  { key: "fiber_g", label: "Fiber (itemized only)", unit: "g" }
];

export function nutritionReportRange(endDate, days = 7) {
  if (![7, 30].includes(days) || typeof endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
    || !Number.isFinite(Date.parse(`${endDate}T12:00:00Z`))
    || new Date(`${endDate}T12:00:00Z`).toISOString().slice(0, 10) !== endDate) {
    throw new Error("A valid report date and a 7- or 30-day range are required.");
  }
  return { startDate: addDaysStr(endDate, 1 - days), endDate, days };
}

// Null/blank/invalid are unknown; an explicitly recorded zero is a real value.
export function nutritionValue(value) {
  if (typeof value !== "number" && (typeof value !== "string" || value.trim() === "")) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function revision(record) {
  return `${record.updated_date || record.created_date || ""}|${record.created_date || ""}|${record.id || ""}`;
}

function newestBy(records, keyFor) {
  const byKey = new Map();
  for (const record of records) {
    const key = keyFor(record);
    const previous = byKey.get(key);
    if (!previous || revision(record) > revision(previous)) byKey.set(key, record);
  }
  return [...byKey.values()];
}

/** Daily totals already include itemized food: never add the two together.
 * Duplicate daily records resolve to the newest whole record, so a cleared
 * metric is not silently resurrected from an older duplicate.
 */
export function buildNutritionReport({ dailyLogs = [], foodEntries = [], endDate, days = 7, strategy = {} }) {
  const range = nutritionReportRange(endDate, days);
  const inRange = (row) => row && typeof row.date === "string" && row.date >= range.startDate && row.date <= endDate;
  const daily = newestBy(newestBy(dailyLogs.filter(inRange), (row) => row.id || row.date), (row) => row.date);
  // Equal names are NOT duplicate diary entries. Only equal persisted ids are.
  const foods = newestBy(foodEntries.filter((row) => inRange(row) && !row.pending && row.id), (row) => row.id);
  const dailyByDate = new Map(daily.map((row) => [row.date, row]));
  const foodByDate = new Map();
  for (const food of foods) {
    if (!foodByDate.has(food.date)) foodByDate.set(food.date, []);
    foodByDate.get(food.date).push(food);
  }
  const dates = Array.from({ length: days }, (_, index) => addDaysStr(range.startDate, index));
  const byDay = dates.map((date) => {
    const log = dailyByDate.get(date);
    const items = foodByDate.get(date) || [];
    const values = Object.fromEntries(NUTRITION_REPORT_METRICS.map(({ key }) => [key, nutritionValue(log?.[key])]));
    const fiber = items.map((food) => nutritionValue(food.fiber_g));
    values.fiber_g = fiber.length > 0 && fiber.every((value) => value !== null)
      ? fiber.reduce((sum, value) => sum + value, 0) : null;
    const energy = Object.fromEntries(NUTRITION_REPORT_METRICS.filter((metric) => metric.energyFactor)
      .map(({ key, energyFactor }) => [key, values[key] === null ? null : values[key] * energyFactor]));
    const macroComplete = Object.values(energy).every((value) => value !== null);
    return { date, values, energy, macroComplete, macroEnergy: macroComplete ? Object.values(energy).reduce((sum, value) => sum + value, 0) : null };
  });
  const metrics = NUTRITION_REPORT_METRICS.map((metric) => {
    const known = byDay.map((day) => day.values[metric.key]).filter((value) => value !== null);
    const total = known.reduce((sum, value) => sum + value, 0);
    const average = known.length ? total / known.length : null;
    const target = metric.target ? nutritionValue(strategy?.[metric.target]) : null;
    return { ...metric, total, average, target, coverage: known.length, days,
      percentOfTarget: average !== null && target > 0 ? average / target * 100 : null };
  });
  const contributors = Object.fromEntries(NUTRITION_REPORT_METRICS.map(({ key }) => {
    const grouped = new Map();
    for (const food of foods) {
      const value = nutritionValue(food[key]);
      if (value === null) continue;
      const name = typeof food.name === "string" && food.name.trim() ? food.name.trim() : "Unnamed food";
      const groupKey = name.toLocaleLowerCase("en-US");
      const group = grouped.get(groupKey) || { name, total: 0, entries: 0 };
      // Persisted nutrition is already quantity-scaled; do not multiply again.
      group.total += value;
      group.entries += 1;
      grouped.set(groupKey, group);
    }
    return [key, [...grouped.values()].filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 5)];
  }));
  return { ...range, byDay, metrics, contributors, itemizedCount: foods.length,
    macroCoverage: byDay.filter((day) => day.macroComplete).length,
    duplicateDailyCount: dailyLogs.filter(inRange).length - daily.length };
}
