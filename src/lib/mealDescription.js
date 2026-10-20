import { changeDraftQuantity, createFoodDraft, FOOD_DRAFT_FIELDS } from "./foodEntryDraft.js";
import { GENERIC_FOOD_CATALOG } from "./genericFoodCatalog.js";

export const MEAL_DESCRIPTION_LIMITS = Object.freeze({ characters: 2000, items: 12, itemCharacters: 200, minQuantity: 0.01, maxQuantity: 1000 });

const ONES = "one two three four five six seven eight nine".split(" ");
const SMALL = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = "twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
const UNDER100 = `(?:${SMALL.join("|")}|(?:${TENS.join("|")})(?:[ -](?:${ONES.join("|")}))?)`;
const WORD_INTEGER = `(?:one thousand|(?:${ONES.join("|")}) hundred(?: (?:and )?${UNDER100})?|${UNDER100})`;
const INTEGER = `(?:\\d+(?:\\.\\d+)?|\\.\\d+|${WORD_INTEGER})`;
const FRACTION = "(?:\\d+\\s*/\\s*\\d+|three quarters|two quarters|one quarter|a quarter|quarter|three fourths|two fourths|one fourth|a fourth|fourth|seven eighths|five eighths|three eighths|one eighth|an eighth|eighth|two thirds|one third|a third|third|one half|a half|half)";
const END_QUANTITY = "(?=\\s|$|(?:g|kg|oz|lb|ml)\\b)";
const MIXED_RE = new RegExp(`^(${INTEGER})\\s+(?:and\\s+)?(${FRACTION})${END_QUANTITY}`, "i");
const FRACTION_RE = new RegExp(`^(${FRACTION})${END_QUANTITY}`, "i");
const SINGLE_RE = new RegExp(`^(${FRACTION}|${INTEGER}|an?|a)${END_QUANTITY}`, "i");
// Ignore only a narrow, leading dictation wrapper. This is not meal selection:
// the parent still owns the selected diary meal/date, and missing amounts stay blank.
const DICTATION_LEAD_RE = /^(?:(?:for\s+(?:breakfast|lunch|dinner)\s*[:,]?\s+)?i\s+(?:had|ate|drank)\s+(?:for\s+(?:breakfast|lunch|dinner)\s*[:,]?\s+)?|for\s+(?:breakfast|lunch|dinner)\s*[:,]?\s+)/i;
const UNICODE_FRACTIONS = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };
const MASS = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 };
const UNIT_ALIASES = {
  "fluid ounces": "fl oz", "fluid ounce": "fl oz", "fl oz": "fl oz",
  kilograms: "kg", kilogram: "kg", kg: "kg", grams: "g", gram: "g", g: "g",
  ounces: "oz", ounce: "oz", oz: "oz", pounds: "lb", pound: "lb", lbs: "lb", lb: "lb",
  tablespoons: "tbsp", tablespoon: "tbsp", tbsp: "tbsp", teaspoons: "tsp", teaspoon: "tsp", tsp: "tsp",
  milliliters: "ml", millilitres: "ml", milliliter: "ml", ml: "ml", liters: "l", litres: "l", liter: "l", l: "l",
  cups: "cup", cup: "cup", servings: "serving", serving: "serving",
  small: "small", medium: "medium", large: "large",
  slices: "slice", slice: "slice", pieces: "piece", piece: "piece", bars: "bar", bar: "bar",
  scoops: "scoop", scoop: "scoop", bowls: "bowl", bowl: "bowl", handfuls: "handful", handful: "handful",
  plates: "plate", plate: "plate", containers: "container", container: "container",
  packets: "packet", packet: "packet", bottles: "bottle", bottle: "bottle", cans: "can", can: "can",
};
const UNIT_RE = new RegExp(`^(${Object.keys(UNIT_ALIASES).sort((a, b) => b.length - a.length).join("|")})(?=\\s|$|[.(])\\.?\\s*`, "i");
const AMBIGUOUS_START = /^(?:about\b|around\b|approximately\b|roughly\b|some\b|several\b|few\b|a couple\b|couple\b|a few\b|[-+]\d|\d+(?:\.\d+)?\s*[-–]\s*\d)/i;

