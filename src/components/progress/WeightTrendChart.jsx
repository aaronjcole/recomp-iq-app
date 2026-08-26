import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, parseISO } from "date-fns";
import { calculateMovingAverage } from "@/lib/fitness";

/**
 * Compact weight-trend chart with a 7-day moving average. Designed as the
 * weight panel of the Trends dashboard overview.
 */
export default function WeightTrendChart({ dedupedLogs, rangeDays = 35 }) {
  const data = useMemo(() => {
    const weights = dedupedLogs
      .filter((l) => typeof l.weight_lbs === "number")
      .map((l) => ({ date: l.date, weight: l.weight_lbs }));
    const ma = calculateMovingAverage(
      weights.map((w) => ({ date: w.date, value: w.weight })),
      7,
      { deduped: true }
    );
    const maByDate = new Map(ma.map((p) => [p.date, p.value]));
    let points = weights.map((w) => ({ date: w.date, weight: w.weight, ma: maByDate.get(w.date) ?? null }));
    if (rangeDays !== null) {
      const cutoff = daysAgoStr(rangeDays);
      points = points.filter((p) => p.date >= cutoff);
    }
    return points;
  }, [dedupedLogs, rangeDays]);

  if (data.length < 2) {
    return <EmptyHint text="Log a couple of weigh-ins to see your weight trend." />;
  }

  return (
    <div className="h-40 -ml-2" data-pull-to-refresh-ignore>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--lineSoft)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), "M/d")} stroke="var(--muted-foreground)" fontSize={10} tickLine={false} />
          <YAxis domain={["auto", "auto"]} stroke="var(--muted-foreground)" fontSize={10} tickLine={false} width={32} />
          <Tooltip
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(d) => format(parseISO(d), "MMM d")}
          />
          <Line type="monotone" dataKey="weight" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="Weight" />
          <Line type="monotone" dataKey="ma" stroke="var(--chart-2)" strokeWidth={2} dot={false} strokeDasharray="4 4" name="7-day avg" connectNulls />
        </LineChart>
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