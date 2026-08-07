const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MEAL_SLOTS = Object.freeze(["breakfast", "lunch", "dinner", "snack"]);

export class MealPlanRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "MealPlanRequestError";
  }
}

const meal = (id, slot, title, diet, calories, proteinG, carbsG, fatG, ingredients) => ({
  id,
  slot,
  title,
  diet,
  calories,
  proteinG,
  carbsG,
  fatG,
  ingredients
});

const ingredient = (name, quantity, unit) => ({ name, quantity, unit });

// A deterministic, auditable starter catalog keeps the first release useful
// without sending nutrition history to an LLM. Portions are scaled to the
// user's already-established calorie target; nutrition values remain estimates.
const MEAL_CATALOG = Object.freeze([
  meal("overnight-protein-oats", "breakfast", "Overnight protein oats", "vegetarian", 480, 38, 58, 12, [
    ingredient("rolled oats", 0.75, "cup"), ingredient("Greek yogurt", 1, "cup"),
    ingredient("berries", 1, "cup"), ingredient("chia seeds", 1, "tbsp")
  ]),
  meal("egg-avocado-toast", "breakfast", "Egg and avocado toast", "vegetarian", 500, 34, 45, 21, [
    ingredient("eggs", 3, "piece"), ingredient("whole-grain bread", 2, "slice"),
    ingredient("avocado", 0.5, "piece"), ingredient("spinach", 1, "cup")
  ]),
  meal("tofu-breakfast-hash", "breakfast", "Tofu breakfast hash", "vegan", 490, 35, 55, 16, [
    ingredient("extra-firm tofu", 8, "oz"), ingredient("potatoes", 8, "oz"),
    ingredient("bell pepper", 1, "piece"), ingredient("spinach", 1, "cup")
  ]),
  meal("soy-berry-oats", "breakfast", "Soy berry oats", "vegan", 470, 32, 62, 11, [
    ingredient("rolled oats", 0.75, "cup"), ingredient("unsweetened soy milk", 1, "cup"),
    ingredient("soy protein powder", 1, "scoop"), ingredient("berries", 1, "cup")
  ]),
  meal("egg-veggie-skillet", "breakfast", "Egg and veggie skillet", "lower-carb", 480, 40, 25, 26, [
    ingredient("eggs", 3, "piece"), ingredient("egg whites", 0.75, "cup"),
    ingredient("spinach", 1, "cup"), ingredient("avocado", 0.5, "piece")
  ]),
  meal("yogurt-flax-smoothie", "breakfast", "Yogurt flax smoothie", "lower-carb", 470, 38, 28, 23, [
    ingredient("Greek yogurt", 1, "cup"), ingredient("berries", 0.5, "cup"),
    ingredient("whey protein powder", 1, "scoop"), ingredient("ground flaxseed", 2, "tbsp")
  ]),
  meal("chicken-rice-bowl", "lunch", "Chicken rice power bowl", "omnivore", 610, 52, 65, 16, [
    ingredient("chicken breast", 6, "oz"), ingredient("brown rice", 1, "cup"),
    ingredient("broccoli", 1.5, "cup"), ingredient("olive oil", 1, "tsp")
  ]),
  meal("turkey-quinoa-bowl", "lunch", "Turkey quinoa crunch bowl", "omnivore", 600, 48, 62, 18, [
    ingredient("lean ground turkey", 6, "oz"), ingredient("quinoa", 1, "cup"),
    ingredient("mixed greens", 2, "cup"), ingredient("tomatoes", 1, "cup")
  ]),
  meal("tuna-chickpea-salad", "lunch", "Tuna and chickpea salad", "pescatarian", 590, 46, 56, 19, [
    ingredient("tuna", 5, "oz"), ingredient("chickpeas", 0.75, "cup"),
    ingredient("mixed greens", 2, "cup"), ingredient("olive oil", 2, "tsp")
  ]),
  meal("lentil-quinoa-bowl", "lunch", "Lentil quinoa power bowl", "vegan", 600, 35, 87, 13, [
    ingredient("lentils", 1, "cup"), ingredient("quinoa", 0.75, "cup"),
    ingredient("mixed greens", 2, "cup"), ingredient("tahini", 1, "tbsp")
  ]),
  meal("tempeh-rice-bowl", "lunch", "Tempeh rice crunch bowl", "vegan", 610, 38, 70, 20, [
    ingredient("tempeh", 6, "oz"), ingredient("brown rice", 1, "cup"),
    ingredient("broccoli", 1.5, "cup"), ingredient("sesame seeds", 1, "tbsp")
  ]),
  meal("chicken-avocado-salad", "lunch", "Chicken avocado salad", "lower-carb", 600, 52, 32, 29, [
    ingredient("chicken breast", 7, "oz"), ingredient("mixed greens", 3, "cup"),
    ingredient("avocado", 0.5, "piece"), ingredient("chickpeas", 0.33, "cup")
  ]),
  meal("tuna-cucumber-bowl", "lunch", "Tuna cucumber crunch bowl", "lower-carb", 590, 48, 35, 28, [
    ingredient("tuna", 6, "oz"), ingredient("cucumber", 1.5, "cup"),
    ingredient("tomatoes", 1, "cup"), ingredient("olive oil", 1, "tbsp")
  ]),
  meal("salmon-potato-plate", "dinner", "Salmon, potatoes, and greens", "pescatarian", 650, 48, 58, 25, [
    ingredient("salmon", 6, "oz"), ingredient("potatoes", 10, "oz"),
    ingredient("green beans", 1.5, "cup"), ingredient("olive oil", 1, "tsp")
  ]),
  meal("shrimp-pasta", "dinner", "Shrimp tomato pasta", "pescatarian", 640, 47, 76, 16, [
    ingredient("shrimp", 7, "oz"), ingredient("whole-grain pasta", 2, "cup"),
    ingredient("tomato sauce", 0.75, "cup"), ingredient("zucchini", 1, "cup")
  ]),
  meal("beef-sweet-potato", "dinner", "Lean beef and sweet potato plate", "omnivore", 660, 50, 60, 24, [
    ingredient("lean beef", 6, "oz"), ingredient("sweet potato", 10, "oz"),
    ingredient("broccoli", 1.5, "cup"), ingredient("olive oil", 1, "tsp")
  ]),
  meal("tofu-noodle-stir-fry", "dinner", "Tofu noodle stir-fry", "vegan", 650, 38, 80, 20, [
    ingredient("extra-firm tofu", 8, "oz"), ingredient("rice noodles", 2, "cup"),
    ingredient("stir-fry vegetables", 2, "cup"), ingredient("peanut sauce", 2, "tbsp")
  ]),
  meal("seitan-sweet-potato", "dinner", "Seitan and sweet potato plate", "vegan", 630, 48, 75, 14, [
    ingredient("seitan", 7, "oz"), ingredient("sweet potato", 10, "oz"),
    ingredient("broccoli", 1.5, "cup"), ingredient("olive oil", 1, "tsp")
  ]),
  meal("salmon-cauliflower", "dinner", "Salmon and cauliflower plate", "lower-carb", 660, 50, 35, 35, [
    ingredient("salmon", 7, "oz"), ingredient("cauliflower", 2, "cup"),
    ingredient("green beans", 1.5, "cup"), ingredient("olive oil", 2, "tsp")
  ]),
  meal("turkey-zucchini-skillet", "dinner", "Turkey zucchini skillet", "lower-carb", 640, 52, 32, 33, [
    ingredient("lean ground turkey", 7, "oz"), ingredient("zucchini", 2, "cup"),
    ingredient("tomato sauce", 0.5, "cup"), ingredient("parmesan", 1, "oz")
  ]),
  meal("yogurt-berry-crunch", "snack", "Yogurt berry crunch", "vegetarian", 360, 32, 38, 9, [
    ingredient("Greek yogurt", 1.25, "cup"), ingredient("berries", 1, "cup"),
    ingredient("high-fiber cereal", 0.5, "cup"), ingredient("almonds", 0.5, "oz")
  ]),
  meal("cottage-fruit-bowl", "snack", "Cottage cheese fruit bowl", "vegetarian", 350, 34, 35, 9, [
    ingredient("cottage cheese", 1, "cup"), ingredient("pineapple", 1, "cup"),
    ingredient("walnuts", 0.5, "oz")
  ]),
  meal("soy-yogurt-crunch", "snack", "Soy yogurt protein crunch", "vegan", 370, 31, 42, 10, [
    ingredient("soy yogurt", 1.25, "cup"), ingredient("soy protein powder", 1, "scoop"),
    ingredient("berries", 1, "cup"), ingredient("pumpkin seeds", 0.5, "oz")
  ]),
  meal("hummus-edamame-snack", "snack", "Hummus and edamame snack plate", "vegan", 380, 28, 43, 13, [
    ingredient("shelled edamame", 1, "cup"), ingredient("hummus", 0.25, "cup"),
    ingredient("carrots", 1.5, "cup"), ingredient("whole-grain pita", 1, "piece")
  ]),
  meal("cottage-cheese-almonds", "snack", "Cottage cheese and almonds", "lower-carb", 350, 32, 22, 16, [
    ingredient("cottage cheese", 1, "cup"), ingredient("almonds", 1, "oz"),
    ingredient("berries", 0.5, "cup")
  ]),
  meal("yogurt-walnut-snack", "snack", "Yogurt walnut snack", "lower-carb", 340, 30, 25, 14, [
    ingredient("Greek yogurt", 1, "cup"), ingredient("walnuts", 1, "oz"),
    ingredient("berries", 0.5, "cup")
  ])
]);

