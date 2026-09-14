import { useState, useMemo } from "react";
import { Flame, Snowflake } from "lucide-react";
import { useRecomp } from "@/lib/RecompContext";
import { calculateStreakStats } from "@/lib/fitness/gamification";
import StreakDetailSheet from "@/components/today/StreakDetailSheet";

/**
 * Compact tappable streak chip for the Today header. Opens a detail sheet
 * showing freeze count, longest streak, personal-best status, and recovery
 * nudge. Reuses the same streak logic as the legacy StreakBanner.
 */
export default function StreakChip() {
  const { logs, strategy } = useRecomp();
  const [open, setOpen] = useState(false);

  const stats = useMemo(() => calculateStreakStats(logs, strategy), [logs, strategy]);

  if (!strategy) return null;

  const streak = stats.current;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-full border border-teal/30 bg-teal/10 px-3 text-teal transition-opacity active:opacity-70"
        aria-label={`${streak} day target streak. Tap for details.`}
      >
        <Flame className="h-4 w-4" aria-hidden="true" />
        <span className="font-mono text-sm font-bold tabular-nums">{streak}</span>
        <span className="hidden min-[380px]:inline text-xs font-medium text-muted-foreground">day streak</span>
        {stats.freezeArmed && <Snowflake className="h-3.5 w-3.5 text-blue" aria-hidden="true" />}
      </button>
      <StreakDetailSheet open={open} onOpenChange={setOpen} />
    </>
  );
}