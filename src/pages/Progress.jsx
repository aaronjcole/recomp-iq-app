import { useMemo, useState } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { calculateInitialStrategy, generateWeightProjection, calculateMovingAverage } from "@/lib/fitness";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, parseISO } from "date-fns";
import { Scale } from "lucide-react";
import ProgressPhotos from "@/components/progress/ProgressPhotos";
import BodyCompositionScan from "@/components/progress/BodyCompositionScan";
import PullToRefresh from "@/components/common/PullToRefresh";
import { featureFlags } from "@/lib/featureFlags";

const pct = (v) => (v === null || v === undefined ? "—" : Math.round(v * 100) + "%");
const RANGES = [
  { value: "35d", label: "35d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" }
];

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export default function Progress() {
  const { profile, strategy, logs, trend, reload } = useRecomp();
  const [range, setRange] = useState("35d");

  const chartData = useMemo(() => {
    const weights = logs
      .filter((l) => typeof l.weight_lbs === "number")
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((l) => ({ date: l.date, weight: l.weight_lbs }));
    const ma = calculateMovingAverage(
      weights.map((w) => ({ date: w.date, value: w.weight })),
      7
    );
    return weights.map((w) => ({ ...w, ma: ma.find((m) => m.date === w.date)?.value ?? null }));
  }, [logs]);

  const rangeDays = range === "all" ? null : range === "90d" ? 90 : 35;
  const visibleData = useMemo(
    () => (rangeDays === null ? chartData : chartData.filter((w) => w.date >= daysAgoStr(rangeDays))),
    [chartData, rangeDays]
  );

  const tdee = useMemo(() => (profile ? calculateInitialStrategy(profile).tdee_estimate : null), [profile]);
  const projection = useMemo(
    () =>
      profile && strategy
        ? generateWeightProjection({
            logs,
            mode: "current_plan",
            weeks: 12,
            calorieTarget: strategy.calorie_target,
            tdee,
            goalWeight: profile.goal_weight_lbs,
            currentWeight: profile.current_weight_lbs
          })
        : null,
    [profile, strategy, logs, tdee]
  );

  if (!profile || !strategy) return null;

  return (
    <PullToRefresh onRefresh={reload}>
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Progress</h1>

      <Card className="bg-panel border-line">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">Weight trend</div>
            <div className="flex gap-1">
              {RANGES.map(({ value, label }) => (
                <Button
                  key={value}
                  size="sm"
                  variant={range === value ? "default" : "outline"}
                  aria-pressed={range === value}
                  className={range === value ? "bg-teal text-buttonText hover:opacity-90 h-11 px-3 text-xs" : "border-line h-11 px-3 text-xs"}
                  onClick={() => setRange(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          {visibleData.length < 2 ? (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-lineSoft bg-panel2/40 px-6 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-teal/15 text-teal">
                <Scale className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="font-medium">
                {visibleData.length === 0 ? "Log a weigh-in" : "One more weigh-in reveals your trend"}
              </div>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                {visibleData.length === 0
                  ? "Add a weight from Today to start the chart."
                  : "A second point in this range is needed before a trend line is meaningful."}
              </p>
            </div>
          ) : (
            <div className="h-56 -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={visibleData} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--lineSoft)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), "M/d")} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                  <YAxis domain={["auto", "auto"]} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} width={36} />
                  <Tooltip
                    contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
                    labelFormatter={(d) => format(parseISO(d), "MMM d")}
                  />
                  <Line type="monotone" dataKey="weight" stroke="var(--teal)" strokeWidth={2} dot={false} name="Weight" />
                  <Line type="monotone" dataKey="ma" stroke="var(--blue)" strokeWidth={2} dot={false} strokeDasharray="4 4" name="7-day avg" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {trend && (
        <Card className="bg-panel border-line">
          <CardContent className="p-5 space-y-2 text-sm">
            <div className="font-medium mb-1">Latest read</div>
            <Row label="7-day avg weight" value={trend.avg_weight_current_7_day !== null ? `${trend.avg_weight_current_7_day} lb` : "—"} />
            <Row label="Weekly change" value={trend.weight_change_lbs !== null ? `${trend.weight_change_lbs > 0 ? "+" : ""}${trend.weight_change_lbs} lb` : "—"} />
            <Row label="Waist change" value={trend.waist_change_in !== null ? `${trend.waist_change_in} in` : "—"} />
            <Row label="Calorie adherence" value={pct(trend.calorie_adherence)} />
            <Row label="Protein adherence" value={pct(trend.protein_adherence)} />
            <Row label="Step adherence" value={pct(trend.step_adherence)} />
            <Row label="Workout adherence" value={pct(trend.workout_adherence)} />
          </CardContent>
        </Card>
      )}

      {projection && (
        <Card className="bg-panel border-line">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">12-week projection</div>
              <Badge variant="outline" className="capitalize">{projection.confidence} confidence</Badge>
            </div>
            <div className="grid grid-cols-3 text-center">
              <Stat label="Low" value={projection.projected_low_end_weight} />
              <Stat label="Likely" value={projection.projected_median_end_weight} highlight />
              <Stat label="High" value={projection.projected_high_end_weight} />
            </div>
            <p className="text-xs text-muted-foreground">{projection.explanation}</p>
          </CardContent>
        </Card>
      )}

      {featureFlags.bodyCompositionScan && <BodyCompositionScan />}

      <ProgressPhotos />
    </div>
    </PullToRefresh>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Stat({ label, value, highlight = false }) {
  return (
    <div>
      <div className={`text-lg font-bold ${highlight ? "text-teal" : ""}`}>
        {value}<span className="ml-1 text-[10px] font-normal text-muted-foreground">lb</span>
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
