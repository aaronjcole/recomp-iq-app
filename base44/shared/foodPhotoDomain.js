// Shared domain logic for the food-photo estimation backend function.
// Kept out of the client so the prompt, schema, and normalization live
// alongside the server-side LLM call that consumes integration credits.

export const FOOD_PHOTO_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Short food or dish name" },
    serving_description: { type: "string", description: "Human-readable portion, e.g. '1 bowl (≈350g)'" },
    serving_grams: { type: "number", description: "Estimated portion weight in grams" },
    calories: { type: "number", description: "Estimated kcal for the shown portion" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
    fiber_g: { type: "number" },
    confidence: { type: "string", enum: ["low", "moderate", "high"] },
    notes: { type: "string", description: "One-line note on assumptions or items that couldn't be identified" }
  },
  required: ["name", "serving_description", "calories", "protein_g", "carbs_g", "fat_g"]
};

export class FoodPhotoRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "FoodPhotoRequestError";
  }
}

export function buildFoodPhotoPrompt() {
  return `You are a nutrition estimation assistant. Analyze the food in this photo and estimate the nutrition for the VISIBLE PORTION on the plate/in the glass.

Guidelines:
- Identify the dish and its likely ingredients.
- Estimate the portion size as realistically as the photo allows (use the plate/bowl/hand for scale).
- Return per-portion macros (calories, protein, carbs, fat, fiber) for that portion only.
- If multiple items are present, combine into one estimate and name the dish accordingly.
- Be conservative and honest; if the food is ambiguous, give your best estimate and set confidence to "low".
- Do not refuse — always provide your best estimate.

Return ONLY the JSON object matching the schema.`;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeFoodPhotoResult(rawResult) {
  if (!rawResult || typeof rawResult !== "object") {
    throw new FoodPhotoRequestError("No estimate returned");
  }
  const data = rawResult;
  if (data.calories == null) {
    throw new FoodPhotoRequestError("No estimate returned");
  }
  return {
    name: typeof data.name === "string" && data.name ? data.name : "Food",
    serving_description: typeof data.serving_description === "string" ? data.serving_description : "",
    serving_grams: num(data.serving_grams),
    calories: num(data.calories),
    protein_g: num(data.protein_g),
    carbs_g: num(data.carbs_g),
    fat_g: num(data.fat_g),
    fiber_g: num(data.fiber_g),
    confidence: ["low", "moderate", "high"].includes(data.confidence) ? data.confidence : "moderate",
    notes: typeof data.notes === "string" ? data.notes : ""
  };
}