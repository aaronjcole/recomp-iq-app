import { useEffect, useId, useState, useMemo } from "react";
import { useRecompRef } from "@/lib/RecompContext";
import { useAuth } from "@/lib/AuthContext";
import { groceryItemKey, recipeGroceries } from "@/lib/recipeGrocery";
import { useRecipeGroceryChecks } from "@/lib/useRecipeGroceryChecks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ShoppingCart, ListChecks } from "lucide-react";

export default function GroceryListCard() {
  const { recipes } = useRecompRef();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const id = useId();
  const [selection, setSelection] = useState({ userId, ids: [] });
  const selected = selection.userId === userId ? selection.ids : [];
  const { isChecked, toggleItem, clearChecked, anyChecked, retainItems } = useRecipeGroceryChecks(userId, "recipes");

  const toggleRecipe = (id) =>
    setSelection({ userId, ids: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] });

  const selectAll = () => setSelection({ userId, ids: recipes.map((r) => r.id) });

  const selectedRecipes = useMemo(() => recipes.filter((r) => selected.includes(r.id)), [recipes, selected]);
  const groceryItems = useMemo(() => recipeGroceries(selectedRecipes), [selectedRecipes]);
  // Keep checks for recipes that have not been reselected after navigation.
  // Visible ingredients still discard obsolete quantities after edits.
  const grocerySignature = JSON.stringify(groceryItems);
  useEffect(() => {
    if (selected.length > 0) retainItems(groceryItems, { preserveOtherItems: true });
  }, [grocerySignature, userId, retainItems]);

  return (
    <Card role="region" aria-label="Recipe grocery list" className="min-w-0 bg-panel border-line">
      <CardContent className="min-w-0 p-5 space-y-4">
        <h2 className="flex items-center gap-2 font-medium">
          <ShoppingCart className="w-4 h-4 text-teal" /> Grocery list
        </h2>
        <p className="text-xs text-muted-foreground">Recipe ingredients are for whole batches. Checks are saved on this device for this account, separately from planner groceries. Changed quantities need a new check.</p>

        {recipes.length === 0 && (
          <p className="text-sm text-muted-foreground">Add a recipe below to build a grocery list.</p>
        )}

        {recipes.length > 0 && (
          <>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Include recipes</div>
              {recipes.map((r) => (
                <div key={r.id} className="flex min-w-0 items-center gap-3">
                  <Checkbox checked={selected.includes(r.id)} onCheckedChange={() => toggleRecipe(r.id)} id={`${id}-rec-${r.id}`} />
                  <Label htmlFor={`${id}-rec-${r.id}`} className="min-w-0 break-words text-sm min-h-11 flex items-center flex-1 cursor-pointer [overflow-wrap:anywhere]">
                    {r.title}
                  </Label>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-auto min-h-11 flex-1 basis-32 whitespace-normal border-line" onClick={selectAll}>
                Select all recipes
              </Button>
              <Button variant="outline" size="sm" className="h-auto min-h-11 flex-1 basis-32 whitespace-normal border-line" onClick={clearChecked} disabled={!anyChecked}>
                Clear checked
              </Button>
            </div>
          </>
        )}

        {groceryItems.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <ListChecks className="w-3.5 h-3.5" /> Combined list
            </div>
            {groceryItems.map((it) => {
              const key = groceryItemKey(it);
              const done = isChecked(it);
              return (
                <div key={key} className="flex min-w-0 items-center gap-3 py-1">
                  <Checkbox checked={done} onCheckedChange={() => toggleItem(it)} id={`${id}-g-${encodeURIComponent(key)}`} />
                  <Label htmlFor={`${id}-g-${encodeURIComponent(key)}`} className={`min-w-0 break-words text-sm min-h-11 flex items-center flex-1 cursor-pointer [overflow-wrap:anywhere] ${done ? "line-through text-muted-foreground" : ""}`}>
                    {it.quantity ?? "Quantity unknown — review"} {it.unit} {it.name}
                  </Label>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
