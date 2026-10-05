import assert from "node:assert/strict";
import test from "node:test";
import {
  MealPlanRequestError,
  MEAL_PLAN_CALORIE_FLOOR,
  buildAdaptiveMealPlan,
  buildMealSwap,
  groceryListFor,
  mergeAiMealsIntoPlan,
  normalizeMealPlanRequest,
  normalizeSwapRequest,
  proteinBoostScoopsOf,
  swapMeal
} from "../../base44/shared/adaptiveMealPlanDomain.js";

const STRATEGY = {
  calorie_target: 2200,
  protein_target_g: 170,
  carb_target_g: 210,
  fat_target_g: 70,
  goal_type: "body_recomposition"
};

test("adaptive meal planning creates seven target-scaled days and one grocery list", () => {
  const plan = buildAdaptiveMealPlan({
    weekStart: "2026-08-03",
    strategy: STRATEGY,
    preferences: { diet_style: "No restriction" },
    checkIn: null
  });

  assert.equal(plan.weekStart, "2026-08-03");
  assert.equal(plan.days.length, 7);
  assert.equal(plan.dailyTargets.calories, 2200);
  assert.equal(plan.dailyTargets.proteinG, 170);
  assert.equal(plan.adaptation.mode, "balanced_variety");
  assert.ok(plan.groceryList.length >= 10);

  for (const day of plan.days) {
    assert.equal(day.meals.length, 4);
    assert.ok(Math.abs(day.totals.calories - 2200) <= 2);
    assert.ok(day.totals.proteinG >= Math.round(plan.dailyTargets.proteinG * 0.95));
    assert.match(day.date, /^2026-08-(0[3-9])$/);
  }

  const groceryKeys = plan.groceryList.map((item) => `${item.name.toLowerCase()}|${item.unit.toLowerCase()}`);
  assert.equal(new Set(groceryKeys).size, groceryKeys.length);
});

test("the live strategy sets targets even when a check-in snapshot differs, and low adherence simplifies the week", () => {
  const plan = buildAdaptiveMealPlan({
    weekStart: "2026-08-03",
    strategy: STRATEGY,
    preferences: { diet_style: "Mediterranean" },
    checkIn: {
      calorie_adherence: 0.62,
      protein_adherence: 0.7,
      recommendation_decision: "focus_on_adherence",
      targets_for_next_week: {
        calorie_target: 2050,
        protein_target_g: 165,
        carb_target_g: 190,
        fat_target_g: 68
      }
    }
  });

  // A manual-mode user's own targets (or an edit since the check-in) win
  // over the check-in's advisory snapshot.
  assert.equal(plan.dailyTargets.calories, STRATEGY.calorie_target);
  assert.equal(plan.dailyTargets.proteinG, STRATEGY.protein_target_g);
  assert.equal(plan.adaptation.mode, "simplified_repetition");
  assert.match(plan.adaptation.summary, /adherence/i);

  const distinctDayMenus = new Set(
    plan.days.map((day) => day.meals.map((meal) => meal.id).join("|"))
  );
  assert.ok(distinctDayMenus.size <= 3);
});

test("a vegan plan contains no animal-based catalog ingredients", () => {
  const plan = buildAdaptiveMealPlan({
    weekStart: "2026-08-03",
    strategy: STRATEGY,
    preferences: { diet_style: "Vegan" },
    checkIn: null
  });

  const ingredients = plan.days
    .flatMap((day) => day.meals)
    .flatMap((meal) => meal.ingredients)
    .map((ingredient) => ingredient.name.toLowerCase());

  for (const animalFood of ["chicken breast", "lean ground turkey", "salmon", "tuna", "eggs", "greek yogurt", "cottage cheese", "whey protein"]) {
    assert.equal(ingredients.includes(animalFood), false);
  }
  assert.equal(plan.dietStyle, "vegan");
});

test("a lower-carb preference selects a lower-carb rotation", () => {
  const plan = buildAdaptiveMealPlan({
    weekStart: "2026-08-03",
    strategy: { ...STRATEGY, carb_target_g: 120, fat_target_g: 105 },
    preferences: { diet_style: "Lower-carb" },
    checkIn: null
  });

  assert.equal(plan.dietStyle, "lower-carb");
  assert.ok(plan.days.every((day) => day.totals.carbsG <= 140));
  assert.ok(new Set(plan.days.map((day) => day.meals.map((meal) => meal.id).join("|"))).size >= 2);
});

