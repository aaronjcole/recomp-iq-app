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
  ]),

  // ── Expanded breakfast rotation ──
  meal("turkey-bacon-scramble", "breakfast", "Turkey bacon egg scramble", "omnivore", 470, 36, 18, 24, [
    ingredient("eggs", 3, "piece"), ingredient("turkey bacon", 2, "slice"),
    ingredient("spinach", 1, "cup"), ingredient("feta", 1, "oz")
  ]),
  meal("steak-eggs-breakfast", "breakfast", "Steak and eggs breakfast", "omnivore", 540, 38, 20, 30, [
    ingredient("lean steak", 5, "oz"), ingredient("eggs", 2, "piece"),
    ingredient("spinach", 1, "cup"), ingredient("olive oil", 1, "tsp")
  ]),
  meal("protein-pancakes", "breakfast", "Cottage cheese protein pancakes", "vegetarian", 460, 34, 52, 12, [
    ingredient("cottage cheese", 0.5, "cup"), ingredient("eggs", 2, "piece"),
    ingredient("rolled oats", 0.5, "cup"), ingredient("berries", 1, "cup")
  ]),
  meal("veggie-omelette-rice", "breakfast", "Veggie omelette with rice", "vegetarian", 480, 30, 48, 16, [
    ingredient("eggs", 3, "piece"), ingredient("egg whites", 0.5, "cup"),
    ingredient("brown rice", 0.75, "cup"), ingredient("bell pepper", 1, "piece")
  ]),
  meal("smoked-salmon-bagel", "breakfast", "Smoked salmon bagel", "pescatarian", 500, 30, 55, 16, [
    ingredient("smoked salmon", 3, "oz"), ingredient("whole-grain bagel", 1, "piece"),
    ingredient("light cream cheese", 1, "tbsp"), ingredient("capers", 1, "tsp")
  ]),
  meal("peanut-banana-oats", "breakfast", "Peanut butter banana oats", "vegan", 480, 28, 68, 14, [
    ingredient("rolled oats", 0.75, "cup"), ingredient("unsweetened soy milk", 1, "cup"),
    ingredient("peanut butter", 1.5, "tbsp"), ingredient("banana", 1, "piece")
  ]),
  meal("veggie-tofu-scramble", "breakfast", "Tofu veggie scramble", "vegan", 460, 32, 40, 18, [
    ingredient("extra-firm tofu", 7, "oz"), ingredient("spinach", 1, "cup"),
    ingredient("potatoes", 6, "oz"), ingredient("nutritional yeast", 1, "tbsp")
  ]),
  meal("chia-pudding-berry", "breakfast", "Chia seed pudding with berries", "vegan", 450, 22, 65, 14, [
    ingredient("chia seeds", 3, "tbsp"), ingredient("unsweetened soy milk", 1, "cup"),
    ingredient("berries", 1, "cup"), ingredient("maple syrup", 1, "tsp")
  ]),
  meal("oat-protein-shake", "breakfast", "Oat and soy protein shake", "vegan", 470, 34, 58, 12, [
    ingredient("rolled oats", 0.5, "cup"), ingredient("soy protein powder", 1.5, "scoop"),
    ingredient("unsweetened soy milk", 1, "cup"), ingredient("banana", 1, "piece")
  ]),
  meal("quinoa-breakfast-bowl", "breakfast", "Quinoa breakfast bowl", "vegan", 480, 26, 72, 12, [
    ingredient("quinoa", 1, "cup"), ingredient("unsweetened soy milk", 0.5, "cup"),
    ingredient("berries", 1, "cup"), ingredient("almonds", 0.5, "oz")
  ]),
  meal("bacon-egg-muffins", "breakfast", "Bacon and egg muffins", "lower-carb", 460, 36, 18, 26, [
    ingredient("eggs", 3, "piece"), ingredient("turkey bacon", 2, "slice"),
    ingredient("cheddar", 1, "oz"), ingredient("spinach", 0.5, "cup")
  ]),
  meal("avocado-egg-boat", "breakfast", "Avocado egg boats", "lower-carb", 470, 34, 20, 28, [
    ingredient("avocado", 0.5, "piece"), ingredient("eggs", 2, "piece"),
    ingredient("bacon", 2, "slice"), ingredient("chia seeds", 1, "tbsp")
  ]),
  meal("cottage-berry-bowl", "breakfast", "Cottage cheese berry bowl", "lower-carb", 440, 38, 22, 20, [
    ingredient("cottage cheese", 1.25, "cup"), ingredient("berries", 1, "cup"),
    ingredient("almonds", 1, "oz"), ingredient("chia seeds", 1, "tbsp")
  ]),
  meal("protein-waffle", "breakfast", "Protein waffle with yogurt", "lower-carb", 460, 40, 24, 22, [
    ingredient("whey protein powder", 1.5, "scoop"), ingredient("eggs", 2, "piece"),
    ingredient("Greek yogurt", 0.5, "cup"), ingredient("berries", 0.5, "cup")
  ]),
  meal("salmon-avocado-toast", "breakfast", "Salmon avocado toast", "lower-carb", 470, 36, 26, 24, [
    ingredient("smoked salmon", 4, "oz"), ingredient("avocado", 0.5, "piece"),
    ingredient("egg whites", 0.75, "cup"), ingredient("spinach", 1, "cup")
  ]),

  // ── Expanded lunch rotation ──
  meal("steak-salad-bowl", "lunch", "Steak and greens salad bowl", "omnivore", 600, 48, 50, 20, [
    ingredient("lean steak", 6, "oz"), ingredient("mixed greens", 3, "cup"),
    ingredient("quinoa", 0.75, "cup"), ingredient("vinaigrette", 2, "tbsp")
  ]),
  meal("chicken-caesar-wrap", "lunch", "Chicken Caesar wrap", "omnivore", 590, 45, 55, 18, [
    ingredient("chicken breast", 6, "oz"), ingredient("whole-grain wrap", 1, "piece"),
    ingredient("romaine", 2, "cup"), ingredient("light Caesar dressing", 1.5, "tbsp")
  ]),
  meal("black-bean-rice-bowl", "lunch", "Black bean rice bowl", "vegan", 590, 30, 95, 12, [
    ingredient("black beans", 1, "cup"), ingredient("brown rice", 1, "cup"),
    ingredient("salsa", 0.5, "cup"), ingredient("avocado", 0.5, "piece")
  ]),
  meal("chickpea-salad-sandwich", "lunch", "Chickpea salad sandwich", "vegan", 580, 28, 82, 14, [
    ingredient("chickpeas", 1, "cup"), ingredient("whole-grain bread", 2, "slice"),
    ingredient("vegan mayo", 1, "tbsp"), ingredient("mixed greens", 1, "cup")
  ]),
  meal("tofu-stir-fry-rice", "lunch", "Tofu stir-fry with rice", "vegan", 600, 34, 78, 16, [
    ingredient("extra-firm tofu", 7, "oz"), ingredient("brown rice", 1, "cup"),
    ingredient("stir-fry vegetables", 2, "cup"), ingredient("soy sauce", 1, "tbsp")
  ]),
  meal("lentil-curry-rice", "lunch", "Lentil curry with rice", "vegan", 610, 32, 90, 13, [
    ingredient("lentils", 1, "cup"), ingredient("brown rice", 0.75, "cup"),
    ingredient("coconut milk", 0.25, "cup"), ingredient("spinach", 1, "cup")
  ]),
  meal("edamame-noodle-bowl", "lunch", "Edamame noodle bowl", "vegan", 590, 34, 80, 14, [
    ingredient("shelled edamame", 1, "cup"), ingredient("rice noodles", 2, "cup"),
    ingredient("stir-fry vegetables", 1.5, "cup"), ingredient("sesame oil", 1, "tsp")
  ]),
  meal("salmon-avocado-bowl", "lunch", "Salmon avocado quinoa bowl", "pescatarian", 610, 46, 55, 20, [
    ingredient("salmon", 6, "oz"), ingredient("quinoa", 1, "cup"),
    ingredient("avocado", 0.5, "piece"), ingredient("mixed greens", 2, "cup")
  ]),
  meal("cod-veggie-bowl", "lunch", "Cod and roasted veg bowl", "pescatarian", 590, 44, 58, 16, [
    ingredient("cod", 7, "oz"), ingredient("brown rice", 1, "cup"),
    ingredient("roasted vegetables", 2, "cup"), ingredient("olive oil", 1, "tsp")
  ]),
  meal("chicken-pesto-zoodles", "lunch", "Chicken pesto zucchini noodles", "lower-carb", 590, 50, 28, 30, [
    ingredient("chicken breast", 7, "oz"), ingredient("zucchini noodles", 3, "cup"),
    ingredient("pesto", 2, "tbsp"), ingredient("parmesan", 1, "oz")
  ]),
  meal("turkey-avocado-wrap", "lunch", "Turkey avocado lettuce wrap", "lower-carb", 580, 48, 25, 28, [
    ingredient("lean ground turkey", 7, "oz"), ingredient("avocado", 0.5, "piece"),
    ingredient("lettuce", 3, "cup"), ingredient("salsa", 0.25, "cup")
  ]),
  meal("shrimp-cauliflower-bowl", "lunch", "Shrimp cauliflower rice bowl", "lower-carb", 570, 46, 24, 28, [
    ingredient("shrimp", 7, "oz"), ingredient("cauliflower rice", 2, "cup"),
    ingredient("broccoli", 1.5, "cup"), ingredient("olive oil", 1, "tsp")
  ]),
  meal("beef-broccoli-skillet", "lunch", "Beef and broccoli skillet", "lower-carb", 600, 48, 30, 30, [
    ingredient("lean beef", 7, "oz"), ingredient("broccoli", 2, "cup"),
    ingredient("soy sauce", 1, "tbsp"), ingredient("sesame seeds", 1, "tbsp")
  ]),

  // ── Expanded dinner rotation ──
  meal("chicken-stir-fry", "dinner", "Chicken vegetable stir-fry", "omnivore", 640, 48, 62, 20, [
    ingredient("chicken breast", 6, "oz"), ingredient("brown rice", 1, "cup"),
    ingredient("stir-fry vegetables", 2, "cup"), ingredient("teriyaki sauce", 2, "tbsp")
  ]),
  meal("pork-tenderloin-plate", "dinner", "Pork tenderloin with roasted veg", "omnivore", 650, 48, 58, 22, [
    ingredient("pork tenderloin", 6, "oz"), ingredient("sweet potato", 8, "oz"),
    ingredient("brussels sprouts", 1.5, "cup"), ingredient("olive oil", 1, "tsp")
  ]),
  meal("chicken-rice-stew", "dinner", "Chicken rice stew", "omnivore", 630, 46, 65, 16, [
    ingredient("chicken thigh", 6, "oz"), ingredient("brown rice", 1, "cup"),
    ingredient("carrots", 1, "cup"), ingredient("celery", 1, "cup")
  ]),
  meal("chickpea-curry-rice", "dinner", "Chickpea curry with rice", "vegan", 640, 34, 95, 16, [
    ingredient("chickpeas", 1.5, "cup"), ingredient("brown rice", 0.75, "cup"),
    ingredient("coconut milk", 0.33, "cup"), ingredient("spinach", 2, "cup")
  ]),
  meal("tofu-stir-fry-noodles", "dinner", "Tofu stir-fry with noodles", "vegan", 630, 36, 82, 18, [
    ingredient("extra-firm tofu", 7, "oz"), ingredient("rice noodles", 2, "cup"),
    ingredient("stir-fry vegetables", 2, "cup"), ingredient("soy sauce", 1.5, "tbsp")
  ]),
  meal("black-bean-stew", "dinner", "Black bean and sweet potato stew", "vegan", 620, 32, 92, 12, [
    ingredient("black beans", 1.5, "cup"), ingredient("sweet potato", 8, "oz"),
    ingredient("diced tomatoes", 1, "cup"), ingredient("cumin", 1, "tsp")
  ]),
  meal("lentil-shepherds-pie", "dinner", "Lentil shepherd's pie", "vegan", 640, 34, 88, 16, [
    ingredient("lentils", 1.5, "cup"), ingredient("potatoes", 8, "oz"),
    ingredient("mixed vegetables", 1.5, "cup"), ingredient("olive oil", 1, "tsp")
  ]),
  meal("stuffed-bell-peppers", "dinner", "Quinoa stuffed bell peppers", "vegetarian", 620, 30, 85, 18, [
    ingredient("quinoa", 1, "cup"), ingredient("black beans", 0.75, "cup"),
    ingredient("bell peppers", 3, "piece"), ingredient("cheddar", 1.5, "oz")
  ]),
  meal("cod-veggie-bake", "dinner", "Cod and roasted vegetable bake", "pescatarian", 640, 46, 58, 22, [
    ingredient("cod", 7, "oz"), ingredient("potatoes", 8, "oz"),
    ingredient("green beans", 1.5, "cup"), ingredient("olive oil", 1, "tsp")
  ]),
  meal("tuna-melt-casserole", "dinner", "Tuna pasta casserole", "pescatarian", 630, 44, 70, 18, [
    ingredient("tuna", 6, "oz"), ingredient("whole-grain pasta", 1.5, "cup"),
    ingredient("peas", 1, "cup"), ingredient("light cheese", 1.5, "oz")
  ]),
  meal("chicken-cauliflower-skillet", "dinner", "Chicken cauliflower skillet", "lower-carb", 640, 50, 30, 32, [
    ingredient("chicken breast", 7, "oz"), ingredient("cauliflower", 2, "cup"),
    ingredient("heavy cream", 2, "tbsp"), ingredient("parmesan", 1, "oz")
  ]),
  meal("salmon-asparagus-plate", "dinner", "Salmon and asparagus plate", "lower-carb", 650, 48, 30, 34, [
    ingredient("salmon", 7, "oz"), ingredient("asparagus", 2, "cup"),
    ingredient("butter", 1, "tbsp"), ingredient("lemon", 1, "piece")
  ]),
  meal("steak-vegetable-skewers", "dinner", "Steak vegetable skewers", "lower-carb", 660, 50, 32, 32, [
    ingredient("lean beef", 7, "oz"), ingredient("bell pepper", 1, "piece"),
    ingredient("zucchini", 2, "cup"), ingredient("olive oil", 1, "tbsp")
  ]),
  meal("turkey-stuffed-zucchini", "dinner", "Turkey stuffed zucchini boats", "lower-carb", 630, 50, 30, 30, [
    ingredient("lean ground turkey", 7, "oz"), ingredient("zucchini", 2, "piece"),
    ingredient("tomato sauce", 0.5, "cup"), ingredient("mozzarella", 1, "oz")
  ]),

  // ── Expanded snack rotation ──
  meal("apple-almond-butter", "snack", "Apple with almond butter", "vegetarian", 350, 10, 38, 18, [
    ingredient("apple", 1, "piece"), ingredient("almond butter", 2, "tbsp")
  ]),
  meal("protein-shake-snack", "snack", "Protein shake", "omnivore", 330, 32, 28, 8, [
    ingredient("whey protein powder", 1.5, "scoop"), ingredient("milk", 1, "cup"),
    ingredient("banana", 0.5, "piece")
  ]),
  meal("edamame-snack", "snack", "Edamame with sea salt", "vegan", 360, 28, 42, 10, [
    ingredient("shelled edamame", 1.5, "cup"), ingredient("sea salt", 1, "pinch")
  ]),
  meal("peanut-butter-toast", "snack", "Peanut butter banana toast", "vegan", 380, 16, 52, 14, [
    ingredient("whole-grain bread", 2, "slice"), ingredient("peanut butter", 2, "tbsp"),
    ingredient("banana", 1, "piece")
  ]),
  meal("trail-mix-snack", "snack", "Trail mix with dried fruit", "vegan", 370, 14, 48, 16, [
    ingredient("almonds", 1, "oz"), ingredient("raisins", 0.5, "cup"),
    ingredient("dark chocolate chips", 0.5, "oz")
  ]),
  meal("hummus-veggie-plate", "snack", "Hummus and veggie plate", "vegan", 350, 20, 45, 10, [
    ingredient("hummus", 0.5, "cup"), ingredient("carrots", 1.5, "cup"),
    ingredient("cucumber", 1, "cup"), ingredient("cherry tomatoes", 1, "cup")
  ]),
  meal("tuna-celery-boats", "snack", "Tuna celery boats", "pescatarian", 340, 32, 18, 14, [
    ingredient("tuna", 5, "oz"), ingredient("celery", 4, "piece"),
    ingredient("light mayo", 1, "tbsp"), ingredient("dijon mustard", 1, "tsp")
  ]),
  meal("jerky-cheese-snack", "snack", "Turkey jerky and cheese", "lower-carb", 350, 34, 18, 16, [
    ingredient("turkey jerky", 2, "oz"), ingredient("cheddar", 1, "oz"),
    ingredient("almonds", 0.5, "oz")
  ]),
  meal("avocado-cottage-snack", "snack", "Avocado cottage cheese bowl", "lower-carb", 360, 30, 20, 18, [
    ingredient("cottage cheese", 1, "cup"), ingredient("avocado", 0.5, "piece"),
    ingredient("everything bagel seasoning", 1, "tsp")
  ]),
  meal("egg-avocado-snack", "snack", "Hard-boiled eggs and avocado", "lower-carb", 350, 24, 18, 22, [
    ingredient("eggs", 2, "piece"), ingredient("avocado", 0.5, "piece"),
    ingredient("everything bagel seasoning", 1, "tsp")
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
  const mode = value.mode === "ai_variety" ? "ai_variety" : "deterministic";
  return { weekStart: value.weekStart, mode };
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

  // Goal-adaptive: use the check-in's recommendation_decision to steer food
  // mix and portions toward the goal. Reuses the existing decision tree —
  // no new thresholds invented here.
  const decision = checkIn?.recommendation_decision;
  let foodPreference = null; // "lower_calorie" | "higher_calorie" | null
  let portionAdjustment = 1;
  let goalAdaptationNote = "";

  if (decision === "reduce_calories") {
    foodPreference = "lower_calorie";
    portionAdjustment = 0.95;
    goalAdaptationNote = " Portions lean slightly smaller and toward higher-satiety picks to break a plateau.";
  } else if (decision === "increase_calories") {
    foodPreference = "higher_calorie";
    portionAdjustment = 1.05;
    goalAdaptationNote = " Portions nudge slightly larger to support your gain goal.";
  } else if (decision === "increase_steps") {
    goalAdaptationNote = " The plan keeps food steady while your step target steps up.";
  }

  if (simplify) {
    return {
      mode: "simplified_repetition",
      foodPreference,
      portionAdjustment,
      summary: "Last week's adherence signal favors a simpler rotation with repeated ingredients and fewer decisions." + goalAdaptationNote
    };
  }
  if (checkIn?.targets_for_next_week) {
    return {
      mode: "balanced_variety",
      foodPreference,
      portionAdjustment,
      summary: "Portions use the targets from your latest weekly review while keeping a balanced meal rotation." + goalAdaptationNote
    };
  }
  return {
    mode: "balanced_variety",
    foodPreference,
    portionAdjustment,
    summary: "This first plan uses your current targets and a balanced meal rotation; future weeks can respond to check-in trends." + goalAdaptationNote
  };
}

// Sort candidates by calorie density to steer food mix toward the goal.
// For a stalled cut, prefer lower-calorie (higher-satiety) picks; for a
// stalled bulk, prefer higher-calorie picks. No-op when no preference.
function sortCandidatesByPreference(candidates, preference) {
  if (preference === "lower_calorie") {
    return [...candidates].sort((a, b) => a.calories - b.calories);
  }
  if (preference === "higher_calorie") {
    return [...candidates].sort((a, b) => b.calories - a.calories);
  }
  return candidates;
}

/**
 * Deterministic swap: given a meal id + diet style, returns the next
 * compatible candidate (different id) from the expanded catalog. This is a
 * client-side rotation over the catalog — no backend call, no credits.
 *
 * @param {string} mealId — the id of the meal to swap out
 * @param {string} dietStyle — normalized diet style
 * @param {string[]} [avoidIds] — additional meal ids to skip
 * @returns {object|null} the replacement catalog meal, or null if none available
 */
export function swapMeal(mealId, dietStyle, avoidIds = []) {
  const avoid = new Set([mealId, ...avoidIds]);
  const source = MEAL_CATALOG.find((m) => m.id === mealId);
  if (!source) return null;
  const compatible = MEAL_CATALOG.filter(
    (m) => m.slot === source.slot && m.id !== mealId && isCompatible(m.diet, dietStyle) && !avoid.has(m.id)
  );
  if (compatible.length === 0) return null;
  // Pick the next candidate deterministically by catalog order, offset by
  // the source's index so repeated swaps cycle through the catalog.
  const sourceIndex = MEAL_CATALOG.findIndex((m) => m.id === mealId);
  return compatible[sourceIndex % compatible.length];
}

function roundQuantity(value) {
  return Math.round(value * 4) / 4;
}

export function scaleMeal(source, scale) {
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

// ── AI variety path ──
// A single guarded LLM call that produces a genuinely varied week. The
// deterministic expand+swap remains the free default; this path is an optional
// premium upgrade that spends credits only when the user chooses it.

export const AI_VARIETY_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          meals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                slot: { type: "string" },
                title: { type: "string" },
                calories: { type: "number" },
                proteinG: { type: "number" },
                carbsG: { type: "number" },
                fatG: { type: "number" },
                ingredients: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      quantity: { type: "number" },
                      unit: { type: "string" }
                    },
                    required: ["name", "quantity", "unit"]
                  }
                }
              },
              required: ["slot", "title", "calories", "proteinG", "carbsG", "fatG", "ingredients"]
            }
          }
        },
        required: ["meals"]
      }
    }
  },
  required: ["days"]
});

