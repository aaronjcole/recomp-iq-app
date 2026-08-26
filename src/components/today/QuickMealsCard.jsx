import { useRecompRef, useRecompActions } from "@/lib/RecompContext";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Utensils, ChevronRight, Plus } from "lucide-react";
import { HAPTIC_TRIGGERS, triggerHaptic } from "@/lib/haptics";

/**
 * Compact one-tap logging for saved meal templates. Sits on the Today page
 * so common food combinations can be logged without opening the full
 * Nutrition editor. Template creation happens on the Nutrition page.
 */
export default function QuickMealsCard() {
  const { mealTemplates } = useRecompRef();
  const { logMealTemplate } = useRecompActions();
  const { toast } = useToast();

  const log = async (tpl) => {
    try {
      await logMealTemplate(tpl);
      triggerHaptic(HAPTIC_TRIGGERS.MEAL_LOGGED);
      toast({ title: "Logged", description: `${tpl.name} added to today.` });
    } catch {
      toast({ title: "Could not log", description: "Please try again.", variant: "destructive" });
    }
  };

  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-medium">
            <Utensils className="w-4 h-4 text-teal" /> Quick meals
          </h2>
          <Link to="/nutrition" className="flex items-center gap-0.5 text-xs text-teal">
            Manage <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {mealTemplates.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-lineSoft bg-panel2/40 p-3">
            <Plus className="w-4 h-4 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Save your common meals on the{" "}
              <Link to="/nutrition" className="text-teal font-medium">Nutrition</Link>{" "}
              page to log them here in one tap.
            </p>
          </div>
        ) : (
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {mealTemplates.map((t) => (
              <button
                key={t.id}
                onClick={() => log(t)}
                className="shrink-0 rounded-xl border border-line bg-panel2/60 px-3 py-2 text-left transition-colors hover:border-teal/50 hover:bg-teal/5 active:scale-[0.98]"
              >
                <div className="max-w-[8.5rem] truncate text-sm font-medium">{t.name}</div>
                <div className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {t.total_calories} kcal · {t.total_protein_g}p
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}