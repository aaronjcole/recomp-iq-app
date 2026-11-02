import test from "node:test";
import assert from "node:assert/strict";
import { appendMealTranscript, MEAL_DESCRIPTION_LIMITS, parseMealDescription } from "../../src/lib/mealDescription.js";
import { GENERIC_FOOD_CATALOG } from "../../src/lib/genericFoodCatalog.js";
import { changeDraftQuantity, FOOD_DRAFT_FIELDS, foodDraftPayload, validFoodDraft } from "../../src/lib/foodEntryDraft.js";

const saved = { id: "food-described", name: "My shake", serving_description: "250 ml", calories: 180, protein_g: 25, carbs_g: 10, fat_g: 4 };
const parse = (text, foods = []) => {
  const result = parseMealDescription(text, foods);
  assert.deepEqual(result.errors, [], text);
  return result.drafts;
};
const one = (text, foods) => {
  const drafts = parse(text, foods);
  assert.equal(drafts.length, 1, text);
  return drafts[0];
};
const blank = (draft) => {
  for (const { key } of FOOD_DRAFT_FIELDS) assert.equal(draft[key], "", key);
  assert.equal(validFoodDraft(draft), false);
};

test("describe: numeric, word, mixed, Unicode and hyphenated fractions", () => {
  for (const [amount, expected] of [["1.5", 1.5], ["one and a half", 1.5], ["1 1/2", 1.5], ["1 and 1/2", 1.5], ["1½", 1.5], ["½", 0.5], ["half a", 0.5], ["one-half", 0.5], ["three quarters", 0.75], ["a quarter", 0.25], ["one fourth", 0.25], ["seven eighths", 0.875], ["two thirds", 2 / 3], ["twenty-one", 21], ["one hundred and twenty", 120]]) {
    const draft = one(`${amount} g dry oats`);
    assert.ok(Math.abs(Number(draft.quantity) - expected) < 1e-7, amount);
    assert.match(draft.provenance, /USDA FoodData Central/, amount);
  }
  assert.equal(one("an ounce dry oats").quantity, "1");
  assert.equal(one("100g dry oats").quantity, "100");
});

test("describe: separate items and number-internal and stay distinct", () => {
  const drafts = parse("one and a half cups dry oats and 2 large hard-boiled eggs, 1 medium banana\n1 tbsp olive oil; 100 g avocado plus 100 g roasted chicken breast + 1 small apple.");
  assert.equal(drafts.length, 7);
  assert.equal(drafts[0].quantity, "1.5");
  assert.equal(drafts[1].calories, "155");
  assert.ok(drafts.every((draft) => draft.source === "describe" && validFoodDraft(draft)));
});

test("describe: conservative dictated prefixes do not guess amounts or override mixed fractions", () => {
  for (const prefix of ["I had ", "I ate ", "For breakfast, I had ", "for lunch: I ate ", "I had for dinner ", "For breakfast "]) {
    const drafts = parse(`${prefix}1 medium banana; one and a half cups dry oats and 2 large hard-boiled eggs`);
    assert.equal(drafts.length, 3, prefix);
    assert.equal(drafts[0].calories, "105", prefix);
    assert.equal(drafts[0].quantity, "1", prefix);
    assert.equal(drafts[1].quantity, "1.5", prefix);
    assert.equal(drafts[2].quantity, "2", prefix);
    assert.equal(drafts[0].original_description, `${prefix}1 medium banana`);
  }
  assert.equal(one("I drank 250 ml My shake", [saved]).calories, "180");
  const missing = one("I ate a banana");
  blank(missing);
  assert.equal(missing.quantity, "");
  blank(one("I had dry oats"));
  blank(one("For dinner roasted chicken breast"));
  blank(one("I might have had 1 medium banana"));
});

test("describe: compound saved-food names are exact, case/space insensitive and preserved within lists", () => {
  const foods = [{ ...saved, name: "Mac and cheese" }, { ...saved, name: "Rice, white" }, { ...saved, name: "Large latte" }];
  const drafts = parse("2 servings MAC and cheese and 1 medium banana; 1 serving Rice, white; 1 serving Large latte", foods);
  assert.equal(drafts.length, 4);
  assert.equal(drafts[0].name, "Mac and cheese");
  assert.equal(drafts[0].calories, "360");
  assert.equal(drafts[2].name, "Rice, white");
  assert.equal(drafts[3].name, "Large latte");
  assert.equal(one("1 serving   MY   SHAKE", [saved]).source_food_id, saved.id);
  assert.equal(one("2 servings Mac and cheese.", foods).name, "Mac and cheese");
  assert.equal(one("1 serving Rice, white!", foods).name, "Rice, white");
  assert.equal(one("1 serving Acme, Inc.", [{ ...saved, name: "Acme, Inc." }]).name, "Acme, Inc.");
});

