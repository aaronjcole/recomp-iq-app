import MacroDonut from "@/components/common/MacroDonut";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const KCAL = { protein: 4, carbs: 4, fat: 9 };

export default function TodayMacroCard({ calorieTarget, protein = 0, carbs = 0, fat = 0, onLog }) {
  const macroCals = protein * KCAL.protein + carbs * KCAL.carbs + fat * KCAL.fat;
  const remaining = Math.max(0, Math.round(calorieTarget - macroCals));
  return (
    <Card className="bg-panel border-line">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Today's fuel</h2>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{Math.round(macroCals)} / {calorieTarget} kcal</span>
        </div>
        <MacroDonut protein={protein} carbs={carbs} fat={fat} />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-bold tabular-nums">{remaining} left</div>
            <div className="text-xs text-muted-foreground">of {calorieTarget} kcal</div>
          </div>
          <Button size="sm" className="bg-teal text-buttonText hover:opacity-90" onClick={onLog}>
            <Plus className="w-4 h-4 mr-1" /> Log
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}