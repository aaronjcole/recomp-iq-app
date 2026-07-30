import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Open Food Facts is a free, public database (no API key required).
const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product";

function pick(nutriments, key, servingG) {
  const sKey = `${key}_serving`;
  const gKey = `${key}_100g`;
  if (nutriments[sKey] != null && nutriments[sKey] !== "") return nutriments[sKey];
  if (nutriments[gKey] != null && nutriments[gKey] !== "" && servingG) {
    return (nutriments[gKey] * servingG) / 100;
  }
  return null;
}

function round(n, d = 1) {
  if (n == null || isNaN(n)) return null;
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const barcode = String(body?.barcode || "").trim();
    if (!barcode) return Response.json({ error: "Barcode is required" }, { status: 400 });

    const url = `${OFF_BASE}/${encodeURIComponent(barcode)}.json?fields=product_name,brands,serving_size,serving_quantity,nutriments`;
    const res = await fetch(url, {
      headers: { "User-Agent": "RecompIQ/1.0 (barcode lookup)" }
    });
    if (!res.ok) return Response.json({ error: "Lookup service unavailable" }, { status: 502 });
    const data = await res.json();

    if (data.status !== 1 || !data.product) {
      return Response.json({ found: false });
    }

    const p = data.product;
    const nutriments = p.nutriments || {};
    const servingG = parseFloat(p.serving_quantity) || null;

    const food = {
      found: true,
      source: "branded",
      source_id: barcode,
      name: p.product_name || `Product ${barcode}`,
      brand_name: p.brands || null,
      serving_description: p.serving_size || (servingG ? `${servingG} g` : "1 serving"),
      serving_grams: servingG,
      calories: round(pick(nutriments, "energy-kcal", servingG), 0),
      protein_g: round(pick(nutriments, "proteins", servingG)),
      carbs_g: round(pick(nutriments, "carbohydrates", servingG)),
      fat_g: round(pick(nutriments, "fat", servingG)),
      fiber_g: round(pick(nutriments, "fiber", servingG)),
      added_sugar_g: round(pick(nutriments, "sugars", servingG)),
      saturated_fat_g: round(pick(nutriments, "saturated-fat", servingG)),
      sodium_mg: round(pick(nutriments, "sodium", servingG), 0),
      tags: ["scanned"]
    };

    return Response.json({ food });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}