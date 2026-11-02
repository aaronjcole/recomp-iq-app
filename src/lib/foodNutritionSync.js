import { statusOf } from "../../base44/shared/httpUtils.js";

export function newNutritionOperationId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function uncertain(error) {
  return Object.assign(new Error("We couldn't confirm the meal's totals. Review the incomplete diary items before trying again."), {
    ambiguousNutrition: true, reconciliationRequired: true, cause: error
  });
}

// Never blindly replay an increment. Only a read-only receipt lookup on a
// supporting backend can prove either that it committed or that a retry is safe.
// Older backends reject the status kind; that is uncertainty, not permission to
// repeat the write. This keeps a staggered frontend/backend rollout safe.
export async function invokeFoodNutritionUpdate(functions, body, assertActive = () => {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assertActive();
    try {
      const response = await functions.invoke("upsertTrackingRecord", body);
      assertActive();
      if (!response?.data?.record?.id) throw new Error("No daily totals confirmation was returned.");
      return response;
    } catch (error) {
      assertActive();
      if ([400, 401, 403, 404, 405, 413, 422, 429].includes(statusOf(error))) throw error;
      let receipt;
      try {
        receipt = await functions.invoke("upsertTrackingRecord", {
          kind: "nutrition_operation_status", date: body.date,
          nutrition_operation_id: body.nutrition_operation_id
        });
      } catch (lookupError) {
        assertActive();
        throw uncertain(lookupError);
      }
      assertActive();
      const result = receipt?.data;
      if (result?.nutrition_operation_id !== body.nutrition_operation_id || typeof result?.nutrition_operation_applied !== "boolean") throw uncertain(error);
      if (result.nutrition_operation_applied) {
        if (!result.record?.id) throw uncertain(error);
        return receipt;
      }
      if (attempt === 1) throw error; // Read-only confirmation: neither attempt committed.
    }
  }
}
