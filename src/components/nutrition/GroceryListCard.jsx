import { useState, useEffect, useMemo } from "react";
import { useRecompRef } from "@/lib/RecompContext";
import { buildGroceryListFromRecipes } from "@/lib/fitness";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { ShoppingCart, ListChecks } from "lucide-react";

export default function GroceryListCard() {
  const { recipes } = useRecompRef();
  const [userId, setUserId] = useState("anon");
  const [selected, setSelected] = useState([]);
  const [checked, setChecked] = useState({});

  useEffect(() => {
    let alive = true;
    base44.auth
      .me()
      .then((u) => alive && setUserId(u.id))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const storageKey = `recomp-grocery-checked-${userId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setChecked(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const persist = (next) => {
    setChecked(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const toggleRecipe = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectAll = () => setSelected(recipes.map((r) => r.id));

  const selectedRecipes = useMemo(() => recipes.filter((r) => selected.includes(r.id)), [recipes, selected]);
  const groceryItems = useMemo(() => buildGroceryListFromRecipes(selectedRecipes), [selectedRecipes]);

  const toggleItem = (key) => persist({ ...checked, [key]: !checked[key] });
  const clearChecked = () => persist({});
  const anyChecked = Object.values(checked).some(Boolean);

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2 font-medium">
          <ShoppingCart className="w-4 h-4 text-teal" /> Grocery list
        </div>

        {recipes.length === 0 && (
          <p className="text-sm text-muted-foreground">Add a recipe below to build a grocery list.</p>
        )}

        {recipes.length > 0 && (
          <>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Include recipes</div>
              {recipes.map((r) => (
                <div key={r.id} className="flex items-center gap-3">
                  <Checkbox checked={selected.includes(r.id)} onCheckedChange={() => toggleRecipe(r.id)} id={`rec-${r.id}`} />
                  <Label htmlFor={`rec-${r.id}`} className="text-sm flex-1 cursor-pointer">
                    {r.title}
                  </Label>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="border-line" onClick={selectAll}>
                Select all recipes
              </Button>
              <Button variant="outline" size="sm" className="border-line" onClick={clearChecked} disabled={!anyChecked}>
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
              const key = `${it.name}-${it.unit}`;
              const done = !!checked[key];
              return (
                <div key={key} className="flex items-center gap-3 py-1">
                  <Checkbox checked={done} onCheckedChange={() => toggleItem(key)} id={`g-${key}`} />
                  <Label htmlFor={`g-${key}`} className={`text-sm flex-1 cursor-pointer ${done ? "line-through text-muted-foreground" : ""}`}>
                    {it.quantity} {it.unit} {it.name}
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