test("describe: exact saved-food matches take priority over generic food without mutating the library", () => {
  const foods = [{ ...saved, name: "dry oats", serving_description: "1 cup" }];
  const before = structuredClone(foods);
  const draft = one("2 cups dry oats", foods);
  assert.match(draft.provenance, /Exact saved food/);
  assert.equal(draft.calories, "360");
  assert.equal(draft.source_food_id, saved.id);
  assert.equal(draft.source, "describe");
  assert.deepEqual(foods, before);
});

test("describe: duplicate saved names, fuzzy and branded names never select a guessed match", () => {
  const duplicate = one("2 servings My shake", [saved, { ...saved, id: "duplicate" }]);
  blank(duplicate);
  assert.match(duplicate.review_note, /Multiple saved/);
  assert.equal(duplicate.source_food_id, undefined);
  for (const text of ["2 servings My shake deluxe", "1 cup Brand X dry oats", "1 cup Starbucks latte", "2 servings banana yogurt"]) {
    const draft = one(text, [saved]);
    blank(draft);
    assert.match(draft.provenance, /Unresolved local/);
    assert.match(draft.review_note, /not guessed/);
  }
});

test("describe: missing amounts, food size and cooking preparation require review", () => {
  for (const text of ["banana", "2 bananas", "2 hard-boiled eggs", "2 eggs", "1 cup rice", "1 bowl dry oats", "1 cup avocado", "1 breast roasted chicken breast"]) {
    const draft = one(text);
    blank(draft);
    assert.match(draft.provenance, /Unresolved local/);
  }
  const missing = one("cup dry oats");
  blank(missing);
  assert.equal(missing.quantity, "");
  assert.match(missing.review_note, /How much/);
  assert.equal(changeDraftQuantity(missing, "1").calories, "307");
  const savedMissing = one("servings My shake", [saved]);
  blank(savedMissing);
  assert.equal(changeDraftQuantity(savedMissing, "2").calories, "360");
});

test("describe: unrecognized units cannot be treated as saved servings", () => {
  for (const text of ["6 ounces My shake", "2 bowls My shake", "2 My shake", "My shake", "1 cup My shake"]) {
    const draft = one(text, [saved]);
    blank(draft);
    assert.equal(draft.quantity, "");
    assert.match(draft.review_note, /portion is unclear/);
    assert.equal(changeDraftQuantity(draft, "2").calories, "");
  }
  const noServing = one("1 serving My shake", [{ ...saved, serving_description: "" }]);
  blank(noServing);
});

test("describe: quantities convert only dimensionally compatible saved-food units", () => {
  assert.equal(one("half a liter My shake", [saved]).calories, "360");
  assert.equal(one("500 ml My shake", [saved]).quantity, "2");
  assert.equal(one("2 servings My shake", [saved]).calories, "360");
  const food = { ...saved, serving_description: "100 g" };
  const draft = one("6 ounces My shake", [food]);
  assert.ok(Math.abs(Number(draft.quantity) - 1.7009713875) < 1e-7);
  assert.equal(draft.calories, "306");
  assert.equal(changeDraftQuantity(draft, "1").calories, "180");
  assert.equal(one("1 lb My shake", [food]).calories, "816");
  const cupFood = { ...saved, serving_description: "2 cups (250 g)" };
  assert.equal(one("1 cup My shake", [cupFood]).quantity, "0.5");
  // Parenthetical weights do not invent density/volume conversions.
  blank(one("8 ounces My shake", [cupFood]));
});

test("describe: blank or malformed saved nutrition never becomes zero", () => {
  const draft = one("2 servings My shake", [{ ...saved, protein_g: null, carbs_g: " ", fat_g: Infinity, fiber_g: -1 }]);
  assert.equal(draft.calories, "360");
  for (const key of ["protein_g", "carbs_g", "fat_g", "fiber_g"]) {
    assert.equal(draft[key], "");
    assert.equal(changeDraftQuantity(draft, "3")[key], "");
  }
  assert.equal(validFoodDraft(draft), false);
  for (const protein_g of [false, true, [], {}, -1, "not a number"]) {
    assert.equal(one("1 serving My shake", [{ ...saved, protein_g }]).protein_g, "");
  }
});

