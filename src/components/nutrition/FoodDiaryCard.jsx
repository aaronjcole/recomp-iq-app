import { useMemo, useState } from "react";
import { CopyPlus, Pencil, Trash2, Utensils } from "lucide-react";
import { useRecompActions, useRecompRef, todayStr } from "@/lib/RecompContext";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";

const MEALS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snacks" },
  { value: "other", label: "Other" }
];

const EDIT_FIELDS = [
  { key: "calories", label: "Calories" },
  { key: "protein_g", label: "Protein (g)" },
  { key: "carbs_g", label: "Carbs (g)" },
  { key: "fat_g", label: "Fat (g)" }
];

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

export default function FoodDiaryCard() {
  const { foodLogEntries } = useRecompRef();
  const { deleteFoodLogEntry, repeatFoodLogEntry, restoreFoodLogEntry, updateFoodLogEntry } = useRecompActions();
  const { toast } = useToast();
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(editState(null));
  const [saving, setSaving] = useState(false);
  const today = todayStr();

  const entries = useMemo(
    () => foodLogEntries.filter((entry) => entry.date === today),
    [foodLogEntries, today]
  );
  const grouped = useMemo(
    () => MEALS.map((meal) => ({ ...meal, entries: entries.filter((entry) => entry.meal === meal.value) }))
      .filter((meal) => meal.entries.length > 0),
    [entries]
  );

  const openEditor = (entry) => {
    setEditing(entry);
    setDraft(editState(entry));
  };

  const repeat = async (entry) => {
    try {
      await repeatFoodLogEntry(entry);
      toast({ title: "Added again", description: `${entry.name} was copied to today.` });
    } catch {
      toast({ title: "Couldn't repeat food", variant: "destructive" });
    }
  };

  const remove = async (entry) => {
    try {
      const deleted = await deleteFoodLogEntry(entry.id);
      let undoToast;
      const undo = async () => {
        try {
          await restoreFoodLogEntry(deleted);
          undoToast?.dismiss();
        } catch {
          toast({ title: "Couldn't restore food", variant: "destructive" });
        }
      };
      undoToast = toast({
        title: `${entry.name} removed`,
        description: "Today's totals were updated.",
        action: <Button type="button" variant="outline" className="min-h-11" onClick={undo}>Undo</Button>
      });
    } catch {
      toast({ title: "Couldn't delete food", variant: "destructive" });
    }
  };

  const save = async () => {
    if (!editing || !draft.name.trim() || saving) return;
    setSaving(true);
    try {
      await updateFoodLogEntry(editing.id, {
        name: draft.name.trim(),
        serving_description: draft.serving_description.trim() || "1 serving",
        quantity: Math.max(0.01, Number(draft.quantity) || 1),
        meal: draft.meal,
        calories: Math.max(0, Number(draft.calories) || 0),
        protein_g: Math.max(0, Number(draft.protein_g) || 0),
        carbs_g: Math.max(0, Number(draft.carbs_g) || 0),
        fat_g: Math.max(0, Number(draft.fat_g) || 0)
      });
      setEditing(null);
      toast({ title: "Food updated" });
    } catch {
      toast({ title: "Couldn't update food", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card role="region" aria-label="Food diary" className="border-line bg-panel">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Utensils className="h-4 w-4 text-teal" aria-hidden="true" />
              <div>
                <h2 className="font-medium">Today&apos;s diary</h2>
                <p className="text-xs text-muted-foreground">Every item stays editable.</p>
              </div>
            </div>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {entries.length} {entries.length === 1 ? "item" : "items"}
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-4 py-5 text-center">
              <p className="text-sm font-medium">Nothing logged yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Add a recent food or use the form below to start today&apos;s diary.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((meal) => (
                <section key={meal.value} aria-labelledby={`food-diary-${meal.value}`}>
                  <h3 id={`food-diary-${meal.value}`} className="mb-1 font-mono text-label uppercase tracking-wider text-muted-foreground">
                    {meal.label}
                  </h3>
                  <div className="divide-y divide-lineSoft">
                    {meal.entries.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-2 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{entry.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {entry.serving_description} · {entry.calories} kcal
                            <span className="hidden min-[360px]:inline"> · {entry.protein_g}p/{entry.carbs_g}c/{entry.fat_g}f</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-panel2 hover:text-teal disabled:opacity-50"
                          onClick={() => repeat(entry)}
                          disabled={entry.pending}
                          aria-label={`Repeat ${entry.name}`}
                        >
                          <CopyPlus className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-panel2 hover:text-teal disabled:opacity-50"
                          onClick={() => openEditor(entry)}
                          disabled={entry.pending}
                          aria-label={`Edit ${entry.name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-panel2 hover:text-red disabled:opacity-50"
                          onClick={() => remove(entry)}
                          disabled={entry.pending}
                          aria-label={`Delete ${entry.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto pb-[env(safe-area-inset-bottom)]" aria-label="Edit food entry">
          <SheetHeader>
            <SheetTitle>Edit food entry</SheetTitle>
            <SheetDescription>Changes update today&apos;s totals automatically.</SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="food-diary-name">Food name</Label>
              <Input id="food-diary-name" value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="food-diary-meal">Meal</Label>
              <AdaptiveSelect
                id="food-diary-meal"
                value={draft.meal}
                onValueChange={(meal) => setDraft((value) => ({ ...value, meal }))}
                options={MEALS}
                drawerTitle="Meal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="food-diary-serving">Serving</Label>
              <Input id="food-diary-serving" value={draft.serving_description} onChange={(event) => setDraft((value) => ({ ...value, serving_description: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="food-diary-quantity">Quantity</Label>
              <Input id="food-diary-quantity" type="number" min="0.01" step="0.25" value={draft.quantity} onChange={(event) => setDraft((value) => ({ ...value, quantity: event.target.value }))} />
            </div>
            {EDIT_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`food-diary-${field.key}`}>{field.label}</Label>
                <Input id={`food-diary-${field.key}`} type="number" min="0" inputMode="decimal" value={draft[field.key]} onChange={(event) => setDraft((value) => ({ ...value, [field.key]: event.target.value }))} />
              </div>
            ))}
          </div>
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="button" className="bg-teal text-buttonText hover:opacity-90" onClick={save} disabled={saving || !draft.name.trim()}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
