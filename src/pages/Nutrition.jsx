import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useRecomp } from "@/lib/RecompContext";
import { scoreNutritionQuality } from "@/lib/fitness";
import { useLoggingDate } from "@/lib/LoggingDateContext";
import LoggingDatePicker from "@/components/LoggingDatePicker";
import SegmentedControl from "@/components/common/SegmentedControl";
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
import FoodDiaryCard from "@/components/nutrition/FoodDiaryCard";
import PremiumBadge from "@/components/premium/PremiumBadge";
import { Plus, ScanLine, Camera, ChartPie, ChevronDown, SlidersHorizontal, CalendarDays, ArrowRight } from "lucide-react";
// Loaded on demand so the ~110KB @zxing barcode decoder (and the flag-gated AI
// food-photo scanner) stay out of the Fuel tab's initial chunk and only download
// when the user actually opens a scanner.
const BarcodeScanner = lazy(() => import("@/components/nutrition/BarcodeScanner"));
const FoodPhotoScan = lazy(() => import("@/components/nutrition/FoodPhotoScan"));
import PullToRefresh from "@/components/common/PullToRefresh";
import { featureFlags } from "@/lib/featureFlags";
import { formatLogDayLabel } from "@/lib/loggingDateUtils";

const empty = { name: "", serving_description: "", serving_grams: "", calories: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "" };
const num = (v) => (v === "" ? null : Number(v));

