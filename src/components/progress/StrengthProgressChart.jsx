import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { format, parseISO } from "date-fns";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const MAX_LIFTS = 5;

/**
 * Compact strength-progress chart. Plots estimated 1RM over time, one line
 * per lift (up to 5). Only lifts with at least 2 logged sessions are shown.
 */
export default function StrengthProgressChart({ strengthLogs }) {
  const { data, lifts } = useMemo(() => {
    const byLift = new Map();
    for (const log of strengthLogs ?? []) {
      if (!log?.lift_name || typeof log.estimated_1rm !== "number") continue;
      if (!byLift.has(log.lift_name)) byLift.set(log.lift_name, []);
      byLift.get(log.lift_name).push(log);
    }
    const candidates = [...byLift.entries()]
      .map(([name, logs]) => ({ name, logs: logs.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))) }))
      .filter((l) => l.logs.length >= 2)
      .sort((a, b) => b.logs.length - a.logs.length)
      .slice(0, MAX_LIFTS);

    const dateMap = new Map();
    for (const { name, logs } of candidates) {
      for (const log of logs) {
        if (!dateMap.has(log.date)) dateMap.set(log.date, { date: log.date });
        dateMap.get(log.date)[name] = log.estimated_1rm;
      }
    }
    const sorted = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    return { data: sorted, lifts: candidates.map((c) => c.name) };
  }, [strengthLogs]);

  if (lifts.length === 0) {
    return <EmptyHint text="Log strength sets with weight and reps to track your lifts." />;
  }

  return (
    <div className="h-44 -ml-2" data-pull-to-refresh-ignore>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--lineSoft)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), "M/d")} stroke="var(--muted-foreground)" fontSize={10} tickLine={false} />
          <YAxis domain={["auto", "auto"]} stroke="var(--muted-foreground)" fontSize={10} tickLine={false} width={32} />
          <Tooltip
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(d) => format(parseISO(d), "MMM d")}
            formatter={(v) => [`${v} lb`, "e1RM"]}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {lifts.map((name, i) => (
            <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function EmptyHint({ text }) {
  return (
    <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-lineSoft bg-panel2/40 px-4 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}