test("describe: audited portions scale from full precision perUnit, not rounded totals", () => {
  const oats = one("half cup dry oats");
  assert.equal(oats.serving_description, "1 cup (81 g)");
  assert.equal(oats.calories, "153");
  assert.equal(changeDraftQuantity(oats, "2").calories, "614");
  assert.equal(changeDraftQuantity(changeDraftQuantity(oats, "2"), "0.5").calories, "153");
  const chicken = one("6 oz roasted chicken breast");
  assert.equal(chicken.serving_description, "1 oz");
  assert.equal(chicken.quantity, "6");
  assert.equal(chicken.calories, "281");
  assert.equal(changeDraftQuantity(chicken, "3").calories, "140");
  assert.equal(one("100 g roasted chicken breast").calories, "165");
  blank(one("6 fl oz roasted chicken breast"));
  assert.equal(one("1 tablespoon olive oil").fat_g, "13.5");
});

test("describe: invalid, ambiguous and out-of-range quantities remain unresolved", () => {
  for (const amount of ["0", "-2", "+2", "1/0", "0/2", "1001", "0.001", "Infinity", "NaN", "1e2", "1-2", "about 2", "a couple of", "some", "two three"]) {
    const draft = one(`${amount} cups dry oats`);
    blank(draft);
    assert.equal(draft.quantity, "", amount);
  }
  blank(one("1000 kg dry oats"));
});

test("describe: limits and food-less input fail atomically with explanatory errors", () => {
  for (const text of [null, {}, "", " \n ", ";;;", "100 g", "2", "1 medium banana; 100 g", "food".repeat(501), "x".repeat(201), Array(13).fill("1 medium banana").join(";"), "1,000 g dry oats", "1,5 cups dry oats"]) {
    const result = parseMealDescription(text);
    assert.deepEqual(result.drafts, [], String(text));
    assert.ok(result.errors.length > 0, String(text));
  }
  assert.equal(parse(Array(12).fill("1 medium banana").join(";")).length, MEAL_DESCRIPTION_LIMITS.items);
  assert.doesNotThrow(() => parseMealDescription("1 medium banana", null));
});

test("describe: catalog audit includes official record IDs, values, units and provenance", () => {
  const verified = [
    [173944, 89, 1.09, 22.84, 0.33, 2.6], [171688, 52, 0.26, 13.81, 0.17, 2.4],
    [171705, 160, 2, 8.53, 14.66, 6.7], [169757, 130, 2.69, 28.17, 0.28, 0.4],
    [173904, 379, 13.15, 67.7, 6.52, 10.1], [173424, 155, 12.58, 1.12, 10.61, 0],
    [171477, 165, 31.02, 0, 3.57, 0], [171413, 884, 0, 0, 100, 0],
  ];
  assert.equal(GENERIC_FOOD_CATALOG.length, verified.length);
  for (const [id, calories, protein_g, carbs_g, fat_g, fiber_g] of verified) {
    const food = GENERIC_FOOD_CATALOG.find((item) => item.fdcId === id);
    assert.deepEqual(food.per100g, { calories, protein_g, carbs_g, fat_g, fiber_g });
    assert.equal(food.sourceUrl, `https://fdc.nal.usda.gov/food-details/${id}/nutrients`);
    assert.equal(food.verifiedOn, "2026-10-20");
    assert.ok(food.usdaDescription && food.aliases.length);
    const draft = one(`100 g ${food.aliases[0]}`);
    assert.equal(Number(draft.calories), calories);
    assert.match(draft.provenance, new RegExp(`FDC ${id};`));
    assert.equal(draft.source_food_id, undefined);
  }
});

test("describe: diary payload drops internal provenance and retains describe source", () => {
  const draft = one("1 medium banana");
  const payload = foodDraftPayload(draft, "2026-10-19", "lunch");
  assert.equal(payload.source, "describe");
  assert.equal(payload.quantity, 1);
  assert.equal(typeof draft.provenance, "string");
  assert.equal(typeof draft.review_note, "string");
  assert.equal(draft.original_description, "1 medium banana");
  for (const key of ["provenance", "review_note", "original_description", "perUnit"]) assert.equal(Object.hasOwn(payload, key), false);
  assert.throws(() => foodDraftPayload(one("2 eggs"), "2026-10-19", "lunch"));
});

test("describe: dictation appends editable separate items without truncation or submission", () => {
  assert.deepEqual(appendMealTranscript("1 medium banana ", " 1 cup dry oats "), { text: "1 medium banana; 1 cup dry oats", error: "" });
  assert.equal(appendMealTranscript("", "1 cup dry oats").text, "1 cup dry oats");
  assert.equal(appendMealTranscript("banana", " ").text, "banana");
  assert.equal(appendMealTranscript("banana", null).text, "banana");
  const before = "a".repeat(1998);
  const result = appendMealTranscript(before, "banana");
  assert.equal(result.text, before);
  assert.match(result.error, /exceed 2,000/);
});
