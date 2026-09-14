import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { swapMeal, scaleMeal } from '../../shared/adaptiveMealPlanDomain.js';
import { json } from "../../shared/httpUtils.js";

function normalizeDietStyle(value) {
  const diet = String(value ?? '').trim().toLowerCase();
  if (diet.includes('vegan')) return 'vegan';
  if (diet.includes('vegetarian')) return 'vegetarian';
  if (diet.includes('pesc')) return 'pescatarian';
  if (diet.includes('mediterranean')) return 'mediterranean';
  if (diet.includes('lower-carb') || diet.includes('low carb')) return 'lower-carb';
  return 'omnivore';
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const mealId = String(body?.mealId || '');
    const dietStyle = normalizeDietStyle(body?.dietStyle);
    const servingScale = Number(body?.servingScale);
    const avoidIds = Array.isArray(body?.avoidIds)
      ? body.avoidIds.map((id) => String(id))
      : [];

    if (!mealId) {
      return json({ error: 'mealId is required' }, { status: 400 });
    }
    if (!Number.isFinite(servingScale) || servingScale <= 0) {
      return json({ error: 'servingScale must be a positive number' }, { status: 400 });
    }

    const replacement = swapMeal(mealId, dietStyle, avoidIds);
    if (!replacement) {
      return json({ error: 'No compatible swap available for this meal' }, { status: 404 });
    }

    const scaled = scaleMeal(replacement, servingScale);
    return json({ meal: scaled });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
}