import { useState } from "react";
import { useRecompRef } from "@/lib/RecompContext";
import { Link } from "react-router-dom";
import { Utensils, ChevronRight, Plus } from "lucide-react";
import { useLoggingDate } from "@/lib/LoggingDateContext";
import { defaultMealForTime } from "@/lib/foodLogging";
import { createFoodDraft } from "@/lib/foodEntryDraft";
import FoodEntryComposer from "@/components/nutrition/FoodEntryComposer";

/**
 * Saved meals open the shared review without navigating away from Today.
 * Date is captured on tap; meal and portions remain explicit before save.
 */
export function QuickMealsContent() {
  const { mealTemplates } = useRecompRef();
  const { selectedDate } = useLoggingDate();
  const [review, setReview] = useState(null);
  const nutritionUrl = `/nutrition?date=${selectedDate}`;

  return (
    <div className="space-y-2 border-t border-lineSoft pt-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Utensils className="w-4 h-4 text-teal" /> Quick meals
        </h3>
        <Link to={nutritionUrl} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-0.5 text-xs text-teal">
          Manage <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {mealTemplates.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-lineSoft bg-panel2/40 p-3">
            <Plus className="w-4 h-4 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Save your common meals on the{" "}
              <Link to={nutritionUrl} className="text-teal font-medium">Nutrition</Link>{" "}
              page to review and log them here.
            </p>
          </div>
      ) : (
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {mealTemplates.map((t) => (
              <button
                key={t.id}
                onClick={() => setReview({ date: selectedDate, meal: defaultMealForTime(), foods: (t.items ?? []).map((item) => createFoodDraft(item, "template", item.food_id)) })}
                className="min-h-11 shrink-0 rounded-xl border border-line bg-panel2/60 px-3 py-2 text-left transition-colors hover:border-teal/50 hover:bg-teal/5 motion-safe:active:scale-[0.98]"
              >
                <div className="max-w-[8.5rem] truncate text-sm font-medium">{t.name}</div>
                <div className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {t.total_calories} kcal · {t.total_protein_g}p
                </div>
              </button>
            ))}
          </div>
      )}
      {review && <FoodEntryComposer date={review.date} initialMeal={review.meal} initialFoods={review.foods} onClose={() => setReview(null)} />}
    </div>
  );
}

export default QuickMealsContent;
