import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const STATUS_CLASS = {
  good: "bg-green",
  watch: "bg-gold",
  bad: "bg-red",
  neutral: "bg-teal"
};

export default function ScoreDriversSheet({ open, onOpenChange, drivers }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-xl">
        <SheetHeader>
          <SheetTitle>What’s Driving Your Score</SheetTitle>
          <SheetDescription>Your signal combines the useful data available from recent logs.</SheetDescription>
        </SheetHeader>
        <div className="space-y-1 px-4 pb-6 pt-4">
          {drivers.map((driver) => (
            <div key={driver.label} className="flex min-h-11 items-center gap-3 border-b border-lineSoft py-2 last:border-0">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_CLASS[driver.status] ?? STATUS_CLASS.neutral}`} aria-hidden="true" />
              <span className="flex-1 text-sm text-muted-foreground">{driver.label}</span>
              <span className="text-right font-mono text-sm font-medium tabular-nums">{driver.value}{driver.unit ? ` ${driver.unit}` : ""}</span>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}