test("meal-plan request dates are strict and invalid nutrition targets fail closed", () => {
  assert.deepEqual(normalizeMealPlanRequest({ weekStart: "2026-08-03" }), {
    weekStart: "2026-08-03",
    mode: "deterministic"
  });
  assert.equal(normalizeMealPlanRequest({ weekStart: "2026-08-03", mode: "ai_variety" }).mode, "ai_variety");
  assert.throws(
    () => normalizeMealPlanRequest({ weekStart: "08/03/2026" }),
    (error) => error instanceof MealPlanRequestError
  );
  assert.throws(
    () => buildAdaptiveMealPlan({
      weekStart: "2026-08-03",
      strategy: { ...STRATEGY, calorie_target: 0 },
      preferences: {},
      checkIn: null
    }),
    (error) => error instanceof MealPlanRequestError
  );
});

test("swapMeal returns a different compatible meal from the same slot", () => {
  const original = swapMeal("overnight-protein-oats", "omnivore", []);
  assert.ok(original);
  assert.notEqual(original.id, "overnight-protein-oats");
  assert.equal(original.slot, "breakfast");

  // Avoiding the swapped-in id yields yet another candidate
  const second = swapMeal("overnight-protein-oats", "omnivore", [original.id]);
  assert.ok(second);
  assert.notEqual(second.id, "overnight-protein-oats");
  assert.notEqual(second.id, original.id);
});

test("swapMeal returns null for an unknown meal id", () => {
  assert.equal(swapMeal("does-not-exist", "omnivore", []), null);
});
test("a reduce_calories decision steers the food mix without shrinking portions a second time", () => {
  const strategy = { ...STRATEGY, calorie_target: 2200 };
  const plan = buildAdaptiveMealPlan({
    weekStart: "2026-08-03",
    strategy,
    preferences: { diet_style: "Omnivore" },
    checkIn: { recommendation_decision: "reduce_calories", calorie_adherence: 0.95, protein_adherence: 0.95 }
  });
  assert.equal(plan.dailyTargets.calories, 2200);
  for (const day of plan.days) {
    assert.ok(Math.abs(day.totals.calories - 2200) <= 2200 * 0.03, `day total ${day.totals.calories} should match the 2200 target`);
  }
  assert.equal(plan.adaptation.portionAdjustment, undefined);
});

test("meal plans never go below the app's 1500 kcal floor", () => {
  const atFloor = buildAdaptiveMealPlan({
    weekStart: "2026-08-03",
    strategy: { ...STRATEGY, calorie_target: 1500 },
    preferences: { diet_style: "Omnivore" },
    checkIn: { recommendation_decision: "reduce_calories", calorie_adherence: 0.95, protein_adherence: 0.95 }
  });
  assert.equal(atFloor.dailyTargets.calories, MEAL_PLAN_CALORIE_FLOOR);
  for (const day of atFloor.days) {
    assert.ok(day.totals.calories >= MEAL_PLAN_CALORIE_FLOOR * 0.97, `day total ${day.totals.calories} fell below the floor`);
  }

  const belowFloor = buildAdaptiveMealPlan({
    weekStart: "2026-08-03",
    strategy: { ...STRATEGY, calorie_target: 1200 },
    preferences: { diet_style: "Omnivore" },
    checkIn: null
  });
  assert.equal(belowFloor.dailyTargets.calories, MEAL_PLAN_CALORIE_FLOOR);
  assert.match(belowFloor.adaptation.summary, /below 1500 kcal/);
});

const ANIMAL_FOODS = ["chicken breast", "lean ground turkey", "salmon", "tuna", "eggs", "greek yogurt", "cottage cheese", "whey protein"];
const groceryKey = (item) => `${item.name.toLowerCase()}|${item.unit.toLowerCase()}`;

function deterministicPlan(dietStyle = "Omnivore", strategy = STRATEGY) {
  return buildAdaptiveMealPlan({
    weekStart: "2026-08-03",
    strategy,
    preferences: { diet_style: dietStyle },
    checkIn: null
  });
}