function validDateString(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizeMealPlanRequest(value) {
  if (!value || typeof value !== "object" || !validDateString(value.weekStart)) {
    throw new MealPlanRequestError("weekStart must be a valid date in YYYY-MM-DD format");
  }
  return { weekStart: value.weekStart };
}

function targetNumber(primary, fallback, minimum, maximum, label) {
  const candidate = Number(primary ?? fallback);
  if (!Number.isFinite(candidate) || candidate < minimum || candidate > maximum) {
    throw new MealPlanRequestError(`${label} is outside the supported range`);
  }
  return candidate;
}

function normalizeDietStyle(value) {
  const diet = String(value ?? "").trim().toLowerCase();
  if (diet.includes("vegan")) return "vegan";
  if (diet.includes("vegetarian")) return "vegetarian";
  if (diet.includes("pesc")) return "pescatarian";
  if (diet.includes("mediterranean")) return "mediterranean";
  if (diet.includes("lower-carb") || diet.includes("low carb")) return "lower-carb";
  return "omnivore";
}

function isCompatible(mealDiet, dietStyle) {
  if (mealDiet === "lower-carb") return dietStyle === "lower-carb";
  if (dietStyle === "lower-carb") return false;
  if (mealDiet === "vegan") return true;
  if (mealDiet === "vegetarian") return dietStyle !== "vegan";
  if (mealDiet === "pescatarian") {
    return ["pescatarian", "mediterranean", "omnivore", "lower-carb"].includes(dietStyle);
  }
  return dietStyle === "omnivore";
}

function adherenceRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return number > 1 && number <= 100 ? number / 100 : Math.min(number, 1);
}

