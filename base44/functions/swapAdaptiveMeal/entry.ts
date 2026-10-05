import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { swapMeal, scaleMeal } from '../../shared/adaptiveMealPlanDomain.js';
import { json, safeErrorDetails } from "../../shared/httpUtils.js";
import { PREMIUM_FEATURES, resolvePremiumAccess } from "../../shared/premiumDomain.js";
import { loadPremiumAccessRecords } from "../../shared/entitlementAccess.js";

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

    // Same Premium gate as generateAdaptiveMealPlan, checked before the body is
    // read. A failed entitlement read throws into the 500 below (fails closed).
    const entitlements = await loadPremiumAccessRecords(base44, user, { testerEmails: Deno.env.get("PREMIUM_TESTER_EMAILS") });
    if (resolvePremiumAccess(entitlements).features[PREMIUM_FEATURES.MEAL_PLANNING] !== true) {
      const locked = "Premium meal planning access is required";
      return json({ error: locked, message: locked }, { status: 403 });
    }

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
    console.error("swapAdaptiveMeal failed", safeErrorDetails(error));
    // The SDK reads data.message || data.detail, never data.error.
    const failureMessage = "The meal could not be swapped right now";
    return json({ error: failureMessage, message: failureMessage }, { status: 500 });
  }
}