// Mirrors AdaptiveMealPlan.jsx handleSwap: request -> replacement -> new days.
function swapInPlan(plan, dayIndex, slot) {
  const meal = plan.days[dayIndex].meals.find((item) => item.slot === slot);
  const replacement = buildMealSwap(normalizeSwapRequest({
    mealId: meal.id,
    slot: meal.slot,
    dietStyle: plan.dietStyle,
    targetCalories: meal.calories,
    proteinBoostScoops: proteinBoostScoopsOf(meal),
    avoidIds: plan.days[dayIndex].meals.map((item) => item.id).filter((id) => id !== meal.id)
  }));
  assert.ok(replacement, `a ${slot} swap should be available`);
  const days = plan.days.map((day, index) => index !== dayIndex ? day : {
    ...day,
    meals: day.meals.map((item) => (item.slot === slot ? replacement : item))
  });
  return { meal, replacement, days };
}

test("the grocery list rebuilt after a swap matches the new week exactly", () => {
  const plan = deterministicPlan();
  const { meal, replacement, days } = swapInPlan(plan, 0, "dinner");
  assert.notEqual(replacement.id, meal.id);

  const rebuilt = groceryListFor(days);
  const expected = new Map();
  for (const item of days.flatMap((day) => day.meals).flatMap((entry) => entry.ingredients)) {
    expected.set(groceryKey(item), (expected.get(groceryKey(item)) ?? 0) + item.quantity);
  }
  assert.deepEqual(new Set(rebuilt.map(groceryKey)), new Set(expected.keys()));
  for (const item of rebuilt) {
    assert.ok(Math.abs(item.quantity - expected.get(groceryKey(item))) <= 0.125, `${item.name} quantity`);
  }
  // Ingredients unique to the swapped-out meal leave the list, new ones join it.
  const remaining = new Set(days.flatMap((day) => day.meals).flatMap((entry) => entry.ingredients).map(groceryKey));
  for (const item of meal.ingredients) {
    assert.equal(rebuilt.some((entry) => groceryKey(entry) === groceryKey(item)), remaining.has(groceryKey(item)));
  }
  for (const item of replacement.ingredients) {
    assert.ok(rebuilt.some((entry) => groceryKey(entry) === groceryKey(item)), `${item.name} should be listed`);
  }
  // The planner's own list is the same function over the unswapped week.
  assert.deepEqual(groceryListFor(plan.days), plan.groceryList);
});

test("swapping a protein-boosted snack keeps the boost and the snack's calories", () => {
  const plan = deterministicPlan();
  const dayIndex = plan.days.findIndex((day) => day.meals.some((item) => item.title.endsWith("+ protein boost")));
  assert.ok(dayIndex >= 0, "the omnivore fixture plan should boost at least one snack");
  const { meal, replacement, days } = swapInPlan(plan, dayIndex, "snack");
  assert.ok(proteinBoostScoopsOf(meal) > 0);
  assert.match(replacement.title, /\+ protein boost$/);
  assert.equal(replacement.ingredients.at(-1).name, "whey protein powder");
  assert.ok(Math.abs(replacement.calories - meal.calories) <= 2, "the swap is scaled to the calories it replaces");
  assert.ok(replacement.proteinG >= meal.proteinG * 0.75, `protein ${replacement.proteinG} vs ${meal.proteinG}`);
  const before = plan.days[dayIndex].totals.calories;
  const after = days[dayIndex].meals.reduce((total, item) => total + item.calories, 0);
  assert.ok(Math.abs(after - before) <= 3);
});

test("an AI-variety meal swaps to a same-slot catalog meal for the plan's diet", () => {
  const meal = buildMealSwap(normalizeSwapRequest({
    mealId: "ai-3-lunch",
    slot: "lunch",
    dietStyle: "vegan",
    targetCalories: 640,
    avoidIds: ["ai-3-breakfast", "ai-3-dinner", "ai-3-snack"]
  }));
  assert.ok(meal);
  assert.equal(meal.slot, "lunch");
  assert.doesNotMatch(meal.id, /^ai-/);
  assert.ok(Math.abs(meal.calories - 640) <= 1);
  for (const item of meal.ingredients) {
    assert.equal(ANIMAL_FOODS.some((food) => item.name.toLowerCase().includes(food)), false, item.name);
  }
  assert.equal(swapMeal("ai-3-lunch", "vegan", [], "lunch").slot, "lunch");
  // A catalog id cannot be re-slotted by the caller.
  assert.equal(swapMeal("overnight-protein-oats", "omnivore", [], "dinner"), null);
});

