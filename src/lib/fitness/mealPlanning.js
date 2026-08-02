// Ported 1:1 from RecompOne src/lib/fitness/mealPlanning.ts. Pure functions.

import { scoreNutritionQuality } from "./nutritionScoring";

export function rankFoodsForGoal(foods, goal) {
  return foods
    .map((food) => {
      const quality = scoreNutritionQuality(food);
      const goalBoost =
        goal === "fat_loss"
          ? quality.protein_per_100_cal * 2 + (quality.fiber_per_100_cal ?? 0) * 3 - Math.max(0, (quality.calories_per_gram ?? 0) - 2) * 8
          : goal === "gain"
            ? food.protein_g * 0.8 + food.calories / 80
            : quality.score / 10;
      return { food, quality, rank_score: Math.round(quality.score + goalBoost) };
    })
    .sort((a, b) => b.rank_score - a.rank_score);
}

export function buildGroceryListFromRecipes(recipes) {
  const items = new Map();
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      const key = `${ingredient.name.toLowerCase()}-${ingredient.unit.toLowerCase()}`;
      const existing = items.get(key);
      if (existing) existing.quantity += ingredient.quantity;
      else items.set(key, { name: ingredient.name, quantity: ingredient.quantity, unit: ingredient.unit });
    }
  }
  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function suggestRecipesFromPantry(recipes, pantryNames) {
  const pantry = pantryNames.map((name) => name.toLowerCase());
  return recipes
    .map((recipe) => {
      const matches = recipe.ingredients.filter((ingredient) =>
        pantry.some((item) => ingredient.name.toLowerCase().includes(item) || item.includes(ingredient.name.toLowerCase()))
      );
      return { recipe, matched_ingredients: matches.map((item) => item.name), match_score: matches.length / Math.max(1, recipe.ingredients.length) };
    })
    .sort((a, b) => b.match_score - a.match_score);
}