function adaptationFor(checkIn) {
  const calorie = adherenceRatio(checkIn?.calorie_adherence);
  const protein = adherenceRatio(checkIn?.protein_adherence);
  const observed = [calorie, protein].filter((value) => value !== null);
  const simplify = observed.some((value) => value < 0.75)
    || checkIn?.recommendation_decision === "focus_on_adherence";

  if (simplify) {
    return {
      mode: "simplified_repetition",
      summary: "Last week's adherence signal favors a simpler rotation with repeated ingredients and fewer decisions."
    };
  }
  if (checkIn?.targets_for_next_week) {
    return {
      mode: "balanced_variety",
      summary: "Portions use the targets from your latest weekly review while keeping a balanced meal rotation."
    };
  }
  return {
    mode: "balanced_variety",
    summary: "This first plan uses your current targets and a balanced meal rotation; future weeks can respond to check-in trends."
  };
}

function roundQuantity(value) {
  return Math.round(value * 4) / 4;
}

function scaleMeal(source, scale) {
  return {
    id: source.id,
    slot: source.slot,
    title: source.title,
    servingScale: Math.round(scale * 100) / 100,
    calories: Math.round(source.calories * scale),
    proteinG: Math.round(source.proteinG * scale),
    carbsG: Math.round(source.carbsG * scale),
    fatG: Math.round(source.fatG * scale),
    ingredients: source.ingredients.map((item) => ({
      ...item,
      quantity: roundQuantity(item.quantity * scale)
    }))
  };
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sumMeals(meals) {
  return meals.reduce((totals, current) => ({
    calories: totals.calories + current.calories,
    proteinG: totals.proteinG + current.proteinG,
    carbsG: totals.carbsG + current.carbsG,
    fatG: totals.fatG + current.fatG
  }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}

function withProteinBoost(sources, targets, dietStyle) {
  const totals = sources.reduce((result, source) => ({
    calories: result.calories + source.calories,
    proteinG: result.proteinG + source.proteinG
  }), { calories: 0, proteinG: 0 });
  const targetDensity = targets.proteinG / targets.calories;
  if (totals.proteinG / totals.calories >= targetDensity) return sources;

  const vegan = dietStyle === "vegan";
  const boost = vegan
    ? { calories: 120, proteinG: 24, carbsG: 4, fatG: 2, name: "soy protein powder" }
    : { calories: 110, proteinG: 23, carbsG: 3, fatG: 1, name: "whey protein powder" };
  const densityGain = boost.proteinG - targetDensity * boost.calories;
  const needed = densityGain > 0
    ? Math.ceil((targetDensity * totals.calories - totals.proteinG) / densityGain)
    : 0;
  const scoops = Math.max(0, Math.min(4, needed));
  if (scoops === 0) return sources;

  return sources.map((source) => source.slot !== "snack" ? source : {
    ...source,
    title: `${source.title} + protein boost`,
    calories: source.calories + boost.calories * scoops,
    proteinG: source.proteinG + boost.proteinG * scoops,
    carbsG: source.carbsG + boost.carbsG * scoops,
    fatG: source.fatG + boost.fatG * scoops,
    ingredients: [...source.ingredients, ingredient(boost.name, scoops, "scoop")]
  });
}

function groceryListFor(days) {
  const combined = new Map();
  for (const ingredientItem of days.flatMap((day) => day.meals).flatMap((mealItem) => mealItem.ingredients)) {
    const key = `${ingredientItem.name.toLowerCase()}|${ingredientItem.unit.toLowerCase()}`;
    const existing = combined.get(key);
    if (existing) existing.quantity += ingredientItem.quantity;
    else combined.set(key, { ...ingredientItem });
  }
  return [...combined.values()]
    .map((item) => ({ ...item, quantity: roundQuantity(item.quantity) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildAdaptiveMealPlan({ weekStart, strategy, preferences, checkIn }) {
  normalizeMealPlanRequest({ weekStart });
  if (!strategy || typeof strategy !== "object") {
    throw new MealPlanRequestError("A current nutrition strategy is required");
  }

  const nextTargets = checkIn?.targets_for_next_week ?? {};
  const dailyTargets = {
    calories: Math.round(targetNumber(nextTargets.calorie_target, strategy.calorie_target, 1000, 6000, "Calorie target")),
    proteinG: Math.round(targetNumber(nextTargets.protein_target_g, strategy.protein_target_g, 20, 500, "Protein target")),
    carbsG: Math.round(targetNumber(nextTargets.carb_target_g, strategy.carb_target_g, 20, 1000, "Carbohydrate target")),
    fatG: Math.round(targetNumber(nextTargets.fat_target_g, strategy.fat_target_g, 20, 300, "Fat target"))
  };
  const dietStyle = normalizeDietStyle(preferences?.diet_style);
  const adaptation = adaptationFor(checkIn);
  const candidates = Object.fromEntries(MEAL_SLOTS.map((slot) => [
    slot,
    MEAL_CATALOG.filter((candidate) => candidate.slot === slot && isCompatible(candidate.diet, dietStyle))
  ]));

  if (MEAL_SLOTS.some((slot) => candidates[slot].length === 0)) {
    throw new MealPlanRequestError("The selected diet style does not have a complete meal rotation");
  }

  const days = Array.from({ length: 7 }, (_, dayIndex) => {
    const menuIndex = adaptation.mode === "simplified_repetition" ? dayIndex % 2 : dayIndex;
    const selectedSources = MEAL_SLOTS.map((slot, slotIndex) => {
      const slotMeals = candidates[slot];
      return slotMeals[(menuIndex + slotIndex) % slotMeals.length];
    });
    const sources = withProteinBoost(selectedSources, dailyTargets, dietStyle);
    const baseCalories = sources.reduce((total, source) => total + source.calories, 0);
    const scale = dailyTargets.calories / baseCalories;
    const meals = sources.map((source) => scaleMeal(source, scale));
    return {
      date: addDays(weekStart, dayIndex),
      meals,
      totals: sumMeals(meals)
    };
  });

  return {
    weekStart,
    dietStyle,
    dailyTargets,
    adaptation,
    days,
    groceryList: groceryListFor(days),
    allergyNotice: "Review every ingredient for allergies, intolerances, medication interactions, and dietary restrictions before using this plan.",
    nutritionNotice: "Calories and macros are estimates for planning—not medical advice. Confirm portions and labels when logging."
  };
}