export default function Nutrition() {
  const { strategy, logs, foods, addFood, logFoodEntry, upsertDailyLog, reload } = useRecomp();
  const { selectedDate, isToday } = useLoggingDate();
  const [form, setForm] = useState(empty);
  const [showScanner, setShowScanner] = useState(false);
  const [showPhotoScan, setShowPhotoScan] = useState(false);
  const [searchParams] = useSearchParams();
  const { state } = useLocation();
  const detailsRef = useRef(null);
  const foodFormId = useId();
  const requestedPanel = searchParams.get("panel");
  const [targetsExpanded, setTargetsExpanded] = useState(() => requestedPanel === "targets");
  const [segment, setSegment] = useState(requestedPanel === "targets" ? "tools" : "diary");
  const [manualOpen, setManualOpen] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const selectedLog = useMemo(
    () => logs.find((l) => l.date === selectedDate) ?? null,
    [logs, selectedDate]
  );

  const dayLabel = formatLogDayLabel(selectedDate, isToday);

  const logToToday = async (food, source, sourceFoodId) => {
    if (featureFlags.itemizedFoodDiary) {
      await logFoodEntry({
        date: selectedDate, meal: "other", name: food.name,
        serving_description: food.serving_description || "1 serving", quantity: 1,
        calories: food.calories ?? 0, protein_g: food.protein_g ?? 0,
        carbs_g: food.carbs_g ?? 0, fat_g: food.fat_g ?? 0, fiber_g: food.fiber_g ?? 0,
        source, source_food_id: sourceFoodId
      });
      return;
    }
    await upsertDailyLog(selectedDate, (current) => ({
      calories: (current?.calories ?? 0) + (food.calories ?? 0),
      protein_g: (current?.protein_g ?? 0) + (food.protein_g ?? 0),
      carbs_g: (current?.carbs_g ?? 0) + (food.carbs_g ?? 0),
      fat_g: (current?.fat_g ?? 0) + (food.fat_g ?? 0)
    }));
  };

  useEffect(() => {
    if (!strategy || requestedPanel !== "targets") return undefined;
    const timer = window.setTimeout(() => {
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [requestedPanel, strategy]);

  useEffect(() => {
    if (!state?.scrollTo) return;
    const el = document.getElementById(state.scrollTo);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state?.scrollTo]);

  const handleScannedFood = async (food, addToToday) => {
    const savedFood = await addFood(food);
    if (addToToday) {
      await logToToday(food, showPhotoScan ? "photo" : "barcode", savedFood.id);
    }
    setShowScanner(false);
    setShowPhotoScan(false);
  };

  const [showAllFoods, setShowAllFoods] = useState(false);

  const quickAddFood = async (f) => {
    await logToToday(f, "library", f.id);
  };

  if (!strategy) return (
    <div className="space-y-5">
      <div className="h-8 w-40 animate-pulse rounded-xl bg-panel2" />
      <div className="h-36 animate-pulse rounded-xl bg-panel2" />
      <div className="h-72 animate-pulse rounded-xl bg-panel2" />
      <div className="h-48 animate-pulse rounded-xl bg-panel2" />
    </div>
  );

  const consumed = {
    calories: selectedLog?.calories ?? 0,
    protein: selectedLog?.protein_g ?? 0,
    carbs: selectedLog?.carbs_g ?? 0,
    fat: selectedLog?.fat_g ?? 0
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
    const savedFood = await addFood(food);
    if (addToToday) {
      await logToToday(food, "manual", savedFood.id);
    }
    setForm(empty);
  };

  const canSave = form.name && form.calories;

  return (
    <PullToRefresh onRefresh={reload}>
    <div className="space-y-5">
      <h1 className="text-h1 font-bold">Fuel</h1>

      <LoggingDatePicker />

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-3">
          <MacroBar label="Calories" value={consumed.calories} target={strategy.calorie_target} colorClass="bg-teal" />
          <MacroBar label="Protein" value={consumed.protein} target={strategy.protein_target_g} unit="g" colorClass="bg-teal" />
          <MacroBar label="Carbs" value={consumed.carbs} target={strategy.carb_target_g} unit="g" colorClass="bg-blue" />
          <MacroBar label="Fat" value={consumed.fat} target={strategy.fat_target_g} unit="g" colorClass="bg-gold" />
        </CardContent>
      </Card>

      <SegmentedControl
        value={segment}
        onChange={setSegment}
        options={[
          { value: "diary", label: "Diary" },
          { value: "library", label: "Library" },
          { value: "tools", label: "Tools" }
        ]}
      />

      {segment === "diary" && (
        <>
          {featureFlags.itemizedFoodDiary && <FoodDiaryCard date={selectedDate} />}

          <Card className="bg-panel border-line">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium">Quick add</h2>
              </div>
              {foods.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Recent</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 no-scrollbar">
                    {foods.slice(0, 6).map((f) => (
                      <button
                        key={f.id}
                        onClick={() => quickAddFood(f)}
                        className="flex-none rounded-xl border border-line bg-panel2 px-3 py-2 text-left min-w-[110px] max-w-[150px] active:opacity-70 transition-opacity"
                      >
                        <div className="text-sm font-medium truncate">{f.name}</div>
                        <div className="text-xs text-muted-foreground">{f.calories} kcal</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <details className="group" open={manualOpen} onToggle={(e) => setManualOpen(e.currentTarget.open)}>
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg bg-panel2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                  <span className="text-sm font-medium">Add food manually</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="space-y-3 pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1.5">
                      <Label htmlFor={`${foodFormId}-name`}>Food name</Label>
                      <Input id={`${foodFormId}-name`} className="h-11" value={form.name} onChange={(e) => set("name", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${foodFormId}-serving`}>Serving</Label>
                      <Input id={`${foodFormId}-serving`} className="h-11" value={form.serving_description} onChange={(e) => set("serving_description", e.target.value)} placeholder="1 cup" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${foodFormId}-grams`}>Grams</Label>
                      <Input id={`${foodFormId}-grams`} className="h-11" type="number" value={form.serving_grams} onChange={(e) => set("serving_grams", e.target.value)} />
                    </div>
                    <Field id={`${foodFormId}-calories`} label="Calories" accessibleLabel="Food calories" v={form.calories} on={(v) => set("calories", v)} />
                    <Field id={`${foodFormId}-protein`} label="Protein (g)" accessibleLabel="Food protein (g)" v={form.protein_g} on={(v) => set("protein_g", v)} />
                    <Field id={`${foodFormId}-carbs`} label="Carbs (g)" accessibleLabel="Food carbs (g)" v={form.carbs_g} on={(v) => set("carbs_g", v)} />
                    <Field id={`${foodFormId}-fat`} label="Fat (g)" accessibleLabel="Food fat (g)" v={form.fat_g} on={(v) => set("fat_g", v)} />
                    <Field id={`${foodFormId}-fiber`} label="Fiber (g)" accessibleLabel="Food fiber (g)" v={form.fiber_g} on={(v) => set("fiber_g", v)} />
                  </div>
                  <div className="grid grid-cols-1 gap-2 pt-1 min-[360px]:grid-cols-2">
                    <Button variant="outline" className="min-h-11 w-full" disabled={!canSave} onClick={() => saveFood(false)}>Save to library</Button>
                    <Button className="min-h-11 w-full bg-teal text-buttonText hover:opacity-90" disabled={!canSave} onClick={() => saveFood(true)}>
                      <Plus className="w-4 h-4 mr-1" /> Add to {dayLabel}
                    </Button>
                  </div>
                </div>
              </details>
            </CardContent>
          </Card>

          <Card className="bg-panel border-line">
            <CardContent className="px-5 py-1">
              <details className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between py-3 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-3 text-left">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-panel2 text-teal">
                      <ChartPie className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block font-medium">Macro breakdown</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        See the calorie split
                      </span>
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="pb-5 pt-2">
                  <MacroDonut protein={consumed.protein} carbs={consumed.carbs} fat={consumed.fat} />
                </div>
              </details>
            </CardContent>
          </Card>
        </>
      )}

      {segment === "library" && (
        <>
          <Card className="bg-panel border-line">
            <CardContent className="p-5 space-y-3">
              <h2 className="font-medium">Food library</h2>
              {foods.length === 0 && <p className="text-sm text-muted-foreground">No foods saved yet.</p>}
              {(showAllFoods ? foods : foods.slice(0, 12)).map((f) => {
                const q = scoreNutritionQuality(f);
                return (
                  <div key={f.id} className="flex items-center justify-between gap-3 py-2 border-b border-lineSoft last:border-0">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{f.name}</div>
                      <div className="text-xs text-muted-foreground">{f.calories} kcal · {f.protein_g}p / {f.carbs_g}c / {f.fat_g}f</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="min-h-11" onClick={() => quickAddFood(f)}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add
                      </Button>
                      <Badge variant="outline" className="shrink-0">{q.score}</Badge>
                    </div>
                  </div>
                );
              })}
              {foods.length > 12 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-line min-h-11"
                  onClick={() => setShowAllFoods((v) => !v)}
                >
                  {showAllFoods ? "Show less" : `Show all ${foods.length} items`}
                </Button>
              )}
            </CardContent>
          </Card>

          <MealTemplatesCard date={selectedDate} />
        </>
      )}

      {segment === "tools" && (
        <>
          <Card className="bg-panel border-line">
            <CardContent className="p-5 space-y-3">
              <h2 className="font-medium">Scan food</h2>
              <p className="text-sm text-muted-foreground">Add a food by barcode or photo.</p>
              <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                {featureFlags.foodPhotoScan && (
                  <Button variant="outline" className="min-h-11 w-full" onClick={() => setShowPhotoScan(true)}>
                    <Camera className="w-4 h-4 mr-1" /> Snap food
                  </Button>
                )}
                <Button variant="outline" className="min-h-11 w-full" onClick={() => setShowScanner(true)}>
                  <ScanLine className="w-4 h-4 mr-1" /> Barcode
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card ref={detailsRef} className="scroll-mt-4 bg-panel border-line">
            <CardContent className="px-5 py-1">
              <details
                className="group"
                open={targetsExpanded}
                onToggle={(event) => setTargetsExpanded(event.currentTarget.open)}
              >
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between py-3 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-3 text-left">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-panel2 text-teal">
                      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block font-medium">Targets &amp; adaptive mode</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        Review or override your plan
                      </span>
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="pb-5 pt-2">
                  <CustomTargetsCard embedded />
                </div>
              </details>
            </CardContent>
          </Card>

          <Card className="border-line bg-panel">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/15 text-teal">
                  <CalendarDays className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">Adaptive weekly meal plan</h2>
                    <PremiumBadge />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Turn your targets and last check-in into seven days of meals and one grocery list.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" className="w-full border-line">
                <Link to="/nutrition/meal-plan">
                  Open meal planner <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <GroceryListCard />
          <AddRecipeCard />
        </>
      )}

      {showScanner && (
        <Suspense fallback={<ScannerLoading />}>
          <BarcodeScanner
            onClose={() => setShowScanner(false)}
            onResult={handleScannedFood}
          />
        </Suspense>
      )}

      {featureFlags.foodPhotoScan && showPhotoScan && (
        <Suspense fallback={<ScannerLoading />}>
          <FoodPhotoScan
            onClose={() => setShowPhotoScan(false)}
            onResult={handleScannedFood}
          />
        </Suspense>
      )}
    </div>
    </PullToRefresh>
  );
}

function ScannerLoading() {
  // Visible feedback while the lazily-loaded scanner chunk downloads, so a slow
  // mobile network doesn't make the tap look like it did nothing.
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-panel px-6 py-5">
        <div className="w-8 h-8 border-4 border-panel2 border-t-teal rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">Loading scanner…</span>
      </div>
    </div>
  );
}

function Field({ id, label, accessibleLabel, v, on }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-label={accessibleLabel} className="h-11" type="number" inputMode="decimal" value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}