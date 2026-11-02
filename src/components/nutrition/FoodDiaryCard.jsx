import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { CopyPlus, Copy, Pencil, Plus, Trash2, Utensils } from "lucide-react";
import { useRecompActions, useRecompRef } from "@/lib/RecompContext";
import { todayStr, formatShortDate } from "@/lib/loggingDateUtils";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { copiedEntries, perUnitNutrition, previousDateKey, scaledNutrition } from "@/lib/foodLogging";
import { FOOD_DRAFT_FIELDS, validFoodDraft } from "@/lib/foodEntryDraft";

const MEALS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snacks" },
  { value: "other", label: "Other" }
];

const EDIT_FIELDS = FOOD_DRAFT_FIELDS.filter(({ key }) => key !== "fiber_g");

function editState(entry) {
  return {
    name: entry?.name ?? "",
    serving_description: entry?.serving_description ?? "1 serving",
    quantity: String(entry?.quantity ?? 1),
    meal: entry?.meal ?? "other",
    calories: String(entry?.calories ?? 0),
    protein_g: String(entry?.protein_g ?? 0),
    carbs_g: String(entry?.carbs_g ?? 0),
    fat_g: String(entry?.fat_g ?? 0)
  };
}

export default function FoodDiaryCard({ date = todayStr(), onAdd = undefined }) {
  const { pathname, search } = useLocation();
  const query = new URLSearchParams(search);
  const diaryActive = pathname === "/nutrition" && query.get("panel") !== "targets" && !["library", "tools"].includes(query.get("segment"));
  const { foodLogEntries } = useRecompRef();
  const {
    deleteFoodLogEntry, discardUnsyncedFoodEntries, ensureDateLoaded, logFoodEntries, repeatFoodLogEntry, restoreFoodLogEntry, updateFoodLogEntry
  } = useRecompActions();
  const { toast } = useToast();
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(editState(null));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const actionIdsRef = useRef(new Set());
  const [actionIds, setActionIds] = useState(() => new Set());
  // Per-unit nutrition of the entry being edited, so a quantity change scales
  // calories and macros. A macro typed by hand becomes the new per-unit value.
  const perUnitRef = useRef(perUnitNutrition(null));
  const [copying, setCopying] = useState(null);
  const copyingRef = useRef(false);
  const today = date;
  const previousDate = previousDateKey(date);
  const viewingToday = date === todayStr();
  const scaledDraft = scaledNutrition(perUnitRef.current, draft.quantity);
  const validEdit = validFoodDraft({
    ...draft,
    serving_description: draft.serving_description.trim() || "1 serving",
    fiber_g: scaledDraft?.fiber_g ?? ""
  });

  const beginAction = (id) => {
    if (actionIdsRef.current.has(id)) return false;
    actionIdsRef.current.add(id);
    setActionIds(new Set(actionIdsRef.current));
    return true;
  };
  const endAction = (id) => {
    actionIdsRef.current.delete(id);
    setActionIds(new Set(actionIdsRef.current));
  };

  // Root tabs stay mounted while hidden; their portaled editors must not.
  useEffect(() => {
    if (!diaryActive || (editing && editing.date !== date)) setEditing(null);
  }, [diaryActive, date, editing]);

  // Copying yesterday needs yesterday's entries even outside the loaded week.
  useEffect(() => {
    ensureDateLoaded?.(previousDate);
  }, [ensureDateLoaded, previousDate]);

  // Ids already copied into a day, so each copy action only offers what is
  // left: copying yesterday twice never duplicates it.
  const copiedInto = useMemo(() => {
    const byDate = new Map();
    for (const entry of foodLogEntries) {
      if (!entry.repeated_from_id) continue;
      if (!byDate.has(entry.date)) byDate.set(entry.date, new Set());
      byDate.get(entry.date).add(entry.repeated_from_id);
    }
    return (targetDate) => byDate.get(targetDate) ?? new Set();
  }, [foodLogEntries]);

  const previousEntries = useMemo(() => {
    const done = copiedInto(date);
    return foodLogEntries.filter((entry) => entry.date === previousDate && !entry.pending && !entry.reconciliationRequired && !done.has(entry.id));
  }, [foodLogEntries, previousDate, date, copiedInto]);

  const entries = useMemo(
    () => foodLogEntries.filter((entry) => entry.date === today),
    [foodLogEntries, today]
  );
  const grouped = useMemo(
    () => MEALS.map((meal) => ({ ...meal, entries: entries.filter((entry) => entry.meal === meal.value) }))
      .filter((meal) => meal.value !== "other" || meal.entries.length > 0),
    [entries]
  );

  const openEditor = (entry) => {
    if (savingRef.current || entry.pending || entry.reconciliationRequired || actionIdsRef.current.has(entry.id)) return;
    setEditing(entry);
    setDraft(editState(entry));
    perUnitRef.current = perUnitNutrition(entry);
  };

  const changeQuantity = (value) => {
    const scaled = scaledNutrition(perUnitRef.current, value);
    setDraft((current) => ({
      ...current,
      quantity: value,
      ...(scaled ? Object.fromEntries(EDIT_FIELDS.map(({ key }) => [key, String(scaled[key])])) : {})
    }));
  };

  const changeMacro = (key, value) => {
    const quantity = Number(draft.quantity);
    if (quantity > 0 && value !== "" && Number.isFinite(Number(value))) {
      perUnitRef.current = { ...perUnitRef.current, [key]: Number(value) / quantity };
    }
    setDraft((current) => ({ ...current, [key]: value }));
  };

  // One coordinated batch, with compensating cleanup on failure and an Undo
  // that removes exactly the copies. Failed cleanup is visible for review.
  const copyEntries = async (key, sourceEntries, targetDate, label) => {
    const payload = copiedEntries(sourceEntries, targetDate);
    if (copyingRef.current || payload.length === 0) return;
    copyingRef.current = true;
    setCopying(key);
    try {
      const created = await logFoodEntries(payload);
      let copiedToast;
      let undoing = false;
      let remaining = created;
      copiedToast = toast({
        title: label,
        description: `${created.length} ${created.length === 1 ? "item" : "items"} added.`,
        action: (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={async () => {
              if (undoing || remaining.length === 0) return;
              undoing = true;
              const results = await Promise.allSettled(remaining.map((entry) => deleteFoodLogEntry(entry.id)));
              remaining = remaining.filter((_, index) => results[index].status === "rejected");
              if (remaining.length > 0) {
                undoing = false;
                toast({ title: "Some copied items couldn't be removed", variant: "destructive" });
              } else {
                copiedToast?.dismiss();
              }
            }}
          >
            Undo
          </Button>
        )
      });
    } catch (error) {
      toast({ title: "Couldn't copy those foods", description: error.reconciliationRequired ? "Review the incomplete items in your diary before trying again." : "The copy did not finish. Check your diary before retrying if your connection dropped.", variant: "destructive" });
    } finally {
      copyingRef.current = false;
      setCopying(null);
    }
  };

  const repeat = async (entry) => {
    if (entry.pending || entry.reconciliationRequired || !beginAction(entry.id)) return;
    try {
      const created = await repeatFoodLogEntry(entry, entry.date);
      let repeatToast;
      let undoing = false;
      repeatToast = toast({
        title: `${entry.name} repeated`,
        description: `${formatShortDate(entry.date)} totals were updated.`,
        action: <Button type="button" variant="outline" className="min-h-11" onClick={async () => {
          if (undoing) return;
          undoing = true;
          try { await deleteFoodLogEntry(created.id); repeatToast?.dismiss(); }
          catch { undoing = false; toast({ title: "Couldn't undo repeat", variant: "destructive" }); }
        }}>Undo</Button>
      });
    } catch {
      toast({ title: "Couldn't repeat food", variant: "destructive" });
    } finally {
      endAction(entry.id);
    }
  };

  const remove = async (entry) => {
    if (entry.pending || entry.reconciliationRequired || !beginAction(entry.id)) return;
    try {
      const deleted = await deleteFoodLogEntry(entry.id);
      let undoToast;
      let undoing = false;
      const undo = async () => {
        if (undoing) return;
        undoing = true;
        try {
          await restoreFoodLogEntry(deleted);
          undoToast?.dismiss();
        } catch {
          undoing = false;
          toast({ title: "Couldn't restore food", variant: "destructive" });
        }
      };
      undoToast = toast({
        title: `${entry.name} removed`,
        description: `${formatShortDate(entry.date)} totals were updated.`,
        action: <Button type="button" variant="outline" className="min-h-11" onClick={undo}>Undo</Button>
      });
    } catch {
      toast({ title: "Couldn't delete food", variant: "destructive" });
    } finally {
      endAction(entry.id);
    }
  };

  const discard = async (entry) => {
    if (!beginAction(entry.id)) return;
    try {
      await discardUnsyncedFoodEntries([entry.id]);
      toast({ title: "Incomplete item discarded", description: "Daily totals were not changed. Review them in your daily log." });
    } catch (error) {
      toast({ title: "Couldn't discard incomplete food", description: error.message, variant: "destructive" });
    } finally {
      endAction(entry.id);
    }
  };

  const save = async () => {
    if (!diaryActive || !editing || !validEdit || savingRef.current || !beginAction(editing.id)) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await updateFoodLogEntry(editing.id, {
        name: draft.name.trim(),
        serving_description: draft.serving_description.trim() || "1 serving",
        quantity: Number(draft.quantity),
        meal: draft.meal,
        calories: Number(draft.calories),
        protein_g: Number(draft.protein_g),
        carbs_g: Number(draft.carbs_g),
        fat_g: Number(draft.fat_g),
        // Fiber isn't editable here, but it still follows the quantity.
        fiber_g: scaledDraft?.fiber_g ?? editing.fiber_g ?? 0
      });
      setEditing(null);
    } catch {
      toast({ title: "Couldn't update food", variant: "destructive" });
    } finally {
      savingRef.current = false;
      setSaving(false);
      endAction(editing.id);
    }
  };

  return (
    <>
      <Card role="region" aria-label="Food diary" className="min-w-0 border-line bg-panel">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Utensils className="h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="font-medium">{date === todayStr() ? "Today's diary" : formatShortDate(date)}</h2>
                <p className="text-xs text-muted-foreground">Every item stays editable.</p>
              </div>
            </div>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {entries.length} {entries.length === 1 ? "item" : "items"}
            </span>
          </div>

          {previousEntries.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 w-full whitespace-normal border-line"
              disabled={Boolean(copying)}
              onClick={() => copyEntries("previous-day", previousEntries, date, `Copied ${viewingToday ? "yesterday" : formatShortDate(previousDate)}`)}
            >
              <Copy className="mr-1 h-4 w-4" aria-hidden="true" />
              {copying === "previous-day"
                ? "Copying…"
                : `Copy ${viewingToday ? "yesterday" : formatShortDate(previousDate)} (${previousEntries.length} ${previousEntries.length === 1 ? "item" : "items"})`}
            </Button>
          )}

            <div className="space-y-4">
              {grouped.map((meal) => (
                <section key={meal.value} aria-labelledby={`food-diary-${meal.value}`}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <h3 id={`food-diary-${meal.value}`} className="font-mono text-label uppercase tracking-wider text-muted-foreground">
                      {meal.label}
                    </h3>
                    <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1">
                    {onAdd && meal.value !== "other" && <Button variant="ghost" className="min-h-11 text-xs text-teal" aria-label={`Add food to ${meal.label}`} onClick={() => onAdd(meal.value)}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button>}
                    {!viewingToday && meal.entries.some((entry) => !entry.pending && !entry.reconciliationRequired && !copiedInto(todayStr()).has(entry.id)) && (
                      <button
                        type="button"
                        className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-panel2 hover:text-teal disabled:opacity-50"
                        disabled={Boolean(copying)}
                        onClick={() => copyEntries(
                          `meal:${meal.value}`,
                          meal.entries.filter((entry) => !entry.pending && !entry.reconciliationRequired && !copiedInto(todayStr()).has(entry.id)),
                          todayStr(),
                          `${meal.label} copied to today`
                        )}
                        aria-label={`Copy ${meal.label} to today`}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        {copying === `meal:${meal.value}` ? "Copying…" : "Copy to today"}
                      </button>
                    )}
                    </div>
                  </div>
                  {meal.entries.length === 0 && <p className="text-xs text-muted-foreground">No foods logged yet.</p>}
                  <div className="divide-y divide-lineSoft">
                    {meal.entries.map((entry) => (
                      <div key={entry.id} className="grid min-w-0 grid-cols-1 gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" aria-busy={entry.pending || actionIds.has(entry.id)}>
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{entry.name}</p>
                          {entry.reconciliationRequired && <div className="space-y-1 py-2 text-xs text-destructive" role="alert">
                            <p>{entry.ambiguousNutrition || entry.unconfirmedFoodMutation
                              ? "Save confirmation unavailable. Check this day's food entries and daily totals before making further changes. Automatic retry and discard are paused to avoid duplicate or missing meals."
                              : "Incomplete save. Check this day's totals before logging this food again."}</p>
                            {!entry.ambiguousNutrition && !entry.unconfirmedFoodMutation && <Button variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal text-left text-xs" disabled={actionIds.has(entry.id)} onClick={() => discard(entry)}>Discard incomplete item · keep totals unchanged</Button>}
                          </div>}
                          <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                            {entry.serving_description} · {entry.calories} kcal
                            <span className="hidden min-[360px]:inline"> · {entry.protein_g}p/{entry.carbs_g}c/{entry.fat_g}f</span>
                          </p>
                        </div>
                        {!entry.reconciliationRequired && <div className="flex shrink-0 justify-end gap-1"><button
                          type="button"
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-panel2 hover:text-teal disabled:opacity-50"
                          onClick={() => repeat(entry)}
                          disabled={entry.pending || actionIds.has(entry.id)}
                          aria-label={`Repeat ${entry.name}`}
                        >
                          <CopyPlus className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-panel2 hover:text-teal disabled:opacity-50"
                          onClick={() => openEditor(entry)}
                          disabled={entry.pending || actionIds.has(entry.id)}
                          aria-label={`Edit ${entry.name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-panel2 hover:text-red disabled:opacity-50"
                          onClick={() => remove(entry)}
                          disabled={entry.pending || actionIds.has(entry.id)}
                          aria-label={`Delete ${entry.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                        </div>}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(editing && diaryActive && editing.date === date)} onOpenChange={(open) => { if (!open && !savingRef.current) setEditing(null); }}>
        <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto pb-[env(safe-area-inset-bottom)]" aria-label="Edit food entry">
          <SheetHeader>
            <SheetTitle>Edit food entry</SheetTitle>
            <SheetDescription>Changes update this food and totals for {editing ? formatShortDate(editing.date) : "the selected day"}.</SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="food-diary-name">Food name</Label>
              <Input id="food-diary-name" maxLength={200} disabled={saving} value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="food-diary-meal">Meal</Label>
              <AdaptiveSelect
                id="food-diary-meal"
                value={draft.meal}
                disabled={saving}
                onValueChange={(meal) => setDraft((value) => ({ ...value, meal }))}
                options={MEALS}
                drawerTitle="Meal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="food-diary-serving">Serving</Label>
              <Input id="food-diary-serving" maxLength={200} disabled={saving} value={draft.serving_description} onChange={(event) => setDraft((value) => ({ ...value, serving_description: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="food-diary-quantity">Quantity</Label>
              <Input id="food-diary-quantity" type="number" min="0.01" max="1000" step="any" inputMode="decimal" disabled={saving} value={draft.quantity} onChange={(event) => changeQuantity(event.target.value)} aria-describedby="food-diary-quantity-hint" />
              <p id="food-diary-quantity-hint" className="text-xs text-muted-foreground">Calories and macros scale with quantity.</p>
            </div>
            {EDIT_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`food-diary-${field.key}`}>{field.label}</Label>
                <Input id={`food-diary-${field.key}`} type="number" min="0" max={field.max} step="any" inputMode="decimal" disabled={saving} value={draft[field.key]} onChange={(event) => changeMacro(field.key, event.target.value)} />
              </div>
            ))}
          </div>
          {!validEdit && editing && <p className="pb-3 text-sm text-destructive" role="status">Enter a food name, a quantity from 0.01 to 1,000, and valid nutrition values before saving.</p>}
          <SheetFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="button" className="bg-teal text-buttonText hover:opacity-90" onClick={save} disabled={saving || !validEdit}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
