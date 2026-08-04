import assert from "node:assert/strict";
import test from "node:test";
import {
  MealPlanRequestError,
  buildAdaptiveMealPlan,
  normalizeMealPlanRequest
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

test("the latest weekly target snapshot takes precedence and low adherence simplifies the week", () => {
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

  assert.equal(plan.dailyTargets.calories, 2050);
  assert.equal(plan.dailyTargets.proteinG, 165);
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
    weekStart: "2026-08-03"
  });
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
