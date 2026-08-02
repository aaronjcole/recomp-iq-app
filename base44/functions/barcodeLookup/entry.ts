import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// Open Food Facts is a free, public database (no API key required).
const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product";
const LOOKUP_TIMEOUT_MS = 8_000;

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
  if (n == null || !Number.isFinite(Number(n))) return null;
  const f = Math.pow(10, d);
  return Math.round(Number(n) * f) / f;
}

function statusOf(error) {
  return error?.status ?? error?.response?.status;
}

export default async function(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  } catch (error) {
    if (statusOf(error) === 401 || statusOf(error) === 403) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("barcodeLookup auth check failed", error);
    return Response.json({ error: "Could not verify the account" }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "A JSON request body is required" }, { status: 400 });
  }

  const barcode = typeof body?.barcode === "string" ? body.barcode.trim() : "";
  if (!/^\d{8}(?:\d{4}|\d{5}|\d{6})?$/.test(barcode)) {
    return Response.json({ error: "Enter a valid 8, 12, 13, or 14 digit barcode" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const url = `${OFF_BASE}/${encodeURIComponent(barcode)}.json?fields=product_name,brands,serving_size,serving_quantity,nutriments`;
    const res = await fetch(url, {
      headers: { "User-Agent": "RecompOne/1.0 (barcode lookup)" },
      signal: controller.signal
    });
    if (!res.ok) return Response.json({ error: "Lookup service unavailable" }, { status: 502 });
    const data = await res.json();

    if (data.status !== 1 || !data.product) {
      return Response.json({ found: false });
    }

    const p = data.product;
    const nutriments = p.nutriments || {};
    const servingG = parseFloat(p.serving_quantity) || null;
    const sodiumG = pick(nutriments, "sodium", servingG);

    const food = {
      found: true,
      source: "branded",
      source_id: barcode,
      name: String(p.product_name || `Product ${barcode}`).slice(0, 200),
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

    return Response.json({ food });
  } catch (error) {
    if (error?.name === "AbortError") {
      return Response.json({ error: "Lookup service timed out" }, { status: 504 });
    }
    console.error("barcodeLookup failed", error);
    return Response.json({ error: "Lookup failed" }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
