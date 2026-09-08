import MacroDonut from "@/components/common/MacroDonut";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { QuickMealsContent } from "@/components/today/QuickMealsCard";

export default function TodayMacroCard({ calorieTarget, calories = 0, protein = 0, carbs = 0, fat = 0, onLog }) {
  const parsedCalories = Number(calories);
  const loggedCalories = Number.isFinite(parsedCalories) ? Math.max(0, parsedCalories) : 0;
  const remaining = Math.max(0, Math.round(calorieTarget - loggedCalories));
  return (
    <section aria-label="Today's fuel">
      <Card className="bg-panel border-line">
        <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Today's fuel</h2>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{Math.round(loggedCalories)} / {calorieTarget} kcal</span>
        </div>
        <MacroDonut protein={protein} carbs={carbs} fat={fat} calories={loggedCalories} />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-bold tabular-nums">{remaining} left</div>
            <div className="text-xs text-muted-foreground">of {calorieTarget} kcal</div>
          </div>
          <Button
            size="sm"
            className="bg-teal text-buttonText hover:opacity-90"
            onClick={onLog}
            aria-label="Log today's basics"
          >
            <Plus className="w-4 h-4 mr-1" /> Log
          </Button>
        </div>
        <QuickMealsContent />
        </CardContent>
      </Card>
    </section>
  );
}