const normalize = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const clean = (value) => value.replace(/(\d)?([½¼¾⅓⅔⅛⅜⅝⅞])/g, (_, whole, fraction) => `${whole ? `${whole} ` : ""}${UNICODE_FRACTIONS[fraction]}`).normalize("NFKC").replace(/⁄/g, "/").replace(/\b(one|two|three|five|seven)-(half|quarter|quarters|third|thirds|fourth|fourths|eighth|eighths)\b/gi, "$1 $2").replace(/[ \t]+/g, " ").trim();

function numberValue(text) {
  const words = normalize(text).replace(/-/g, " ");
  if (words === "a" || words === "an") return 1;
  if (/^\d+\s*\/\s*\d+$/.test(words)) {
    const [numerator, denominator] = words.split("/").map(Number);
    return denominator > 0 ? numerator / denominator : NaN;
  }
  if (/half|quarter|third|fourth|eighth/.test(words)) {
    const numerator = Math.max(1, SMALL.indexOf(words.split(" ")[0]));
    return numerator / (/half/.test(words) ? 2 : /quarter|fourth/.test(words) ? 4 : /third/.test(words) ? 3 : 8);
  }
  if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(words)) return Number(words);
  let total = 0;
  for (const word of words.split(" ")) {
    if (word === "and") continue;
    if (word === "hundred") total *= 100;
    else if (word === "thousand") total *= 1000;
    else if (SMALL.includes(word)) total += SMALL.indexOf(word);
    else if (TENS.includes(word)) total += (TENS.indexOf(word) + 2) * 10;
    else return NaN;
  }
  return total;
}

function readQuantity(text) {
  const leadLength = text.match(DICTATION_LEAD_RE)?.[0].length ?? 0;
  const body = text.slice(leadLength);
  const fraction = body.match(FRACTION_RE);
  const mixed = fraction ? null : body.match(MIXED_RE);
  const single = fraction ?? (mixed ? null : body.match(SINGLE_RE));
  return mixed
    ? { value: numberValue(mixed[1]) + numberValue(mixed[2]), end: leadLength + mixed[0].length }
    : single ? { value: numberValue(single[1]), end: leadLength + single[0].length } : { value: null, end: leadLength };
}

function readItem(text, foods = []) {
  const quantity = readQuantity(text);
  let remainder = text.slice(quantity.end).trim().replace(/^of\s+/i, "");
  if (quantity.end && /^a\s+/i.test(remainder) && UNIT_RE.test(remainder.slice(2))) remainder = remainder.slice(2);
  // A saved food may itself start with a unit word (e.g. “Large latte”).
  if (matchesFor(remainder, foods).saved.length) return { quantity: quantity.value, unit: "", name: remainder };
  const unitMatch = remainder.match(UNIT_RE);
  const unit = unitMatch ? UNIT_ALIASES[unitMatch[1].toLowerCase()] : "";
  if (unitMatch) remainder = remainder.slice(unitMatch[0].length).replace(/^of\s+/i, "").trim();
  return { quantity: quantity.value, unit, name: remainder };
}

function matchesFor(name, foods) {
  const key = normalize(name);
  const saved = foods.filter((food) => food && typeof food.name === "string" && normalize(food.name) === key);
  if (saved.length) return { saved, generic: null };
  return { saved: [], generic: GENERIC_FOOD_CATALOG.find((food) => food.aliases.some((alias) => normalize(alias) === key)) ?? null };
}

// Strong separators always split. Soft separators preserve exact known compound
// food names, including “Mac and cheese”; quantity-internal “and” is not split.
function splitItems(description, foods) {
  const result = [];
  const known = (text) => [text, text.replace(/[.!?]+$/, "").trim()].some((candidate) => {
    const match = matchesFor(readItem(candidate, foods).name, foods);
    return match.saved.length > 0 || Boolean(match.generic);
  });
  for (const chunk of description.split(/[;\n]+/).map((item) => item.trim()).filter(Boolean)) {
    let rest = chunk;
    while (rest) {
      if (result.length >= MEAL_DESCRIPTION_LIMITS.items + 1) return result;
      if (known(rest)) { result.push(rest); break; }
      const quantityEnd = readQuantity(rest).end;
      const separators = [...rest.matchAll(/,|\s+(?:and|plus)\s+|\s+\+\s+/gi)].filter((match) => match.index >= quantityEnd);
      if (!separators.length) { result.push(rest); break; }
      const boundary = [...separators].reverse().find((match) => known(rest.slice(0, match.index).trim())) ?? separators[0];
      const left = rest.slice(0, boundary.index).trim();
      if (left) result.push(left);
      rest = rest.slice(boundary.index + boundary[0].length).trim();
    }
  }
  return result;
}

