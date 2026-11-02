// Recipe nutrition is entered for the entire batch, never inferred from a title.
export const RECIPE_NUTRIENTS = [
  { key: "calories", label: "Calories", max: 100000 },
  { key: "protein_g", label: "Protein (g)", max: 10000 },
  { key: "carbs_g", label: "Carbs (g)", max: 15000 },
  { key: "fat_g", label: "Fat (g)", max: 10000 },
  { key: "fiber_g", label: "Fiber (g)", max: 10000 },
];

export function knownRecipeNumber(value) {
  if (value == null || typeof value === "boolean" || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function recipePerServing(recipe) {
  const servings = knownRecipeNumber(recipe.servings);
  const batch = recipe.nutrition_basis === "batch" || recipe.batch_nutrition != null;
  return Object.fromEntries(RECIPE_NUTRIENTS.map(({ key }) => {
    const value = knownRecipeNumber(batch ? recipe.batch_nutrition?.[key] : recipe[`${key}_per_serving`]);
    return [key, !servings || value == null ? null : batch ? value / servings : value];
  }));
}

export function recipeBatchForEditor(recipe) {
  const perServing = recipePerServing(recipe);
  return Object.fromEntries(RECIPE_NUTRIENTS.map(({ key }) => [key,
    recipe.nutrition_basis === "batch" || recipe.batch_nutrition != null
      ? recipe.batch_nutrition?.[key] ?? ""
      : perServing[key] == null ? "" : perServing[key] * recipe.servings,
  ]));
}

export function recipeFood(recipe) {
  return { name: recipe.title, serving_description: "1 recipe serving", ...recipePerServing(recipe) };
}

export function plannedMealFood(meal) {
  return {
    name: meal.title,
    // Planner nutrition already describes this scaled portion. Do not scale twice.
    serving_description: `${meal.servingScale ?? 1}× base portion`,
    calories: knownRecipeNumber(meal.calories),
    protein_g: knownRecipeNumber(meal.proteinG),
    carbs_g: knownRecipeNumber(meal.carbsG),
    fat_g: knownRecipeNumber(meal.fatG),
    fiber_g: knownRecipeNumber(meal.fiberG),
  };
}

// Whitelist user-editable fields; never copy SDK ownership/id metadata to writes.
export function recipeWritePayload(data) {
  const title = String(data.title ?? "").trim();
  const servings = Number(data.servings);
  if (!title || title.length > 200) throw new Error("Enter a recipe title of up to 200 characters.");
  if (!Number.isFinite(servings) || servings < 1 || servings > 1000) throw new Error("Recipe servings must be between 1 and 1000.");
  const ingredients = (data.ingredients ?? []).filter((row) => String(row.name ?? "").trim()).map((row) => {
    const quantity = knownRecipeNumber(row.quantity);
    if (quantity == null || quantity <= 0 || quantity > 100000) throw new Error("Enter a positive quantity for every ingredient.");
    return { name: String(row.name).trim(), quantity, unit: String(row.unit ?? "").trim() || "each" };
  });
  if (!ingredients.length) throw new Error("Add at least one ingredient.");
  const batch_nutrition = {};
  for (const { key, label, max } of RECIPE_NUTRIENTS) {
    const raw = data.batch_nutrition?.[key];
    if (raw == null || String(raw).trim() === "") continue;
    const value = knownRecipeNumber(raw);
    if (value == null || value > max) throw new Error(`${label} must be between 0 and ${max}, or left blank if unknown.`);
    batch_nutrition[key] = value;
  }
  const description = String(data.description ?? "").trim();
  if (description.length > 1000) throw new Error("Recipe description must be at most 1000 characters.");
  return {
    title, servings, ingredients, description,
    instructions: (data.instructions ?? []).map((step) => String(step).trim()).filter(Boolean),
    tags: (data.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean),
    nutrition_basis: "batch", batch_nutrition,
    is_favorite: data.is_favorite === true,
  };
}
