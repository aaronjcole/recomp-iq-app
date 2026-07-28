import { useState } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Utensils } from "lucide-react";

const emptyItem = { name: "", serving_description: "1 serving", calories: "", protein_g: "", carbs_g: "", fat_g: "" };
const n = (v) => Number(v) || 0;

export default function MealTemplatesCard() {
  const { mealTemplates, foods, saveMealTemplate, logMealTemplate } = useRecomp();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [items, setItems] = useState([]);
  const [item, setItem] = useState(emptyItem);

  const totals = items.reduce(
    (acc, it) => ({
      calories: acc.calories + n(it.calories),
      protein_g: acc.protein_g + n(it.protein_g),
      carbs_g: acc.carbs_g + n(it.carbs_g),
      fat_g: acc.fat_g + n(it.fat_g)
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  const addItem = () => {
    if (!item.name || !item.calories) return;
    setItems((p) => [...p, { ...item, calories: n(item.calories), protein_g: n(item.protein_g), carbs_g: n(item.carbs_g), fat_g: n(item.fat_g) }]);
    setItem(emptyItem);
  };

  const addFromLibrary = (foodId) => {
    const f = foods.find((x) => x.id === foodId);
    if (!f) return;
    setItems((p) => [
      ...p,
      {
        name: f.name,
        serving_description: f.serving_description,
        calories: f.calories ?? 0,
        protein_g: f.protein_g ?? 0,
        carbs_g: f.carbs_g ?? 0,
        fat_g: f.fat_g ?? 0
      }
    ]);
  };

  const removeItem = (idx) => setItems((p) => p.filter((_, i) => i !== idx));

  const save = async () => {
    if (!name || items.length === 0) return;
    await saveMealTemplate({
      name,
      items,
      total_calories: totals.calories,
      total_protein_g: totals.protein_g,
      total_carbs_g: totals.carbs_g,
      total_fat_g: totals.fat_g,
      tags: []
    });
    toast({ title: "Saved", description: "Meal template created." });
    setName("");
    setItems([]);
  };

  const log = async (tpl) => {
    await logMealTemplate(tpl);
    toast({ title: "Logged", description: `${tpl.name} added to today.` });
  };

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2 font-medium">
          <Utensils className="w-4 h-4 text-teal" /> Meal templates
        </div>

        {mealTemplates.length === 0 && (
          <p className="text-sm text-muted-foreground">No templates yet — build one below for one-tap logging.</p>
        )}

        {mealTemplates.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 py-2 border-b border-lineSoft last:border-0">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{t.name}</div>
              <div className="text-xs text-muted-foreground">
                {t.total_calories} kcal · {t.total_protein_g}p / {t.total_carbs_g}c / {t.total_fat_g}f
              </div>
            </div>
            <Button size="sm" className="bg-teal text-buttonText hover:opacity-90" onClick={() => log(t)}>
              Log
            </Button>
          </div>
        ))}

        <div className="space-y-3 rounded-lg bg-panel2 p-3">
          <div className="text-xs font-medium text-muted-foreground">Save as meal template</div>

          <div className="space-y-1.5">
            <Label>Template name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Breakfast bowl" />
          </div>

          {foods.length > 0 && (
            <div className="space-y-1.5">
              <Label>Pick from library</Label>
              <Select onValueChange={addFromLibrary} value="">
                <SelectTrigger><SelectValue placeholder="Add a food…" /></SelectTrigger>
                <SelectContent>
                  {foods.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium truncate">{it.name}</span>
                    <span className="text-xs text-muted-foreground"> · {n(it.calories)} kcal · {n(it.protein_g)}p/{n(it.carbs_g)}c/{n(it.fat_g)}f</span>
                  </div>
                  <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="outline">{totals.calories} kcal</Badge>
                <Badge variant="outline">{totals.protein_g}p</Badge>
                <Badge variant="outline">{totals.carbs_g}c</Badge>
                <Badge variant="outline">{totals.fat_g}f</Badge>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-1.5">
              <Label>Add item manually</Label>
              <Input value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} placeholder="Item name" />
            </div>
            <Input value={item.serving_description} onChange={(e) => setItem({ ...item, serving_description: e.target.value })} placeholder="Serving" />
            <Input type="number" inputMode="decimal" value={item.calories} onChange={(e) => setItem({ ...item, calories: e.target.value })} placeholder="Cal" />
            <Input type="number" inputMode="decimal" value={item.protein_g} onChange={(e) => setItem({ ...item, protein_g: e.target.value })} placeholder="Protein" />
            <Input type="number" inputMode="decimal" value={item.carbs_g} onChange={(e) => setItem({ ...item, carbs_g: e.target.value })} placeholder="Carbs" />
            <Input type="number" inputMode="decimal" value={item.fat_g} onChange={(e) => setItem({ ...item, fat_g: e.target.value })} placeholder="Fat" />
          </div>
          <Button variant="outline" size="sm" className="w-full border-line" onClick={addItem} disabled={!item.name || !item.calories}>
            <Plus className="w-4 h-4 mr-1" /> Add item
          </Button>

          <Button className="w-full bg-teal text-buttonText hover:opacity-90" onClick={save} disabled={!name || items.length === 0}>
            Save template
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}