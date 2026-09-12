import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { OFF_BASE, fetchOff, parseProduct } from '../../shared/openFoodFacts.js';

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
    console.error("searchFoods auth check failed", error);
    return Response.json({ error: "Could not verify the account" }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "A JSON request body is required" }, { status: 400 });
  }

  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 100) : "";
  if (query.length < 2) {
    return Response.json({ error: "Enter at least 2 characters" }, { status: 400 });
  }

  try {
    const fields = "product_name,brands,serving_size,serving_quantity,nutriments,code";
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=24&fields=${fields}`;
    const res = await fetchOff(url);
    if (!res.ok) return Response.json({ error: "Search service unavailable" }, { status: 502 });
    const data = await res.json();

    const products = Array.isArray(data?.products) ? data.products : [];
    const foods = products
      .map((p) => parseProduct(p, p.code))
      .filter((f) => f.name && f.name !== `Product ${f.source_id}` && f.calories != null)
      .slice(0, 24);

    return Response.json({ foods });
  } catch (error) {
    if (error?.name === "AbortError") {
      return Response.json({ error: "Search service timed out" }, { status: 504 });
    }
    console.error("searchFoods failed", error);
    return Response.json({ error: "Search failed" }, { status: 500 });
  }
}