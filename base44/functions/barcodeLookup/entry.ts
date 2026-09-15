import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { OFF_BASE, fetchOff, parseProduct } from '../../shared/openFoodFacts.js';
import { json, statusOf } from "../../shared/httpUtils.js";

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  } catch (error) {
    if (statusOf(error) === 401 || statusOf(error) === 403) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("barcodeLookup auth check failed", error);
    return json({ error: "Could not verify the account" }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "A JSON request body is required" }, { status: 400 });
  }

  const barcode = typeof body?.barcode === "string" ? body.barcode.trim() : "";
  if (!/^\d{8}(?:\d{4}|\d{5}|\d{6})?$/.test(barcode)) {
    return json({ error: "Enter a valid 8, 12, 13, or 14 digit barcode" }, { status: 400 });
  }

  try {
    const url = `${OFF_BASE}/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,serving_size,serving_quantity,nutriments`;
    const res = await fetchOff(url);
    if (!res.ok) return json({ error: "Lookup service unavailable" }, { status: 502 });
    const data = await res.json();

    if (data.status !== 1 || !data.product) {
      return json({ found: false });
    }

    const food = parseProduct(data.product, barcode);
    return json({ food });
  } catch (error) {
    if (error?.name === "AbortError") {
      return json({ error: "Lookup service timed out" }, { status: 504 });
    }
    console.error("barcodeLookup failed", error);
    return json({ error: "Lookup failed" }, { status: 500 });
  }
}