test("swap requests are strictly validated", () => {
  const valid = { mealId: "ai-0-snack", slot: "snack", dietStyle: "omnivore", targetCalories: 400, avoidIds: [] };
  assert.equal(normalizeSwapRequest(valid).proteinBoostScoops, 0);
  for (const invalid of [
    null,
    [],
    { ...valid, mealId: "" },
    { ...valid, mealId: "X".repeat(81) },
    { ...valid, mealId: "<script>" },
    { ...valid, slot: "brunch" },
    { ...valid, slot: undefined },
    { ...valid, targetCalories: Number.NaN },
    { ...valid, targetCalories: "400" },
    { ...valid, targetCalories: 10 },
    { ...valid, targetCalories: 9000 },
    { ...valid, proteinBoostScoops: 1.5 },
    { ...valid, proteinBoostScoops: 5 },
    { ...valid, avoidIds: "oats" },
    { ...valid, avoidIds: Array.from({ length: 17 }, (_, index) => `meal-${index}`) },
    { ...valid, avoidIds: [42] },
    { ...valid, dietStyle: "v".repeat(41) }
  ]) {
    assert.throws(() => normalizeSwapRequest(invalid), (error) => error instanceof MealPlanRequestError, JSON.stringify(invalid));
  }
});

function aiMeal(slot, calories, ingredients = [{ name: "brown rice", quantity: 1, unit: "cup" }]) {
  return { slot, title: `AI ${slot}`, calories, proteinG: Math.round(calories * 0.075), carbsG: Math.round(calories * 0.1), fatG: Math.round(calories * 0.03), ingredients };
}

function aiDay(total = 2200, overrides = {}) {
  const share = { breakfast: 0.25, lunch: 0.3, dinner: 0.3, snack: 0.15 };
  return {
    meals: Object.entries(share).map(([slot, ratio]) => overrides[slot] ?? aiMeal(slot, Math.round(total * ratio), [
      { name: `${slot} lentils`, quantity: 1, unit: "cup" },
      { name: "spinach", quantity: 1, unit: "cup" }
    ]))
  };
}

function mergeAi(days, dietStyle = "vegan") {
  const fallback = deterministicPlan(dietStyle);
  return {
    fallback,
    merged: mergeAiMealsIntoPlan({
      aiOutput: { days },
      weekStart: fallback.weekStart,
      dietStyle: fallback.dietStyle,
      dailyTargets: fallback.dailyTargets,
      adaptation: fallback.adaptation,
      fallbackDays: fallback.days
    })
  };
}

test("valid AI variety days are kept as returned", () => {
  const { merged } = mergeAi(Array.from({ length: 7 }, () => aiDay()));
  assert.equal(merged.adaptation.mode, "ai_variety");
  assert.ok(merged.days.every((day) => day.meals.every((item) => item.id.startsWith("ai-"))));
  assert.deepEqual(merged.days[0].meals.map((item) => item.slot), ["breakfast", "lunch", "dinner", "snack"]);
  assert.deepEqual(merged.groceryList, groceryListFor(merged.days));
  assert.doesNotMatch(merged.adaptation.summary, /standard rotation/);
});

