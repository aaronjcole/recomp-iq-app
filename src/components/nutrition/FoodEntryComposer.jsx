import { useId, useRef, useState } from "react";
import { Plus, ScanLine, Camera, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useRecompActions, useRecompRef } from "@/lib/RecompContext";
import { featureFlags } from "@/lib/featureFlags";
import {
  formatShortDate,
  isValidLocalDate,
  todayStr,
} from "@/lib/loggingDateUtils";
import { LOGGABLE_MEALS } from "@/lib/foodLogging";
import {
  changeDraftNutrient,
  changeDraftQuantity,
  createFoodDraft,
  FOOD_DRAFT_FIELDS,
  foodDraftPayload,
  validFoodDraft,
} from "@/lib/foodEntryDraft";
import FoodSearchCard from "@/components/nutrition/FoodSearchCard";
import DescribeMealCard from "@/components/nutrition/DescribeMealCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";

const sourceLabels = {
  manual: "Manual entry",
  library: "Saved food",
  search: "Food search",
  barcode: "Barcode lookup",
  photo: "Photo estimate — review portions",
  template: "Saved meal",
  recipe: "Recipe · per-serving nutrition",
  plan: "Meal-plan estimate",
  describe: "Described meal · review matches",
};

// The owner mounts a fresh composer for each operation. Date and meal are
// snapshotted on open, never read from the background page during a save.
export default function FoodEntryComposer({
  date,
  initialMeal,
  initialFoods = [],
  returnFocusElement,
  onClose,
  onScan = undefined,
  canPhotoScan = false,
}) {
  const { foods } = useRecompRef();
  const { logFoodEntries, upsertDailyLog, deleteFoodLogEntry } =
    useRecompActions();
  const { toast } = useToast();
  const id = useId();
  const [entryDate, setEntryDate] = useState(date);
  const [meal, setMeal] = useState(initialMeal);
  const [drafts, setDrafts] = useState(initialFoods);
  const [choosing, setChoosing] = useState(initialFoods.length === 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const [resolving, setResolving] = useState(null);
  const savingRef = useRef(false);
  const returnFocusElementRef = useRef(returnFocusElement ?? (typeof document === "undefined" ? null : document.activeElement));
  const sequence = useRef(0);
  const [keys, setKeys] = useState(() =>
    initialFoods.map((_, index) => `initial-${index}`),
  );
  const add = (draft) => {
    setDrafts((previous) => [...previous, draft]);
    setKeys((previous) => [...previous, `new-${sequence.current++}`]);
    setChoosing(false);
    setError("");
  };
  const update = (index, change) =>
    setDrafts((previous) =>
      previous.map((draft, i) => (i === index ? change(draft) : draft)),
    );
  const resolveFood = (index, food, sourceFoodId) => {
    update(index, (draft) => ({ ...createFoodDraft(food, draft.source, sourceFoodId), review_note: `Nutrition is for one matched serving. Review quantity against your original description: ${draft.original_description || draft.provenance?.input || `${draft.quantity || "unspecified"} ${draft.serving_description} ${draft.name}`}` }));
    setResolving(null);
  };
  const valid =
    isValidLocalDate(entryDate) &&
    LOGGABLE_MEALS.some((option) => option.value === meal) &&
    drafts.length > 0 &&
    drafts.every(validFoodDraft);

  const save = async () => {
    if (savingRef.current || !valid || reconciliationRequired) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const entries = drafts.map((draft) =>
      foodDraftPayload(draft, entryDate, meal),
    );
    try {
      let created = [];
      if (featureFlags.itemizedFoodDiary) {
        created = await logFoodEntries(entries);
      } else {
        const increments = Object.fromEntries(
          ["calories", "protein_g", "carbs_g", "fat_g"].map((key) => [
            key,
            entries.reduce((sum, entry) => sum + entry[key], 0),
          ]),
        );
        await upsertDailyLog(entryDate, null, { increments });
      }
      let addedToast;
      let undoing = false;
      addedToast = toast({
        title: `Added to ${LOGGABLE_MEALS.find((option) => option.value === meal)?.label}`,
        description: formatShortDate(entryDate),
        returnFocusElement: returnFocusElementRef.current,
        action: created.length ? (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={async () => {
              if (undoing) return;
              undoing = true;
              // Keep only failed IDs for a retry; never delete a successful undo twice.
              const results = await Promise.allSettled(
                created.map((entry) => deleteFoodLogEntry(entry.id)),
              );
              created = created.filter(
                (_, index) => results[index].status === "rejected",
              );
              undoing = false;
              if (created.length)
                toast({
                  title: "Some items couldn't be removed. Try Undo again.",
                  variant: "destructive",
                });
              else {
                addedToast?.update({ action: undefined, title: "Food log undone" });
                addedToast?.dismiss();
              }
            }}
          >
            Undo
          </Button>
        ) : undefined,
      });
      onClose();
    } catch (saveError) {
      setReconciliationRequired(saveError.reconciliationRequired === true);
      setError(saveError.reconciliationRequired
        ? "Some incomplete foods are still saved. Close this review and check the diary and daily totals before trying again. Resubmission is blocked to prevent duplicates."
        : "Couldn't finish saving. Your food draft is still here. Check your diary before retrying if your connection dropped.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !savingRef.current) onClose();
      }}
    >
      <SheetContent
        side="bottom"
      className="mx-auto max-h-[92svh] max-w-md overflow-y-auto bg-panel pb-0 motion-reduce:transition-none"
        aria-label="Review food"
      >
        <SheetHeader>
          <SheetTitle>Review food</SheetTitle>
          <SheetDescription>
            Confirm the date, meal, and portions. Logging won&apos;t change your
            saved foods.
          </SheetDescription>
        </SheetHeader>
        <fieldset disabled={saving || reconciliationRequired} className="min-w-0 space-y-4 pt-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-date`}>Logging date</Label>
            <Input
              id={`${id}-date`}
              className="min-h-11"
              type="date"
              max={todayStr()}
              value={entryDate}
              onChange={(event) => setEntryDate(event.target.value)}
            />
          </div>
          <div
            role="group"
            aria-label="Meal"
            className="grid grid-cols-4 gap-1"
          >
            {LOGGABLE_MEALS.map((option) => (
              <Button
                key={option.value}
                variant="outline"
                className={`min-h-11 px-1 text-xs ${meal === option.value ? "border-teal bg-teal/15 text-teal" : "border-line"}`}
                aria-pressed={meal === option.value}
                onClick={() => setMeal(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {drafts.map((draft, index) => (
            <section
              key={keys[index]}
              aria-label={`Food ${index + 1}`}
              className="space-y-3 rounded-xl border border-line bg-panel2 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {sourceLabels[draft.source] ?? "Food entry"}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-11 min-w-11"
                  aria-label={`Remove food ${index + 1}`}
                  onClick={() => {
                    setDrafts((value) => value.filter((_, i) => i !== index));
                    setKeys((value) => value.filter((_, i) => i !== index));
                    setResolving(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {draft.review_note && <p className="text-xs text-muted-foreground">{draft.review_note}</p>}
              {draft.provenance && <p className="text-xs text-muted-foreground">{typeof draft.provenance === "string" ? draft.provenance : draft.provenance.kind === "usda" ? <a className="inline-flex min-h-11 items-center text-teal" target="_blank" rel="noopener noreferrer" href={`https://fdc.nal.usda.gov/food-details/${Number(draft.provenance.fdcId)}/nutrients`}>USDA FoodData Central · generic estimate</a> : draft.provenance.kind === "saved" ? "Exact saved-food match" : "Unresolved food — choose nutrition or enter it manually"}</p>}
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-${index}-name`}>Food name</Label>
                <Input
                  id={`${id}-${index}-name`}
                  className="min-h-11"
                  maxLength={200}
                  value={draft.name}
                  onChange={(event) =>
                    update(index, (value) => ({
                      ...value,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-${index}-serving`}>Serving</Label>
                  <Input
                    id={`${id}-${index}-serving`}
                    className="min-h-11"
                    maxLength={200}
                    value={draft.serving_description}
                    onChange={(event) =>
                      update(index, (value) => ({
                        ...value,
                        serving_description: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-${index}-quantity`}>Quantity</Label>
                  <Input
                    id={`${id}-${index}-quantity`}
                    className="min-h-11"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max="1000"
                    step="any"
                    value={draft.quantity}
                    onChange={(event) =>
                      update(index, (value) =>
                        changeDraftQuantity(value, event.target.value),
                      )
                    }
                  />
                </div>
                {FOOD_DRAFT_FIELDS.map(({ key, label, max, optional }) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`${id}-${index}-${key}`}>
                      {label}
                      {optional ? " · optional" : ""}
                    </Label>
                    <Input
                      id={`${id}-${index}-${key}`}
                      className="min-h-11"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={max}
                      step="any"
                      placeholder={optional ? "Optional" : "Required"}
                      value={draft[key]}
                      onChange={(event) =>
                        update(index, (value) =>
                          changeDraftNutrient(value, key, event.target.value),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Nutrition shown is for the full quantity above. Changing
                quantity scales it.
              </p>
              <Button variant="outline" className="min-h-11" onClick={() => setResolving(resolving === index ? null : index)}>{resolving === index ? "Hide nutrition search" : "Find nutrition"}</Button>
              {resolving === index && <div className="space-y-2">
                <FoodSearchCard initialQuery={draft.name} onSelect={(food) => resolveFood(index, food)} />
                <details><summary className="flex min-h-11 cursor-pointer items-center text-sm text-teal">Use a saved food instead</summary><div className="max-h-48 space-y-1 overflow-y-auto">{foods.map((food) => <Button key={food.id} variant="outline" className="min-h-11 w-full justify-start truncate" onClick={() => resolveFood(index, food, food.id)}>{food.name}</Button>)}</div></details>
              </div>}
            </section>
          ))}
          {choosing ? (
            <div className="space-y-3">
              <details><summary className="flex min-h-11 cursor-pointer items-center text-sm text-teal">Describe a meal</summary><DescribeMealCard onDrafts={(described) => described.forEach(add)} /></details>
              <FoodSearchCard
                onSelect={(food) => add(createFoodDraft(food, "search"))}
              />
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center text-sm text-teal">
                  Choose a saved food ({foods.length})
                </summary>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {foods.map((food) => (
                    <Button
                      key={food.id}
                      variant="outline"
                      className="min-h-11 w-full justify-start truncate"
                      onClick={() =>
                        add(createFoodDraft(food, "library", food.id))
                      }
                    >
                      {food.name}
                    </Button>
                  ))}
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => add(createFoodDraft())}
                >
                  Enter manually
                </Button>
                {onScan && drafts.length === 0 && (
                  <>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() =>
                        onScan("barcode", { date: entryDate, meal }, returnFocusElementRef.current)
                      }
                    >
                      <ScanLine className="mr-1 h-4 w-4" /> Barcode
                    </Button>
                    {canPhotoScan && (
                      <Button
                        variant="outline"
                        className="min-h-11"
                        onClick={() =>
                          onScan("photo", { date: entryDate, meal }, returnFocusElementRef.current)
                        }
                      >
                        <Camera className="mr-1 h-4 w-4" /> Photo
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="min-h-11 w-full"
              onClick={() => setChoosing(true)}
            >
              <Plus className="mr-1 h-4 w-4" /> Add another food
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Calories, protein, carbs, and fat are required. Enter 0 only when
            known to be zero.
          </p>
        </fieldset>
      <div className="sticky bottom-0 -mx-6 mt-4 space-y-2 border-t border-line bg-panel px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {valid && (
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {drafts.length} {drafts.length === 1 ? "item" : "items"} ·{" "}
              {Math.round(
                drafts.reduce(
                  (total, draft) => total + Number(draft.calories),
                  0,
                ),
              )}{" "}
              kcal ·{" "}
              {Math.round(
                drafts.reduce(
                  (total, draft) => total + Number(draft.protein_g),
                  0,
                ),
              )}
              g protein
            </p>
          )}
          <div className="flex gap-2">
            {reconciliationRequired ? <Button asChild variant="outline" className="min-h-11 flex-1"><Link to={`/nutrition?date=${entryDate}`} onClick={onClose}>Review diary</Link></Button> : <Button
              variant="outline"
              className="min-h-11 flex-1"
              disabled={saving}
              onClick={onClose}
            >
            Cancel
          </Button>}
            <Button
              className="min-h-11 flex-1 bg-teal text-buttonText"
            disabled={!valid || saving || reconciliationRequired}
              onClick={save}
            >
              {saving
                ? "Saving…"
                : `Add to ${entryDate === todayStr() ? "today" : isValidLocalDate(entryDate) ? formatShortDate(entryDate) : "diary"}`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
