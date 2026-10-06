import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Info, Shield } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useRecomp } from "@/lib/RecompContext";
import { HAPTIC_TRIGGERS, triggerHaptic } from "@/lib/haptics";
import { decisionLabel, shiftDateKey, TARGET_LABELS } from "../../../base44/shared/weeklyCheckInDomain.js";

// Weekly Check-In v2 (docs/features/weekly-check-in-v2.md). Opening and
// closing this sheet never writes anything; only the three decision buttons do.

const NUMBER = new Intl.NumberFormat("en-US");

function fmt(value) {
  return typeof value === "number" ? NUMBER.format(value) : "—";
}

function pct(value) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "Not logged";
}

function fmtDate(key) {
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? key : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function sentence(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function signed(value, unit) {
  if (typeof value !== "number") return "";
  if (value === 0) return " (no change)";
  return ` (${value > 0 ? "+" : "−"}${NUMBER.format(Math.abs(value))}${unit === "steps" ? "" : ` ${unit}`})`;
}

/** The apply button names its exact effect, e.g. "Apply 1,950 calorie target". */
export function applyLabel(proposal) {
  const calories = proposal.changes.find((change) => change.key === "calorie_target");
  if (calories) return `Apply ${fmt(calories.to)} calorie target`;
  const steps = proposal.changes.find((change) => change.key === "step_target");
  if (steps) return `Apply ${fmt(steps.to)} step target`;
  if (proposal.changes.length) return "Apply new targets";
  return "Apply new weekly focus";
}

const CONFIDENCE_COPY = {
  high: "High",
  medium: "Medium",
  low: "Low"
};

const DECISION_COPY = {
  applied: "Applied. Your new targets start today.",
  declined: "Recorded. Your current targets stay as they are.",
  acknowledged: "Recorded. Nothing needed to change this week."
};

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function ChangeList({ changes, focusFrom, focusTo, focusChanged }) {
  if (!changes.length && !focusChanged) return null;
  return (
    <ul className="space-y-1 text-sm">
      {changes.map((change) => (
        <li key={change.key}>
          {change.label}: {fmt(change.from)} → <strong>{fmt(change.to)}</strong> {change.unit}
          {signed(change.delta, change.unit)}
        </li>
      ))}
      {focusChanged && (
        <li>
          Weekly focus: <strong>{focusTo}</strong>
          {focusFrom ? <span className="text-muted-foreground"> (was: {focusFrom})</span> : null}
        </li>
      )}
    </ul>
  );
}

function changesFromRecord(record) {
  const previous = record.previous_targets ?? {};
  const next = record.targets_for_next_week ?? {};
  return Object.entries(TARGET_LABELS)
    .filter(([key]) => typeof next[key] === "number" && next[key] !== previous[key])
    .map(([key, { label, unit }]) => ({
      key,
      label,
      unit,
      from: previous[key],
      to: next[key],
      delta: typeof previous[key] === "number" ? next[key] - previous[key] : null
    }));
}

function Confirmation({ record, onHistory }) {
  const applied = record.status === "applied";
  const changes = applied ? changesFromRecord(record) : [];
  const focusChanged =
    applied && (record.targets_for_next_week?.behavior_focus ?? "") !== (record.previous_targets?.behavior_focus ?? "");
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
        <p className="text-sm font-medium">{DECISION_COPY[record.status] ?? "Recorded."}</p>
      </div>
      <ChangeList
        changes={changes}
        focusChanged={focusChanged}
        focusFrom={record.previous_targets?.behavior_focus}
        focusTo={record.targets_for_next_week?.behavior_focus}
      />
      <p className="text-xs text-muted-foreground">
        Recommendation was: {decisionLabel(record.recommendation_decision)}. Next review: {fmtDate(shiftDateKey(record.end_date, 7))}.
      </p>
      <Button type="button" variant="outline" className="min-h-11 w-full" onClick={onHistory}>
        View decision history
      </Button>
    </div>
  );
}

function notUsed(metrics) {
  const notes = [];
  if (metrics.waist_label === "unavailable") notes.push("Waist: not measured in both weeks, so it was not used.");
  if (metrics.recovery_label === "unknown") notes.push("Recovery: sleep, energy and soreness were not logged.");
  if (metrics.avg_weight_current === null || metrics.avg_weight_previous === null) {
    notes.push("Weight trend: fewer than 3 weigh-ins in a week, so no weekly average.");
  }
  return notes;
}

function Review({ proposal }) {
  const m = proposal.supporting_metrics;
  const missing = notUsed(m);
  return (
    <div className="space-y-4">
      <section aria-labelledby="checkin-week" className="space-y-1.5">
        <h3 id="checkin-week" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your week</h3>
        <dl className="space-y-1">
          <Row
            label="7-day average weight"
            value={
              m.avg_weight_current === null
                ? "Not enough weigh-ins"
                : `${fmt(m.avg_weight_current)} lb${m.weight_change_lbs === null ? "" : signed(m.weight_change_lbs, "lb")}`
            }
          />
          {m.waist_label !== "unavailable" && <Row label="Waist" value={m.waist_label === "down" ? "Down" : m.waist_label === "up" ? "Up" : "Flat"} />}
          <Row label="Calories on target" value={pct(m.calorie_adherence)} />
          <Row label="Protein" value={pct(m.protein_adherence)} />
          <Row label="Steps" value={pct(m.step_adherence)} />
          <Row label="Workouts" value={pct(m.workout_adherence)} />
          {m.sleep_average !== null && <Row label="Sleep" value={`${m.sleep_average} h average`} />}
        </dl>
      </section>

      <section aria-labelledby="checkin-confidence" className="space-y-1">
        <h3 id="checkin-confidence" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Confidence: {CONFIDENCE_COPY[proposal.confidence]}
        </h3>
        <p className="text-xs text-muted-foreground">
          {m.days_logged} of the last 14 days logged · {m.missing_days_current} {m.missing_days_current === 1 ? "day" : "days"} missing this week ·{" "}
          {m.weigh_ins_current} weigh-ins this week, {m.weigh_ins_previous} last week.
        </p>
        {missing.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {missing.map((note) => <li key={note}>{note}</li>)}
          </ul>
        )}
      </section>

      {proposal.safety_flag && (
        <div className="flex items-start gap-2 rounded-md bg-questComplete p-2 text-xs text-gold" role="note">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>A safety flag is on your profile, so RecompOne won&apos;t change your targets. Please check your plan with a doctor or registered dietitian.</span>
        </div>
      )}
      {proposal.insufficient_data && (
        <div className="flex items-start gap-2 rounded-md bg-panel2 p-2 text-xs" role="note">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Log at least 14 days, with 3 or more weigh-ins a week, before RecompOne changes your targets.</span>
        </div>
      )}

      <section aria-labelledby="checkin-proposal" className="space-y-2 border-t border-line pt-3">
        <h3 id="checkin-proposal" className="flex items-center gap-2 text-sm font-medium">
          <Shield className="h-4 w-4 text-teal" aria-hidden="true" />
          {sentence(decisionLabel(proposal.decision))}
        </h3>
        <p className="text-sm text-muted-foreground">{proposal.reason}</p>
        {proposal.has_changes ? (
          <ChangeList
            changes={proposal.changes}
            focusChanged={proposal.focus_changed}
            focusFrom={proposal.previous_targets.behavior_focus}
            focusTo={proposal.targets_for_next_week.behavior_focus}
          />
        ) : (
          <p className="text-sm">No target changes this week.</p>
        )}
        {proposal.manual && proposal.has_changes && (
          <p className="rounded-md bg-questComplete p-2 text-xs text-gold">
            Manual targets are on, so this is advice only. Your numbers won&apos;t change unless you edit them in Custom targets.
          </p>
        )}
      </section>
    </div>
  );
}

