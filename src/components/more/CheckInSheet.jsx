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