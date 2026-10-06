// Pure helpers for fast food logging: which meal a new entry goes to, what
// "recent foods" means, scaling an entry by its quantity, and copying entries
// to another day. Covered by tests/fitness/food-logging.test.js.

export const LOGGABLE_MEALS = Object.freeze([
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snacks" }
]);

const MACRO_FIELDS = ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"];

/**
 * The meal a food logged at `now` most likely belongs to. Only a default: the
 * user can always pick another meal before adding.
 */
export function defaultMealForTime(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= 4 * 60 && minutes < 10 * 60 + 30) return "breakfast";
  if (minutes >= 10 * 60 + 30 && minutes < 14 * 60 + 30) return "lunch";
  if (minutes >= 17 * 60 && minutes < 21 * 60 + 30) return "dinner";
  return "snack";
}

function recencyKey(entry) {
  return `${entry?.date ?? ""}|${entry?.created_date ?? ""}`;
}

function foodIdentity(entry) {
  const name = String(entry?.name ?? "").trim().toLowerCase();
  const serving = String(entry?.serving_description ?? "").trim().toLowerCase();
  return `${name}|${serving}|${Number(entry?.quantity) || 1}|${Number(entry?.calories) || 0}`;
}

/**
 * Foods the user actually logged, most recent first, one per distinct food
 * (same name, serving, quantity and calories). Pending (unsaved) entries are
 * skipped so a failed add never shows up as "recent".
 */
export function recentLoggedFoods(entries, limit = 8) {
  const sorted = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && !entry.pending && String(entry.name ?? "").trim())
    .sort((a, b) => recencyKey(b).localeCompare(recencyKey(a)));
  const seen = new Set();
  const recent = [];
  for (const entry of sorted) {
    const key = foodIdentity(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    recent.push(entry);
    if (recent.length >= limit) break;
  }
  return recent;
}

function roundField(field, value) {
  return field === "calories" ? Math.round(value) : Math.round(value * 10) / 10;
}

/**
 * Per-unit nutrition for an entry, so changing its quantity scales calories
 * and macros instead of leaving them as they were.
 */
export function perUnitNutrition(entry) {
  const quantity = Number(entry?.quantity) > 0 ? Number(entry.quantity) : 1;
  return Object.fromEntries(
    MACRO_FIELDS.map((field) => [field, (Number(entry?.[field]) || 0) / quantity])
  );
}

/** Calories and macros for `quantity` units at `perUnit`, rounded for display and storage. */
export function scaledNutrition(perUnit, quantity) {
  const q = Number(quantity);
  if (!(q > 0)) return null;
  return Object.fromEntries(MACRO_FIELDS.map((field) => [field, roundField(field, (perUnit[field] || 0) * q)]));
}

/**
 * New diary entries copying `entries` to `date` (and optionally into `meal`),
 * linked to the originals. Ids, owners and timestamps are never copied.
 */
export function copiedEntries(entries, date, meal) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && !entry.pending)
    .map((entry) => ({
      date,
      meal: meal ?? entry.meal ?? "other",
      name: entry.name,
      serving_description: entry.serving_description || "1 serving",
      quantity: Number(entry.quantity) > 0 ? Number(entry.quantity) : 1,
      ...Object.fromEntries(MACRO_FIELDS.map((field) => [field, Number(entry[field]) || 0])),
      source: "repeat",
      repeated_from_id: entry.id,
      ...(entry.source_food_id ? { source_food_id: entry.source_food_id } : {})
    }));
}

export function previousDateKey(date) {
  const [year, month, day] = String(date).split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return previous.toISOString().slice(0, 10);
}
