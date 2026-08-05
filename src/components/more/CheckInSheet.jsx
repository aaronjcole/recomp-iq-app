import { Shield, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from "@/components/ui/sheet";

export default function CheckInSheet({ open, onOpenChange, result, lastCheckIn }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-w-md mx-auto rounded-t-xl space-y-4">
        <SheetHeader>
          <SheetTitle>Weekly check-in</SheetTitle>
          <SheetDescription>Adaptive engine review of your last 7 days</SheetDescription>
        </SheetHeader>

        <div className="space-y-3">
          {result ? (
            <>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-teal" />
                <span className="font-medium text-sm capitalize">
                  {result.adjustment.decision.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{result.adjustment.reason}</p>
              <p className="text-xs text-muted-foreground">{result.checkIn.ai_summary}</p>
              {result.trend && (
                <div className="space-y-1 pt-2 border-t border-line">
                  <p className="text-xs font-medium text-muted-foreground">Signals used</p>
                  {result.trend.days_logged != null && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Days logged</span>
                      <span>{result.trend.days_logged}</span>
                    </div>
                  )}
                  {result.trend.weight_change_lbs != null && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Weight change</span>
                      <span>{result.trend.weight_change_lbs > 0 ? "+" : ""}{result.trend.weight_change_lbs} lb vs last week</span>
                    </div>
                  )}
                  {result.trend.calorie_adherence != null && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Calorie adherence</span>
                      <span>{Math.round(result.trend.calorie_adherence * 100)}%</span>
                    </div>
                  )}
                  {result.trend.protein_adherence != null && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Protein adherence</span>
                      <span>{Math.round(result.trend.protein_adherence * 100)}%</span>
                    </div>
                  )}
                  {result.trend.step_adherence != null && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Step adherence</span>
                      <span>{Math.round(result.trend.step_adherence * 100)}%</span>
                    </div>
                  )}
                  {result.trend.workout_adherence != null && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Workout adherence</span>
                      <span>{Math.round(result.trend.workout_adherence * 100)}%</span>
                    </div>
                  )}
                </div>
              )}
              {result.manual && (
                <div className="flex items-start gap-2 text-xs text-gold bg-questComplete rounded-md p-2">
                  <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Manual targets are on — your numbers weren&apos;t changed. Apply the suggestion on the Nutrition page if you&apos;d like.</span>
                </div>
              )}
            </>
          ) : lastCheckIn ? (
            <div className="text-xs text-muted-foreground">
              Last check-in · {lastCheckIn.end_date}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No check-in yet.</div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}