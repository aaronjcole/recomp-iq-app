import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronDown, RefreshCw, ShoppingCart } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ChildTopBar from "@/components/ChildTopBar";
import PremiumBadge from "@/components/premium/PremiumBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { usePremiumAccess } from "@/lib/PremiumAccessContext";
import { PREMIUM_FEATURES } from "../../base44/shared/premiumDomain";

function currentWeekStart() {
  const date = new Date();
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatDay(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric"
  });
}

function errorMessage(error) {
  return error?.response?.data?.error
    ?? error?.data?.error
    ?? error?.message
    ?? "The meal plan could not be created right now.";
}

export default function AdaptiveMealPlan() {
  const { canAccess, isLoading: accessLoading } = usePremiumAccess();
  const allowed = canAccess(PREMIUM_FEATURES.MEAL_PLANNING);
  const [plan, setPlan] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState({});
  const weekStart = useMemo(currentWeekStart, []);

  const generate = async () => {
    setIsGenerating(true);
    setError("");
    try {
      const result = await base44.functions.invoke("generateAdaptiveMealPlan", { weekStart });
      const nextPlan = result?.data ?? result;
      if (!nextPlan || !Array.isArray(nextPlan.days) || !Array.isArray(nextPlan.groceryList)) {
        throw new Error("The meal planner returned an incomplete plan.");
      }
      setPlan(nextPlan);
      setChecked({});
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <ChildTopBar title="Adaptive meal plan" fallbackTo="/nutrition" />

      <Card className="border-line bg-panel">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal/15 text-teal">
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
            </div>
            <PremiumBadge />
          </div>
          <div>
            <h2 className="font-semibold">One week, one grocery run</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Build seven days of meals from your current targets, diet style, and latest weekly check-in.
            </p>
          </div>

          {!accessLoading && !allowed && (
            <div className="space-y-3 rounded-lg border border-lineSoft bg-panel2 p-4">
              <p className="text-sm text-muted-foreground">
                This feature is visible during testing and requires verified Premium access.
              </p>
              <Button asChild variant="outline" className="w-full border-line">
                <Link to="/more/premium">Review Premium access</Link>
              </Button>
            </div>
          )}

          {allowed && (
            <Button
              className="w-full bg-teal text-buttonText hover:opacity-90"
              onClick={generate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <><RefreshCw className="animate-spin" aria-hidden="true" /> Building your week…</>
              ) : plan ? (
                <><RefreshCw aria-hidden="true" /> Rebuild this week</>
              ) : (
                <><CalendarDays aria-hidden="true" /> Build this week</>
              )}
            </Button>
          )}

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </CardContent>
      </Card>

      {plan && (
        <>
          <Card className="border-line bg-panel">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{plan.dailyTargets.calories} kcal</Badge>
                <Badge variant="outline">{plan.dailyTargets.proteinG}g protein target</Badge>
                <Badge variant="outline">{plan.dietStyle}</Badge>
              </div>
              <h2 className="font-semibold">Why this week looks this way</h2>
              <p className="text-sm text-muted-foreground">{plan.adaptation.summary}</p>
            </CardContent>
          </Card>

          <section className="space-y-3" aria-labelledby="meal-plan-days">
            <h2 id="meal-plan-days" className="font-semibold">Your seven-day plan</h2>
            {plan.days.map((day, index) => (
              <Card key={day.date} className="border-line bg-panel">
                <details open={index === 0} className="group">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <span>
                      <span className="block font-medium">{formatDay(day.date)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {day.totals.calories} kcal · {day.totals.proteinG}g protein
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <CardContent className="space-y-3 px-5 pb-5 pt-0">
                    {day.meals.map((meal) => (
                      <div key={meal.slot} className="rounded-lg bg-panel2 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{meal.slot}</p>
                            <h3 className="text-sm font-medium">{meal.title}</h3>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">{meal.calories} kcal</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {meal.proteinG}p / {meal.carbsG}c / {meal.fatG}f · {meal.servingScale}× base portion
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </details>
              </Card>
            ))}
          </section>

          <Card className="border-line bg-panel">
            <CardContent className="space-y-4 p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <ShoppingCart className="h-4 w-4 text-teal" aria-hidden="true" /> Grocery list
              </h2>
              <div className="space-y-1">
                {plan.groceryList.map((item) => {
                  const key = `${item.name}|${item.unit}`;
                  const done = checked[key] === true;
                  return (
                    <div key={key} className="flex min-h-11 items-center gap-3">
                      <Checkbox
                        id={`meal-plan-${key.replace(/[^a-z0-9]/gi, "-")}`}
                        checked={done}
                        onCheckedChange={() => setChecked((current) => ({ ...current, [key]: !done }))}
                      />
                      <Label
                        htmlFor={`meal-plan-${key.replace(/[^a-z0-9]/gi, "-")}`}
                        className={`flex min-h-11 flex-1 cursor-pointer items-center text-sm ${done ? "text-muted-foreground line-through" : ""}`}
                      >
                        {item.quantity} {item.unit} {item.name}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-line bg-panel2">
            <CardContent className="space-y-2 p-4 text-xs text-muted-foreground">
              <p>{plan.allergyNotice}</p>
              <p>{plan.nutritionNotice}</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