function safeNutrition(food) {
  return Object.fromEntries(FOOD_DRAFT_FIELDS.map(({ key, max }) => {
    const raw = food[key];
    const number = Number(raw);
    return [key, (typeof raw === "number" || typeof raw === "string") && String(raw).trim() !== "" && Number.isFinite(number) && number >= 0 && number <= max ? number : null];
  }));
}

const blankNutrition = (draft) => ({ ...draft, ...Object.fromEntries(FOOD_DRAFT_FIELDS.map(({ key }) => [key, ""])) });
const inBounds = (quantity) => Number.isFinite(quantity) && quantity >= MEAL_DESCRIPTION_LIMITS.minQuantity && quantity <= MEAL_DESCRIPTION_LIMITS.maxQuantity;

function unresolved(item, note, serving = "", quantity = "") {
  return {
    ...createFoodDraft({ name: item.name || item.original }, "describe"),
    serving_description: serving,
    quantity,
    review_note: note,
    provenance: "Unresolved local description; no nutrition inferred.",
    original_description: item.original,
  };
}

function portionedDraft(food, item, quantity, provenance, note, sourceFoodId = undefined) {
  let draft = { ...createFoodDraft(food, "describe", sourceFoodId), provenance, review_note: note, original_description: item.original };
  if (quantity == null) return { ...blankNutrition(draft), quantity: "", review_note: `How much did you have? Enter a quantity of the listed serving. ${note}` };
  if (!inBounds(quantity)) return { ...blankNutrition(draft), quantity: "", review_note: `Use a quantity from 0.01 to 1,000 of the listed serving. ${note}` };
  draft = changeDraftQuantity(draft, String(Number(quantity.toFixed(8))));
  if (!FOOD_DRAFT_FIELDS.every(({ key, max }) => draft[key] === "" || Number(draft[key]) <= max)) {
    return { ...blankNutrition(draft), quantity: "", review_note: "This portion exceeds the nutrition limits. Check the amount and unit before continuing." };
  }
  return draft;
}

function savedDraft(food, item) {
  const serving = typeof food.serving_description === "string" ? clean(food.serving_description) : "";
  const base = readItem(serving);
  let ratio = null;
  if (item.unit === "serving") ratio = 1;
  else if (base.quantity > 0 && base.unit && (!base.name || /^\([^()]+\)$/.test(base.name))) {
    if (item.unit === base.unit) ratio = 1 / base.quantity;
    else if (MASS[item.unit] && MASS[base.unit]) ratio = MASS[item.unit] / (base.quantity * MASS[base.unit]);
    else if (["ml", "l"].includes(item.unit) && ["ml", "l"].includes(base.unit)) ratio = (item.unit === "l" ? 1000 : 1) / (base.quantity * (base.unit === "l" ? 1000 : 1));
  }
  if (!serving || ratio == null) return unresolved(item, `Exact saved-food match, but the portion is unclear. Say “2 servings ${food.name}” or use its saved serving (${serving || "not specified"}). No unit conversion was assumed.`, serving);
  return portionedDraft({ name: food.name, serving_description: serving, ...safeNutrition(food) }, item,
    item.quantity == null ? null : item.quantity * ratio,
    `Exact saved food: ${food.name}${food.id ? ` (ID ${food.id})` : ""}; nutrition per saved serving (${serving}).`,
    `Exact saved-food match. Quantity counts this saved serving: ${serving}. Review its nutrition.`, food.id);
}

