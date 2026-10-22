import { useId, useRef, useState } from "react";
import { useRecompActions } from "@/lib/RecompContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RECIPE_NUTRIENTS, recipeBatchForEditor, recipePerServing, recipeWritePayload } from "@/lib/recipeNutrition";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, ChefHat } from "lucide-react";

const emptyRow = { name: "", quantity: "", unit: "" };

export default function AddRecipeCard({ recipe = null, onSaved = undefined, onCancel = undefined }) {
  const { addRecipe, updateRecipe } = useRecompActions();
  const { toast } = useToast();
  const recipeFormId = useId();
  const [title, setTitle] = useState(recipe?.title ?? "");
  const [servings, setServings] = useState(String(recipe?.servings ?? 1));
  const [rows, setRows] = useState(recipe?.ingredients?.length ? recipe.ingredients.map((row) => ({ ...row })) : [{ ...emptyRow }]);
  const [description, setDescription] = useState(recipe?.description ?? "");
  const [instructions, setInstructions] = useState((recipe?.instructions ?? []).join("\n"));
  const [batch, setBatch] = useState(recipe ? recipeBatchForEditor(recipe) : {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const perServing = recipePerServing({ servings, nutrition_basis: "batch", batch_nutrition: batch });

  const setRow = (i, k, v) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRow = () => setRows((p) => [...p, { ...emptyRow }]);
  const removeRow = (i) => setRows((p) => p.filter((_, idx) => idx !== i));

  const canSave = title.trim() && rows.some((r) => r.name.trim());

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const data = recipeWritePayload({ title, servings, ingredients: rows, description,
        instructions: instructions.split("\n"), batch_nutrition: batch,
        tags: recipe?.tags ?? [], is_favorite: recipe?.is_favorite });
      const saved = recipe ? await updateRecipe(recipe.id, data) : await addRecipe(data);
      toast({ title: "Saved", description: recipe ? "Recipe updated." : "Recipe added." });
      if (!recipe) {
        setTitle(""); setServings("1"); setRows([{ ...emptyRow }]);
        setDescription(""); setInstructions(""); setBatch({});
      }
      onSaved?.(saved);
    } catch (saveError) {
      setError(saveError?.message ?? "Recipe could not be saved. Try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Card className="min-w-0 bg-panel border-line [overflow-wrap:anywhere]">
      <CardContent className="p-5 space-y-3">
        <h2 className="flex items-center gap-2 font-medium">
          <ChefHat className="w-4 h-4 text-teal" /> {recipe ? "Edit recipe" : "Add recipe"}
        </h2>
        <fieldset disabled={saving} className="min-w-0 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor={`${recipeFormId}-title`}>Title</Label>
            <Input id={`${recipeFormId}-title`} aria-label="Recipe title" autoFocus={Boolean(onCancel)} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chicken rice bowl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${recipeFormId}-servings`}>Servings</Label>
            <Input id={`${recipeFormId}-servings`} aria-label="Recipe servings" type="number" min="1" max="1000" step="any" inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium leading-none">Ingredients</div>
          {rows.map((r, i) => (
            <div key={i} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] items-center gap-2 sm:flex">
              <Label className="sr-only" htmlFor={`${recipeFormId}-ingredient-${i}-name`}>{`Ingredient ${i + 1} name`}</Label>
              <Input id={`${recipeFormId}-ingredient-${i}-name`} value={r.name} onChange={(e) => setRow(i, "name", e.target.value)} placeholder="Ingredient" className="col-span-3 min-w-0 sm:flex-1" />
              <Label className="sr-only" htmlFor={`${recipeFormId}-ingredient-${i}-quantity`}>{`Ingredient ${i + 1} quantity`}</Label>
              <Input id={`${recipeFormId}-ingredient-${i}-quantity`} type="number" min="0.001" max="100000" step="any" inputMode="decimal" value={r.quantity} onChange={(e) => setRow(i, "quantity", e.target.value)} placeholder="Qty" className="min-w-0 sm:w-20" />
              <Label className="sr-only" htmlFor={`${recipeFormId}-ingredient-${i}-unit`}>{`Ingredient ${i + 1} unit`}</Label>
              <Input id={`${recipeFormId}-ingredient-${i}-unit`} value={r.unit} onChange={(e) => setRow(i, "unit", e.target.value)} placeholder="unit" className="min-w-0 sm:w-20" />
              <button type="button" onClick={() => removeRow(i)} aria-label={`Remove ingredient ${i + 1}`} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full border-line" onClick={addRow}>
            <Plus className="w-4 h-4 mr-1" /> Add ingredient
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${recipeFormId}-description`}>Recipe description</Label>
          <Textarea id={`${recipeFormId}-description`} value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${recipeFormId}-instructions`}>Recipe instructions</Label>
          <Textarea id={`${recipeFormId}-instructions`} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="One step per line" />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Nutrition for the whole batch</h3>
          <p className="text-xs text-muted-foreground">Enter totals for all ingredients combined, not per serving. Leave unknown values blank; enter 0 only when known to be zero. Missing nutrition needs review before logging.</p>
          <div className="grid grid-cols-2 gap-3">
            {RECIPE_NUTRIENTS.map(({ key, label, max }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`${recipeFormId}-batch-${key}`}>Batch {label.toLowerCase()}</Label>
                <Input id={`${recipeFormId}-batch-${key}`} type="number" min="0" max={max} step="any" inputMode="decimal" placeholder="Unknown" value={batch[key] ?? ""} onChange={(event) => setBatch((prev) => ({ ...prev, [key]: event.target.value }))} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">Per serving: {RECIPE_NUTRIENTS.map(({ key, label }) => `${label}: ${perServing[key] == null ? "Unknown" : Number(perServing[key].toFixed(2))}`).join(" · ")}</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="w-full min-h-11 bg-teal text-buttonText hover:opacity-90" onClick={save} disabled={!canSave || saving}>
          {saving ? "Saving…" : "Save recipe"}
        </Button>
        {onCancel && <Button variant="outline" className="h-auto w-full min-h-11 whitespace-normal" onClick={() => { if (!savingRef.current) onCancel(); }}>Cancel recipe editing</Button>}
        </fieldset>
      </CardContent>
    </Card>
  );
}
