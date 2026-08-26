import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { format, parseISO } from "date-fns";

/**
 * Compact calorie-adherence chart. Plots daily calories against the target
 * line so you can see consistency over time. Bars under target are teal; bars
 * over target are gold to flag overshoot days.
 */
export default function CalorieAdherenceChart({ dedupedLogs, calorieTarget, rangeDays = 35 }) {
  const data = useMemo(() => {
    let points = dedupedLogs
      .filter((l) => typeof l.calories === "number")
      .map((l) => ({ date: l.date, calories: l.calories }));
    if (rangeDays !== null) {
      const cutoff = daysAgoStr(rangeDays);
      points = points.filter((p) => p.date >= cutoff);
    }
    return points;
  }, [dedupedLogs, rangeDays]);

  if (data.length < 1 || !calorieTarget) {
    return <EmptyHint text="Log calories for a few days to see your adherence trend." />;
  }

  return (
    <div className="h-40 -ml-2" data-pull-to-refresh-ignore>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--lineSoft)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), "M/d")} stroke="var(--muted-foreground)" fontSize={10} tickLine={false} />
          <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} width={32} />
          <Tooltip
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(d) => format(parseISO(d), "MMM d")}
            formatter={(v) => [`${v} kcal`, "Calories"]}
          />
          <ReferenceLine y={calorieTarget} stroke="var(--chart-2)" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: "target", fontSize: 9, fill: "var(--muted-foreground)", position: "insideTopRight" }} />
          <Bar dataKey="calories" radius={[3, 3, 0, 0]}>
            {data.map((p, i) => (
              <Cell key={i} fill={p.calories > calorieTarget ? "var(--chart-4)" : "var(--chart-1)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function EmptyHint({ text }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-lineSoft bg-panel2/40 px-4 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}