function genericDraft(food, item) {
  const grams = MASS[item.unit] ?? food.portions[item.unit];
  if (!grams) return unresolved({ ...item, name: food.name }, `Known generic food, but the portion is unclear. How much did you have? Use a weight${Object.keys(food.portions).length ? ` or a listed size/unit (${Object.keys(food.portions).join(", ")})` : ""}. No serving size was assumed.`);
  const serving = MASS[item.unit] ? `1 ${item.unit}` : `1 ${item.unit} (${grams} g)`;
  return portionedDraft({ name: food.name, serving_description: serving,
    ...Object.fromEntries(FOOD_DRAFT_FIELDS.map(({ key }) => [key, food.per100g[key] * grams / 100])),
  }, item, item.quantity,
  // Keep display provenance wrappable on phones; official record URLs live in the catalog.
  `USDA FoodData Central, SR Legacy, FDC ${food.fdcId}; verified ${food.verifiedOn}; ${grams} g per listed serving.`,
  `Generic estimate: ${food.name}; USDA FoodData Central ${food.fdcId}. Not a brand or recipe estimate. Review preparation and portion.`);
}

/** Pure, bounded, offline parsing; never writes diary/library records.
 * Returns { drafts, errors }. Limit/empty-item errors are atomic (no partial
 * result); unknown foods/portions are editable drafts with blank fields.
 */
export function parseMealDescription(description, savedFoods = []) {
  const fail = (message) => ({ drafts: [], errors: [message] });
  if (typeof description !== "string" || !description.trim()) return fail("Describe at least one food, with an amount if you know it.");
  if (description.length > MEAL_DESCRIPTION_LIMITS.characters) return fail("Keep your description to 2,000 characters or fewer; split a longer meal into batches.");
  if (/\d,\d/.test(description)) return fail("Use a decimal point and no thousands commas in amounts (for example, 1.5 cups). Separate foods with semicolons or new lines.");
  const foods = Array.isArray(savedFoods) ? savedFoods : [];
  const items = splitItems(clean(description), foods);
  if (!items.length) return fail("Describe at least one named food.");
  if (items.length > MEAL_DESCRIPTION_LIMITS.items) return fail("Describe at most 12 foods at a time. Nothing has been added; split this meal into batches.");
  if (items.some((item) => item.length > MEAL_DESCRIPTION_LIMITS.itemCharacters)) return fail("Keep each food to 200 characters or fewer. Separate foods with semicolons or new lines.");
  const drafts = [];
  for (const original of items) {
    const exactSaved = matchesFor(readItem(original, foods).name, foods).saved.length > 0;
    const text = exactSaved ? original : original.replace(/[.!?]+$/, "").trim();
    const item = { ...readItem(text, foods), original };
    if (!/[\p{L}]/u.test(item.name)) return fail(`Name the food for “${original}”, not just its amount or unit. Nothing has been added.`);
    if (AMBIGUOUS_START.test(text) || (item.quantity != null && !inBounds(item.quantity))) {
      drafts.push(unresolved({ ...item, name: original }, "That amount is invalid or ambiguous. Use one positive amount from 0.01 to 1,000, not a range or approximation, and confirm the serving."));
      continue;
    }
    const matches = matchesFor(item.name, foods);
    if (matches.saved.length > 1) drafts.push(unresolved(item, "Multiple saved foods have this exact name. Choose the right saved food or enter nutrition manually; no match was selected."));
    else if (matches.saved.length === 1) drafts.push(savedDraft(matches.saved[0], item));
    else if (matches.generic) drafts.push(genericDraft(matches.generic, item));
    else drafts.push(unresolved(item, "No exact saved-food or starter-catalog match. Search or enter nutrition and confirm the portion in review. Brand, recipe, preparation, and missing nutrients were not guessed.", item.unit ? `1 ${item.unit}` : "", item.unit && item.quantity != null ? String(item.quantity) : ""));
  }
  return { drafts, errors: [] };
}

/** Dictation appends, never submits or silently truncates the editable text. */
export function appendMealTranscript(description, transcript) {
  if (typeof transcript !== "string" || !transcript.trim()) return { text: description, error: "" };
  const text = `${description.trimEnd()}${description.trim() ? "; " : ""}${transcript.trim()}`;
  return text.length <= MEAL_DESCRIPTION_LIMITS.characters
    ? { text, error: "" }
    : { text: description, error: "That dictation would exceed 2,000 characters. Shorten the description or add this meal in batches; the existing text was kept." };
}
