import { useEffect, useId, useRef, useState } from "react";
import { useLocation, useResolvedPath } from "react-router-dom";
import { useRecompRef, useRecompActions } from "@/lib/RecompContext";
import { todayStr, formatShortDate, isValidLocalDate } from "@/lib/loggingDateUtils";
import { defaultMealForTime, LOGGABLE_MEALS } from "@/lib/foodLogging";
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

export default function MealTemplatesCard({ date = todayStr(), meal = defaultMealForTime() }) {
  const { mealTemplates, foods } = useRecompRef();
  const { saveMealTemplate, logMealTemplate } = useRecompActions();
  const { toast } = useToast();
  const formId = useId();
  const [name, setName] = useState("");
  const [items, setItems] = useState([]);
  const [item, setItem] = useState(emptyItem);
  const [loggingId, setLoggingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const savingRef = useRef(false);
  const loggingRef = useRef(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { pathname } = useLocation();
  const ownerPath = useResolvedPath(".").pathname;
  const active = pathname.replace(/\/$/, "") === ownerPath.replace(/\/$/, "");
  useEffect(() => { if (!active) setLibraryOpen(false); }, [active]);

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
    if (savingRef.current || !name.trim() || items.length === 0) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await saveMealTemplate({
        name: name.trim(),
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
    } catch {
      setSaveError("Meal template could not be saved. Your items are still here; please try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const log = async (tpl) => {
    if (loggingRef.current || !isValidLocalDate(date) || !LOGGABLE_MEALS.some((option) => option.value === meal)) return;
    loggingRef.current = true;
    setLoggingId(tpl.id);
    const targetDate = date;
    const targetMeal = meal;
    try {
      await logMealTemplate(tpl, targetDate, targetMeal);
      toast({ title: "Meal template logged", description: `${formatShortDate(targetDate)} · ${LOGGABLE_MEALS.find((option) => option.value === targetMeal)?.label}` });
    } catch {
      toast({ title: "Couldn't log meal template", description: "Please try again.", variant: "destructive" });
    } finally {
      loggingRef.current = false;
      setLoggingId(null);
    }
  };

  return (
    <Card className="min-w-0 bg-panel border-line [overflow-wrap:anywhere]">
      <CardContent className="p-5 space-y-4">
        <h2 className="flex items-center gap-2 font-medium">
          <Utensils className="w-4 h-4 text-teal" /> Meal templates
        </h2>

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
            <Button
              size="sm"
              className="shrink-0 bg-teal text-buttonText hover:opacity-90"
              onClick={() => log(t)}
              disabled={Boolean(loggingId) || !isValidLocalDate(date) || !LOGGABLE_MEALS.some((option) => option.value === meal)}
              aria-label={`Log ${t.name}`}
            >
              {loggingId === t.id ? "Logging…" : "Log"}
            </Button>
          </div>
        ))}

        <fieldset disabled={saving} className="min-w-0 space-y-3 rounded-lg bg-panel2 p-3">
          <h3 className="text-xs font-medium text-muted-foreground">Save as meal template</h3>

          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-name`}>Template name</Label>
            <Input id={`${formId}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Breakfast bowl" />
          </div>

          {foods.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-library`}>Pick from library</Label>
              <Select onValueChange={addFromLibrary} value="" disabled={saving} open={active && libraryOpen} onOpenChange={setLibraryOpen}>
                <SelectTrigger id={`${formId}-library`}><SelectValue placeholder="Add a food…" /></SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-2rem)]">
                  {foods.map((f) => (
                    <SelectItem key={f.id} value={f.id}><span className="block max-w-[min(16rem,calc(100vw-6rem))] whitespace-normal [overflow-wrap:anywhere]">{f.name}</span></SelectItem>
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
                    <span className="block break-words font-medium">{it.name}</span>
                    <span className="text-xs text-muted-foreground"> · {n(it.calories)} kcal · {n(it.protein_g)}p/{n(it.carbs_g)}c/{n(it.fat_g)}f</span>
                  </div>
                  <button type="button" aria-label={`Remove template item ${idx + 1}`} onClick={() => removeItem(idx)} className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-destructive shrink-0">
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
              <Label htmlFor={`${formId}-item-name`}>Add item manually</Label>
              <Input id={`${formId}-item-name`} value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} placeholder="Item name" />
            </div>
            <Input aria-label="Template item serving" value={item.serving_description} onChange={(e) => setItem({ ...item, serving_description: e.target.value })} placeholder="Serving" />
            <Input aria-label="Template item calories" type="number" inputMode="decimal" value={item.calories} onChange={(e) => setItem({ ...item, calories: e.target.value })} placeholder="Cal" />
            <Input aria-label="Template item protein" type="number" inputMode="decimal" value={item.protein_g} onChange={(e) => setItem({ ...item, protein_g: e.target.value })} placeholder="Protein" />
            <Input aria-label="Template item carbs" type="number" inputMode="decimal" value={item.carbs_g} onChange={(e) => setItem({ ...item, carbs_g: e.target.value })} placeholder="Carbs" />
            <Input aria-label="Template item fat" type="number" inputMode="decimal" value={item.fat_g} onChange={(e) => setItem({ ...item, fat_g: e.target.value })} placeholder="Fat" />
          </div>
          <Button variant="outline" size="sm" className="w-full border-line" onClick={addItem} disabled={!item.name || !item.calories}>
            <Plus className="w-4 h-4 mr-1" /> Add item
          </Button>

          {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          <Button className="w-full bg-teal text-buttonText hover:opacity-90" onClick={save} disabled={saving || !name.trim() || items.length === 0}>
            {saving ? "Saving template…" : "Save template"}
          </Button>
        </fieldset>
      </CardContent>
    </Card>
  );
}
