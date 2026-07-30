import { useState } from "react";
import { useRecomp, todayStr } from "@/lib/RecompContext";
import { scoreNutritionQuality } from "@/lib/fitness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MacroBar from "@/components/common/MacroBar";
import MacroDonut from "@/components/common/MacroDonut";
import MealTemplatesCard from "@/components/nutrition/MealTemplatesCard";
import GroceryListCard from "@/components/nutrition/GroceryListCard";
import AddRecipeCard from "@/components/nutrition/AddRecipeCard";
import CustomTargetsCard from "@/components/nutrition/CustomTargetsCard";
import { Plus, Check, ScanLine } from "lucide-react";
import BarcodeScanner from "@/components/nutrition/BarcodeScanner";
import { toast } from "@/components/ui/use-toast";
import PullToRefresh from "@/components/common/PullToRefresh";

const empty = { name: "", serving_description: "", serving_grams: "", calories: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "" };
const num = (v) => (v === "" ? null : Number(v));

export default function Nutrition() {
  const { strategy, todayLog, foods, upsertDailyLog, addFood, reload } = useRecomp();
  const [form, setForm] = useState(empty);
  const [showScanner, setShowScanner] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleScannedFood = async (food, addToToday) => {
    await addFood(food);
    if (addToToday) {
      await upsertDailyLog(todayStr(), {
        calories: (todayLog?.calories ?? 0) + (food.calories ?? 0),
        protein_g: (todayLog?.protein_g ?? 0) + (food.protein_g ?? 0),
        carbs_g: (todayLog?.carbs_g ?? 0) + (food.carbs_g ?? 0),
        fat_g: (todayLog?.fat_g ?? 0) + (food.fat_g ?? 0)
      });
    }
    toast({ title: `${food.name} ${addToToday ? "added to today" : "saved to library"}` });
    setShowScanner(false);
  };

  if (!strategy) return null;

  const consumed = {
    calories: todayLog?.calories ?? 0,
    protein: todayLog?.protein_g ?? 0,
    carbs: todayLog?.carbs_g ?? 0,
    fat: todayLog?.fat_g ?? 0
  };

  const saveFood = async (addToToday) => {
    const food = {
      source: "manual",
      name: form.name,
      serving_description: form.serving_description || "1 serving",
      serving_grams: num(form.serving_grams),
      calories: Number(form.calories) || 0,
      protein_g: Number(form.protein_g) || 0,
      carbs_g: Number(form.carbs_g) || 0,
      fat_g: Number(form.fat_g) || 0,
      fiber_g: num(form.fiber_g)
    };
    await addFood(food);
    if (addToToday) {
      await upsertDailyLog(todayStr(), {
        calories: (todayLog?.calories ?? 0) + food.calories,
        protein_g: (todayLog?.protein_g ?? 0) + food.protein_g,
        carbs_g: (todayLog?.carbs_g ?? 0) + food.carbs_g,
        fat_g: (todayLog?.fat_g ?? 0) + food.fat_g
      });
    }
    setForm(empty);
  };

  const canSave = form.name && form.calories;

  return (
    <PullToRefresh onRefresh={reload}>
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Nutrition</h1>

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-3">
          <MacroBar label="Calories" value={consumed.calories} target={strategy.calorie_target} colorClass="bg-teal" />
          <MacroBar label="Protein" value={consumed.protein} target={strategy.protein_target_g} unit="g" colorClass="bg-teal" />
          <MacroBar label="Carbs" value={consumed.carbs} target={strategy.carb_target_g} unit="g" colorClass="bg-blue" />
          <MacroBar label="Fat" value={consumed.fat} target={strategy.fat_target_g} unit="g" colorClass="bg-gold" />
        </CardContent>
      </Card>

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Macro breakdown</div>
          <MacroDonut protein={consumed.protein} carbs={consumed.carbs} fat={consumed.fat} />
        </CardContent>
      </Card>

      <CustomTargetsCard />

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium">Quick add food</div>
            <Button variant="outline" size="sm" onClick={() => setShowScanner(true)}>
              <ScanLine className="w-4 h-4 mr-1" /> Scan barcode
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Food name</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Serving</Label>
              <Input value={form.serving_description} onChange={(e) => set("serving_description", e.target.value)} placeholder="1 cup" />
            </div>
            <div className="space-y-1.5">
              <Label>Grams</Label>
              <Input type="number" value={form.serving_grams} onChange={(e) => set("serving_grams", e.target.value)} />
            </div>
            <Field label="Calories" v={form.calories} on={(v) => set("calories", v)} />
            <Field label="Protein (g)" v={form.protein_g} on={(v) => set("protein_g", v)} />
            <Field label="Carbs (g)" v={form.carbs_g} on={(v) => set("carbs_g", v)} />
            <Field label="Fat (g)" v={form.fat_g} on={(v) => set("fat_g", v)} />
            <Field label="Fiber (g)" v={form.fiber_g} on={(v) => set("fiber_g", v)} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" disabled={!canSave} onClick={() => saveFood(false)}>Save to library</Button>
            <Button className="flex-1 bg-teal text-buttonText hover:opacity-90" disabled={!canSave} onClick={() => saveFood(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add to today
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-3">
          <div className="font-medium">Food library</div>
          {foods.length === 0 && <p className="text-sm text-muted-foreground">No foods saved yet.</p>}
          {foods.slice(0, 12).map((f) => {
            const q = scoreNutritionQuality(f);
            return (
              <div key={f.id} className="flex items-center justify-between gap-3 py-2 border-b border-lineSoft last:border-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{f.name}</div>
                  <div className="text-xs text-muted-foreground">{f.calories} kcal · {f.protein_g}p / {f.carbs_g}c / {f.fat_g}f</div>
                </div>
                <Badge variant="outline" className="shrink-0">{q.score}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <MealTemplatesCard />

      <GroceryListCard />
      <AddRecipeCard />

      {showScanner && (
        <BarcodeScanner
          onClose={() => setShowScanner(false)}
          onResult={handleScannedFood}
        />
      )}
    </div>
    </PullToRefresh>
  );
}

function Field({ label, v, on }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" inputMode="decimal" value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}