export function buildAiVarietyPrompt({ dailyTargets, dietStyle, checkIn, avoidIds }) {
  const avoidList = Array.isArray(avoidIds) && avoidIds.length > 0
    ? avoidIds.join(", ")
    : "(none)";
  const checkInSummary = checkIn?.recommendation_decision
    ? `Latest check-in recommendation: ${checkIn.recommendation_decision.replace(/_/g, " ")}.`
    : "No check-in data yet — use a balanced rotation.";
  return [
    `You are a sports-nutrition meal planner. Generate 7 days of varied meals for a ${dietStyle} diet.`,
    `Daily targets: ${dailyTargets.calories} kcal, ${dailyTargets.proteinG}g protein, ${dailyTargets.carbsG}g carbs, ${dailyTargets.fatG}g fat.`,
    checkInSummary,
    `Each day must have exactly 4 meals: one breakfast, one lunch, one dinner, one snack.`,
    `Vary the meals across all 7 days — avoid repeating the same meal title twice.`,
    `Do NOT use these already-used meal concepts: ${avoidList}.`,
    `Each meal needs a title, estimated calories, proteinG, carbsG, fatG, and a short ingredient list (name, quantity, unit).`,
    `Keep portions realistic and close to the daily targets when summed across the 4 meals.`,
    `Return only the JSON object matching the schema — no commentary.`
  ].join(" ");
}

