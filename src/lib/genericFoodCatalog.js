/**
 * Audited starter, not a search index. U.S. Department of Agriculture,
 * Agricultural Research Service, FoodData Central (SR Legacy, public domain).
 * Verified 2026-10-20 against GET https://api.nal.usda.gov/fdc/v1/foods
 * with fdcIds below. No API/key/network access is needed at runtime.
 * https://fdc.nal.usda.gov/api-guide/ (data licensing and API documentation)
 * Nutrient IDs: 1008 kcal, 1003 protein, 1005 carbohydrate, 1004 fat, 1079 fiber.
 * Values are per 100 g edible food; portion weights are foodPortions.gramWeight.
 * Aliases deliberately exclude ambiguous preparations (e.g. plain “rice/eggs”).
 */
export const GENERIC_FOOD_CATALOG = [
  {
    fdcId: 173944, name: "Banana, raw", usdaDescription: "Bananas, raw",
    aliases: ["banana", "bananas", "raw banana", "raw bananas"],
    per100g: { calories: 89, protein_g: 1.09, carbs_g: 22.84, fat_g: 0.33, fiber_g: 2.6 },
    portions: { small: 101, medium: 118, large: 136 },
  },
  {
    fdcId: 171688, name: "Apple, raw, with skin",
    usdaDescription: "Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)",
    aliases: ["apple", "apples", "raw apple", "raw apples", "apple with skin", "apples with skin"],
    per100g: { calories: 52, protein_g: 0.26, carbs_g: 13.81, fat_g: 0.17, fiber_g: 2.4 },
    portions: { small: 149, medium: 182, large: 223 },
  },
  {
    fdcId: 171705, name: "Avocado, raw",
    usdaDescription: "Avocados, raw, all commercial varieties",
    aliases: ["avocado", "avocados", "raw avocado", "raw avocados"],
    per100g: { calories: 160, protein_g: 2, carbs_g: 8.53, fat_g: 14.66, fiber_g: 6.7 },
    // No assumed whole-fruit size or cup preparation (cubed vs sliced vs pureed).
    portions: {},
  },
  {
    fdcId: 169757, name: "White long-grain rice, cooked without salt",
    usdaDescription: "Rice, white, long-grain, regular, unenriched, cooked without salt",
    aliases: ["cooked white rice", "cooked long grain white rice", "plain cooked white rice"],
    per100g: { calories: 130, protein_g: 2.69, carbs_g: 28.17, fat_g: 0.28, fiber_g: 0.4 },
    portions: { cup: 158 },
  },
  {
    fdcId: 173904, name: "Oats, dry, unfortified",
    usdaDescription: "Cereals, oats, regular and quick, not fortified, dry",
    aliases: ["dry oats", "dry rolled oats", "dry quick oats"],
    per100g: { calories: 379, protein_g: 13.15, carbs_g: 67.7, fat_g: 6.52, fiber_g: 10.1 },
    portions: { cup: 81 },
  },
  {
    fdcId: 173424, name: "Egg, hard-boiled",
    usdaDescription: "Egg, whole, cooked, hard-boiled",
    aliases: ["hard-boiled egg", "hard-boiled eggs", "hard boiled egg", "hard boiled eggs"],
    per100g: { calories: 155, protein_g: 12.58, carbs_g: 1.12, fat_g: 10.61, fiber_g: 0 },
    portions: { large: 50 },
  },
  {
    fdcId: 171477, name: "Chicken breast, meat only, roasted",
    usdaDescription: "Chicken, broilers or fryers, breast, meat only, cooked, roasted",
    aliases: ["roasted chicken breast", "roast chicken breast", "cooked roasted chicken breast"],
    per100g: { calories: 165, protein_g: 31.02, carbs_g: 0, fat_g: 3.57, fiber_g: 0 },
    // A breast/cup varies in size and chopping; require a weight instead.
    portions: {},
  },
  {
    fdcId: 171413, name: "Olive oil", usdaDescription: "Oil, olive, salad or cooking",
    aliases: ["olive oil"],
    per100g: { calories: 884, protein_g: 0, carbs_g: 0, fat_g: 100, fiber_g: 0 },
    portions: { tbsp: 13.5, tsp: 4.5, cup: 216 },
  },
].map((food) => Object.freeze({
  ...food,
  aliases: Object.freeze(food.aliases),
  per100g: Object.freeze(food.per100g),
  portions: Object.freeze(food.portions),
  sourceUrl: `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`,
  verifiedOn: "2026-10-20",
}));
