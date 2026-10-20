import MacroDonut from "@/components/common/MacroDonut";
import { useState } from "react";
import MacroBar from "@/components/common/MacroBar";
import { Link } from "react-router-dom";
import { useLoggingDate } from "@/lib/LoggingDateContext";
import { formatWeekdayName } from "@/lib/loggingDateUtils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { QuickMealsContent } from "@/components/today/QuickMealsCard";

export default function TodayMacroCard({ calorieTarget, proteinTarget, calories = 0, protein = 0, carbs = 0, fat = 0, onLog }) {
  const { selectedDate, isToday } = useLoggingDate();
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const day = isToday ? "today" : formatWeekdayName(selectedDate);
  const parsedCalories = Number(calories);
  const loggedCalories = Number.isFinite(parsedCalories) ? Math.max(0, parsedCalories) : 0;
  const remaining = Math.round(calorieTarget - loggedCalories);
  const proteinRemaining = Math.round(proteinTarget - protein);
  const heading = isToday ? "Today's fuel" : `${day}'s fuel`;
  return (
    <section aria-label={heading}>
      <Card className="bg-panel border-line">
        <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{heading}</h2>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{Math.round(loggedCalories)} / {calorieTarget} kcal</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-bold tabular-nums">{Math.round(loggedCalories)}</div>
            <div className="text-xs text-muted-foreground">kcal logged · <span>{remaining >= 0 ? `${remaining} left` : `${Math.abs(remaining)} over target`}</span></div>
          </div>
          <Button
            size="sm"
            className="bg-teal text-buttonText hover:opacity-90"
            onClick={onLog}
            aria-label={`Log ${isToday ? "today's" : `${day}'s`} basics`}
          >
            <Plus className="w-4 h-4 mr-1" /> Log
          </Button>
        </div>
        <MacroBar label="Calories" value={loggedCalories} target={calorieTarget} colorClass="bg-teal" />
        <MacroBar label="Protein" value={protein} target={proteinTarget} unit="g" colorClass="bg-teal" />
        <p className="text-xs text-muted-foreground tabular-nums">{proteinRemaining >= 0 ? `${proteinRemaining}g protein left` : `${Math.abs(proteinRemaining)}g protein above target`}</p>
        <Link className="inline-flex min-h-11 items-center text-xs text-teal" to={`/more/coach?date=${selectedDate}&topic=protein`}>Ask Coach about protein</Link>
        <Button asChild variant="outline" className="min-h-11 w-full"><Link to={`/nutrition?date=${selectedDate}`}>Add food to {day}</Link></Button>
        <details open={breakdownOpen} onToggle={(event) => setBreakdownOpen(event.currentTarget.open)}>
          <summary className="flex min-h-11 cursor-pointer items-center text-xs text-muted-foreground">Macro composition</summary>
          <p className="mb-2 text-xs text-muted-foreground">Share of calories from each macro, not progress toward your targets.</p>
          {breakdownOpen && <MacroDonut protein={protein} carbs={carbs} fat={fat} calories={loggedCalories} />}
        </details>
        <QuickMealsContent />
        </CardContent>
      </Card>
    </section>
  );
}
