import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import {
  MealPlanRequestError,
  buildMealSwap,
  normalizeSwapRequest
} from '../../shared/adaptiveMealPlanDomain.js';
import { json, safeErrorDetails } from "../../shared/httpUtils.js";
import { PREMIUM_FEATURES, resolvePremiumAccess } from "../../shared/premiumDomain.js";
import { loadPremiumAccessRecords } from "../../shared/entitlementAccess.js";

// The SDK reads data.message || data.detail, never data.error, so user-facing
// text is sent under both keys.
function failure(message, status) {
  return json({ error: message, message }, { status });
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
      return failure("Premium meal planning access is required", 403);
    }

    // Swaps are keyed by slot and the replaced meal's calories, so AI-variety
    // meals (ids outside the catalog) can be swapped too.
    let request;
    try {
      request = normalizeSwapRequest(await req.json());
    } catch (error) {
      if (error instanceof MealPlanRequestError) return failure(error.message, 400);
      if (error instanceof SyntaxError) return failure('A JSON request body is required', 400);
      throw error;
    }

    const meal = buildMealSwap(request);
    if (!meal) {
      return failure('No compatible swap available for this meal', 404);
    }
    return json({ meal });
  } catch (error) {
    console.error("swapAdaptiveMeal failed", safeErrorDetails(error));
    return failure("The meal could not be swapped right now", 500);
  }
}
