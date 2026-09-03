import { useId, useState } from "react";
import { useRecompActions } from "@/lib/RecompContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, ChefHat } from "lucide-react";

const emptyRow = { name: "", quantity: "", unit: "" };

export default function AddRecipeCard() {
  const { addRecipe } = useRecompActions();
  const { toast } = useToast();
  const recipeFormId = useId();
  const [title, setTitle] = useState("");
  const [servings, setServings] = useState("1");
  const [rows, setRows] = useState([{ ...emptyRow }]);

  const setRow = (i, k, v) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRow = () => setRows((p) => [...p, { ...emptyRow }]);
  const removeRow = (i) => setRows((p) => p.filter((_, idx) => idx !== i));

  const canSave = title && rows.some((r) => r.name);

  const save = async () => {
    const ingredients = rows
      .filter((r) => r.name)
      .map((r) => ({ name: r.name, quantity: Number(r.quantity) || 0, unit: r.unit || "each" }));
    await addRecipe({
      title,
      servings: Number(servings) || 1,
      ingredients,
      instructions: [],
      tags: []
    });
    toast({ title: "Saved", description: "Recipe added." });
    setTitle("");
    setServings("1");
    setRows([{ ...emptyRow }]);
  };

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-3">
        <h2 className="flex items-center gap-2 font-medium">
          <ChefHat className="w-4 h-4 text-teal" /> Add recipe
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor={`${recipeFormId}-title`}>Title</Label>
            <Input id={`${recipeFormId}-title`} aria-label="Recipe title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chicken rice bowl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${recipeFormId}-servings`}>Servings</Label>
            <Input id={`${recipeFormId}-servings`} aria-label="Recipe servings" type="number" inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium leading-none">Ingredients</div>
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Label className="sr-only" htmlFor={`${recipeFormId}-ingredient-${i}-name`}>{`Ingredient ${i + 1} name`}</Label>
              <Input id={`${recipeFormId}-ingredient-${i}-name`} value={r.name} onChange={(e) => setRow(i, "name", e.target.value)} placeholder="Ingredient" className="flex-1" />
              <Label className="sr-only" htmlFor={`${recipeFormId}-ingredient-${i}-quantity`}>{`Ingredient ${i + 1} quantity`}</Label>
              <Input id={`${recipeFormId}-ingredient-${i}-quantity`} type="number" inputMode="decimal" value={r.quantity} onChange={(e) => setRow(i, "quantity", e.target.value)} placeholder="Qty" className="w-20" />
              <Label className="sr-only" htmlFor={`${recipeFormId}-ingredient-${i}-unit`}>{`Ingredient ${i + 1} unit`}</Label>
              <Input id={`${recipeFormId}-ingredient-${i}-unit`} value={r.unit} onChange={(e) => setRow(i, "unit", e.target.value)} placeholder="unit" className="w-20" />
              <button type="button" onClick={() => removeRow(i)} aria-label={`Remove ingredient ${i + 1}`} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full border-line" onClick={addRow}>
            <Plus className="w-4 h-4 mr-1" /> Add ingredient
          </Button>
        </div>
        <Button className="w-full bg-teal text-buttonText hover:opacity-90" onClick={save} disabled={!canSave}>
          Save recipe
        </Button>
      </CardContent>
    </Card>
  );
}