// Transforms the LLM output into the full plan shape, computing totals +
// grocery list deterministically. Meals are kept as-returned by the LLM
// (already scaled by the prompt); we only validate and aggregate.
export function mergeAiMealsIntoPlan({ aiOutput, weekStart, dietStyle, dailyTargets, adaptation }) {
  const rawDays = Array.isArray(aiOutput?.days) ? aiOutput.days.slice(0, 7) : [];
  if (rawDays.length !== 7) {
    throw new MealPlanRequestError("The AI variety response did not return 7 days");
  }

  const days = rawDays.map((rawDay, dayIndex) => {
    const rawMeals = Array.isArray(rawDay?.meals) ? rawDay.meals : [];
    const meals = rawMeals.map((raw) => ({
      id: `ai-${dayIndex}-${raw.slot}`,
      slot: raw.slot,
      title: String(raw.title || "AI meal").slice(0, 80),
      servingScale: 1,
      calories: Math.round(Number(raw.calories) || 0),
      proteinG: Math.round(Number(raw.proteinG) || 0),
      carbsG: Math.round(Number(raw.carbsG) || 0),
      fatG: Math.round(Number(raw.fatG) || 0),
      ingredients: Array.isArray(raw.ingredients)
        ? raw.ingredients.slice(0, 8).map((ing) => ({
            name: String(ing.name || "ingredient").slice(0, 60),
            quantity: Math.round((Number(ing.quantity) || 0) * 4) / 4,
            unit: String(ing.unit || "serving").slice(0, 20)
          }))
        : []
    }));
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
    adaptation: { ...adaptation, mode: "ai_variety", summary: "This week was generated with AI variety to maximize meal diversity while staying on target." },
    days,
    groceryList: groceryListFor(days),
    allergyNotice: "Review every ingredient for allergies, intolerances, medication interactions, and dietary restrictions before using this plan.",
    nutritionNotice: "Calories and macros are estimates for planning—not medical advice. Confirm portions and labels when logging."
  };
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
    sortCandidatesByPreference(
      MEAL_CATALOG.filter((candidate) => candidate.slot === slot && isCompatible(candidate.diet, dietStyle)),
      adaptation.foodPreference
    )
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
    const scale = (dailyTargets.calories / baseCalories) * (adaptation.portionAdjustment ?? 1);
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