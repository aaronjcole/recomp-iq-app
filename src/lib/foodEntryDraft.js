// Editable, per-portion food drafts. Unknown nutrients stay blank until reviewed.
export const FOOD_DRAFT_FIELDS = [
  { key: "calories", label: "Calories", max: 20000 },
  { key: "protein_g", label: "Protein (g)", max: 2000 },
  { key: "carbs_g", label: "Carbs (g)", max: 3000 },
  { key: "fat_g", label: "Fat (g)", max: 2000 },
  { key: "fiber_g", label: "Fiber (g)", max: 2000, optional: true },
];

export function createFoodDraft(food = {}, source = "manual", sourceFoodId) {
  const nutrition = Object.fromEntries(
    FOOD_DRAFT_FIELDS.map(({ key }) => [
      key,
      food[key] == null ? "" : String(food[key]),
    ]),
  );
  return {
    name: food.name ?? "",
    serving_description: food.serving_description || "1 serving",
    quantity: "1",
    ...nutrition,
    perUnit: { ...nutrition },
    source,
    ...(sourceFoodId ? { source_food_id: sourceFoodId } : {}),
  };
}

export function changeDraftQuantity(draft, quantity) {
  const q = Number(quantity);
  const scaled =
    q > 0 && Number.isFinite(q)
      ? Object.fromEntries(
          FOOD_DRAFT_FIELDS.map(({ key }) => {
            const unit = draft.perUnit[key];
            return [
              key,
              unit === ""
                ? ""
                : String(
                    Math.round(
                      Number(unit) * q * (key === "calories" ? 1 : 10),
                    ) / (key === "calories" ? 1 : 10),
                  ),
            ];
          }),
        )
      : {};
  return { ...draft, quantity, ...scaled };
}

export function changeDraftNutrient(draft, key, value) {
  const q = Number(draft.quantity);
  return {
    ...draft,
    [key]: value,
    perUnit: {
      ...draft.perUnit,
      [key]:
        value === ""
          ? ""
          : q > 0
            ? String(Number(value) / q)
            : draft.perUnit[key],
    },
  };
}

export function validFoodDraft(draft) {
  const q = Number(draft.quantity);
  return Boolean(
    draft.name.trim() &&
    draft.name.trim().length <= 200 &&
    draft.serving_description.trim() &&
    draft.serving_description.trim().length <= 200 &&
    Number.isFinite(q) &&
    q >= 0.01 &&
    q <= 1000 &&
    FOOD_DRAFT_FIELDS.every(
      ({ key, max, optional }) =>
        (optional && draft[key] === "") ||
        (String(draft[key]).trim() !== "" &&
          Number.isFinite(Number(draft[key])) &&
          Number(draft[key]) >= 0 &&
          Number(draft[key]) <= max),
    ),
  );
}

export function foodDraftPayload(draft, date, meal) {
  if (!validFoodDraft(draft))
    throw new Error("Review the food's serving and nutrition before saving.");
  return {
    date,
    meal,
    name: draft.name.trim(),
    serving_description: draft.serving_description.trim(),
    quantity: Number(draft.quantity),
    source: draft.source,
    ...(draft.source_food_id ? { source_food_id: draft.source_food_id } : {}),
    ...Object.fromEntries(
      FOOD_DRAFT_FIELDS.filter(({ key }) => draft[key] !== "").map(
        ({ key }) => [key, Number(draft[key])],
      ),
    ),
  };
}