export default function WeeklyCheckInReview({ open, onOpenChange, returnFocusRef }) {
  const { prepareCheckIn, decideCheckIn } = useRecomp();
  const navigate = useNavigate();
  const headingRef = useRef(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Prepared once per opening so the proposal doesn't shift under the user
  // while they read it (a decision refreshes it from the server if needed).
  const prepareRef = useRef(prepareCheckIn);
  prepareRef.current = prepareCheckIn;
  useEffect(() => {
    setStatus("");
    setError("");
    setState(open ? prepareRef.current() : null);
  }, [open]);

  const decide = async (decision) => {
    if (!state?.proposal || busy) return;
    setBusy(decision);
    setError("");
    setStatus("Saving your decision…");
    try {
      const result = await decideCheckIn(decision, state.proposal);
      if (result?.conflict) {
        setState({ proposal: result.proposal, recorded: null });
        setStatus("Your latest data changed this check-in. Review it again before deciding.");
        return;
      }
      triggerHaptic(HAPTIC_TRIGGERS.WEEKLY_CHECK_IN_SUBMITTED);
      setState({ proposal: state.proposal, recorded: result.checkIn });
      setStatus(DECISION_COPY[result.checkIn?.status] ?? "Recorded.");
      if (decision === "customize") {
        onOpenChange(false);
        navigate("/nutrition?panel=targets");
      }
    } catch (failure) {
      const message = failure?.response?.data?.error;
      setStatus("");
      setError(typeof message === "string" && message ? message : "Your decision couldn't be saved. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const proposal = state?.proposal;
  const recorded = state?.recorded;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90vh] max-w-md space-y-4 overflow-y-auto rounded-t-xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          headingRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          const trigger = returnFocusRef?.current;
          if (trigger?.isConnected) {
            event.preventDefault();
            trigger.focus();
          }
        }}
      >
        <SheetHeader>
          <SheetTitle ref={headingRef} tabIndex={-1} className="outline-none">Weekly check-in</SheetTitle>
          <SheetDescription>
            {proposal ? `Review of ${fmtDate(proposal.start_date)} – ${fmtDate(proposal.end_date)}` : "Loading your history…"}
          </SheetDescription>
        </SheetHeader>

        <p className="sr-only" role="status" aria-live="polite">{status}</p>

        {recorded ? (
          <Confirmation
            record={recorded}
            onHistory={() => {
              onOpenChange(false);
              navigate("/more/decisions");
            }}
          />
        ) : proposal ? (
          <>
            <Review proposal={proposal} />
            {error && (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            )}
            <div className="space-y-2">
              {proposal.applicable && (
                <Button type="button" className="min-h-11 w-full" disabled={Boolean(busy)} onClick={() => decide("apply")}>
                  {busy === "apply" ? "Applying…" : applyLabel(proposal)}
                </Button>
              )}
              <Button
                type="button"
                variant={proposal.applicable ? "outline" : "default"}
                className="min-h-11 w-full"
                disabled={Boolean(busy)}
                onClick={() => decide("keep_current")}
              >
                {busy === "keep_current" ? "Saving…" : "Keep current plan"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full"
                disabled={Boolean(busy)}
                onClick={() => decide("customize")}
              >
                Review custom targets
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 w-full"
                disabled={Boolean(busy)}
                onClick={() => onOpenChange(false)}
              >
                Decide later
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Your history is still loading. Try again in a moment.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
