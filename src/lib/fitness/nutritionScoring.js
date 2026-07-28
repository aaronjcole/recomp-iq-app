// Ported 1:1 from RecompIQ src/lib/fitness/nutritionScoring.ts. Pure functions.

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function scoreNutritionQuality(food) {
  const strengths = [];
  const cautions = [];
  if (food.calories <= 0) {
    return { score: 0, label: "needs_context", protein_per_100_cal: 0, fiber_per_100_cal: null, calories_per_gram: null, strengths, cautions: ["Calories are required for nutrition scoring."] };
  }

  const proteinPer100 = (food.protein_g / food.calories) * 100;
  const fiberPer100 = typeof food.fiber_g === "number" ? (food.fiber_g / food.calories) * 100 : null;
  const caloriesPerGram = food.serving_grams ? food.calories / food.serving_grams : null;
  let score = 45;

  if (proteinPer100 >= 8) {
    score += 25;
    strengths.push("High protein per calorie.");
  } else if (proteinPer100 >= 5) {
    score += 15;
    strengths.push("Solid protein density.");
  } else if (proteinPer100 < 2) {
    score -= 10;
    cautions.push("Low protein density.");
  }

  if (fiberPer100 !== null) {
    if (fiberPer100 >= 2) {
      score += 15;
      strengths.push("Helpful fiber density.");
    } else if (fiberPer100 < 0.7) {
      score -= 5;
      cautions.push("Low fiber for satiety.");
    }
  }

  if (caloriesPerGram !== null) {
    if (caloriesPerGram <= 1.2) {
      score += 10;
      strengths.push("Low calorie density.");
    } else if (caloriesPerGram >= 3) {
      score -= 8;
      cautions.push("Energy dense; useful for gaining, easier to overeat during fat loss.");
    }
  }

  if ((food.saturated_fat_g ?? 0) >= 8) {
    score -= 8;
    cautions.push("High saturated fat for one serving.");
  }
  if ((food.sodium_mg ?? 0) >= 900) {
    score -= 8;
    cautions.push("High sodium may affect water weight and blood-pressure goals.");
  }
  if ((food.added_sugar_g ?? 0) >= 15) {
    score -= 8;
    cautions.push("High added sugar for routine use.");
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  const label =
    finalScore >= 75 && proteinPer100 >= 5
      ? "high_satiety"
      : caloriesPerGram !== null && caloriesPerGram >= 3 && proteinPer100 >= 4
        ? "energy_dense"
        : finalScore >= 55
          ? "balanced"
          : "needs_context";

  return {
    score: finalScore,
    label,
    protein_per_100_cal: round(proteinPer100),
    fiber_per_100_cal: fiberPer100 === null ? null : round(fiberPer100),
    calories_per_gram: caloriesPerGram === null ? null : round(caloriesPerGram, 2),
    strengths,
    cautions
  };
}