test("an invalid AI day falls back to the deterministic day", () => {
  const cases = {
    "a 700 kcal day": aiDay(700),
    "a day above tolerance": aiDay(2700),
    "a non-vegan ingredient": aiDay(2200, { dinner: aiMeal("dinner", 660, [{ name: "Chicken breast", quantity: 6, unit: "oz" }]) }),
    "a dairy ingredient": aiDay(2200, { breakfast: aiMeal("breakfast", 550, [{ name: "Greek yogurt", quantity: 1, unit: "cup" }]) }),
    "eggs": aiDay(2200, { breakfast: aiMeal("breakfast", 550, [{ name: "eggs", quantity: 3, unit: "piece" }]) }),
    "dairy beside a plant word": aiDay(2200, { breakfast: aiMeal("breakfast", 550, [{ name: "Greek yogurt with chia seeds", quantity: 1, unit: "cup" }]) }),
    "seafood": aiDay(2200, { lunch: aiMeal("lunch", 660, [{ name: "smoked salmon", quantity: 3, unit: "oz" }]) }),
    "an unknown slot": aiDay(2200, { snack: aiMeal("dessert", 330) }),
    "a duplicated slot": aiDay(2200, { snack: aiMeal("lunch", 330) }),
    "NaN macros": aiDay(2200, { lunch: { ...aiMeal("lunch", 660), proteinG: Number.NaN } }),
    "null calories": aiDay(2200, { lunch: { ...aiMeal("lunch", 660), calories: null } }),
    "negative fat": aiDay(2200, { lunch: { ...aiMeal("lunch", 660), fatG: -5 } }),
    "three meals": { meals: aiDay().meals.slice(0, 3) },
    "no ingredients": aiDay(2200, { lunch: aiMeal("lunch", 660, []) })
  };
  for (const [label, badDay] of Object.entries(cases)) {
    const days = Array.from({ length: 7 }, (_, index) => (index === 2 ? badDay : aiDay()));
    const { merged, fallback } = mergeAi(days);
    assert.deepEqual(merged.days[2], fallback.days[2], `${label} should fall back`);
    assert.ok(merged.days[1].meals[0].id.startsWith("ai-"), `${label}: other days stay AI`);
    assert.equal(merged.adaptation.mode, "ai_variety");
    assert.match(merged.adaptation.summary, /1 of 7 days use your standard rotation/);
    assert.deepEqual(merged.groceryList, groceryListFor(merged.days));
  }
  // Plant-based versions of animal foods are fine for a vegan plan.
  const plantDay = aiDay(2200, { breakfast: aiMeal("breakfast", 550, [
    { name: "soy milk", quantity: 1, unit: "cup" },
    { name: "almond butter", quantity: 1, unit: "tbsp" },
    { name: "eggplant", quantity: 1, unit: "piece" },
    { name: "chickpeas", quantity: 1, unit: "cup" },
    { name: "butter beans", quantity: 1, unit: "cup" },
    { name: "vegan mayo", quantity: 1, unit: "tbsp" },
    { name: "Coconut yogurt", quantity: 1, unit: "cup" }
  ]) });
  const { merged } = mergeAi(Array.from({ length: 7 }, () => plantDay));
  assert.ok(merged.days.every((day) => day.meals[0].id.startsWith("ai-")));
});

test("AI days never go below the calorie floor even inside the tolerance", () => {
  const floorStrategy = { ...STRATEGY, calorie_target: 1500 };
  const fallback = deterministicPlan("Omnivore", floorStrategy);
  const merged = mergeAiMealsIntoPlan({
    aiOutput: { days: Array.from({ length: 7 }, (_, index) => aiDay(index < 2 ? 1350 : 1500)) },
    weekStart: fallback.weekStart,
    dietStyle: fallback.dietStyle,
    dailyTargets: fallback.dailyTargets,
    adaptation: fallback.adaptation,
    fallbackDays: fallback.days
  });
  assert.deepEqual(merged.days.slice(0, 2), fallback.days.slice(0, 2));
  assert.ok(merged.days.every((day) => day.totals.calories >= MEAL_PLAN_CALORIE_FLOOR * 0.97));
});

test("mostly-invalid AI output falls back to the whole deterministic week", () => {
  const days = Array.from({ length: 7 }, (_, index) => (index < 4 ? aiDay(700) : aiDay()));
  const { merged, fallback } = mergeAi(days);
  assert.deepEqual(merged.days, fallback.days);
  assert.deepEqual(merged.groceryList, fallback.groceryList);
  assert.equal(merged.adaptation.mode, fallback.adaptation.mode);
  assert.match(merged.adaptation.summary, /AI variety did not meet your calorie targets or diet this time/);
  assert.equal(
    merged.days.flatMap((day) => day.meals).flatMap((item) => item.ingredients)
      .some((item) => ANIMAL_FOODS.includes(item.name.toLowerCase())),
    false
  );
});

test("unlogged adherence does not count as zero adherence", () => {
  const plan = buildAdaptiveMealPlan({
    weekStart: "2026-08-03",
    strategy: STRATEGY,
    preferences: { diet_style: "Omnivore" },
    checkIn: { calorie_adherence: null, protein_adherence: null, recommendation_decision: "keep_plan" }
  });
  assert.equal(plan.adaptation.mode, "balanced_variety");
});
