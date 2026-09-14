// Shared helpers for Open Food Facts lookups (barcode + name search).
// Used by barcodeLookup and searchFoods so nutrition parsing stays in one place.

export const OFF_BASE = "https://world.openfoodfacts.org/api/v2";
export const DEFAULT_TIMEOUT_MS = 8_000;

export function round(n, d = 1) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const f = Math.pow(10, d);
  return Math.round(Number(n) * f) / f;
}

export function pick(nutriments, key, servingG) {
  const sKey = `${key}_serving`;
  const gKey = `${key}_100g`;
  if (nutriments[sKey] != null && nutriments[sKey] !== "") return nutriments[sKey];
  if (nutriments[gKey] != null && nutriments[gKey] !== "" && servingG) {
    return (nutriments[gKey] * servingG) / 100;
  }
  return null;
}

// Converts a raw OFF product object into the FoodItem-shaped object the
// frontend expects. Accepts an optional barcode for source_id (barcode lookups
// pass the scanned code; search results use the product's own code field).
export function parseProduct(p, barcode = null) {
  const nutriments = p.nutriments || {};
  const servingG = parseFloat(p.serving_quantity) || null;
  const sodiumG = pick(nutriments, "sodium", servingG);
  return {
    found: true,
    source: "branded",
    source_id: barcode || p.code || "",
    name: String(p.product_name || `Product ${p.code || ""}`).slice(0, 200),
    brand_name: p.brands ? String(p.brands).slice(0, 200) : null,
    serving_description: String(p.serving_size || (servingG ? `${servingG} g` : "1 serving")).slice(0, 120),
    serving_grams: servingG,
    calories: round(pick(nutriments, "energy-kcal", servingG), 0),
    protein_g: round(pick(nutriments, "proteins", servingG)),
    carbs_g: round(pick(nutriments, "carbohydrates", servingG)),
    fat_g: round(pick(nutriments, "fat", servingG)),
    fiber_g: round(pick(nutriments, "fiber", servingG)),
    added_sugar_g: round(pick(nutriments, "sugars", servingG)),
    saturated_fat_g: round(pick(nutriments, "saturated-fat", servingG)),
    // Open Food Facts reports sodium in grams; the FoodItem entity stores mg.
    sodium_mg: sodiumG == null ? null : round(Number(sodiumG) * 1000, 0),
    tags: ["scanned"]
  };
}

export async function fetchOff(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: {
        "User-Agent": "RecompOne/1.0 (+https://recomp-iq.base44.app)",
        "Accept": "application/json"
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}