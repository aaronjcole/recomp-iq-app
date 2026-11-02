// Deterministic selected-day facts. Never substitute another day's last log.
export function canonicalCoachLogs(logs, endDate = undefined) {
  const rows = [...(logs ?? [])].filter((row) => typeof row?.date === "string" && (!endDate || row.date <= endDate))
    .sort((a, b) => String(a.updated_date ?? a.created_date ?? "").localeCompare(String(b.updated_date ?? b.created_date ?? "")));
  const days = new Map();
  for (const row of rows) days.set(row.date, { ...(days.get(row.date) ?? {}), ...row });
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}
export function coachDayFacts(logs, strategy, referenceDate) {
  const log = canonicalCoachLogs(logs, referenceDate).find((row) => row.date === referenceDate) ?? null;
  const finite = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
  const metric = (field, targetField) => {
    const consumed = finite(log?.[field]);
    const target = finite(strategy?.[targetField]);
    return { consumed, current_target: target, remaining: consumed != null && target != null ? Math.round((target - consumed) * 10) / 10 : null };
  };
  return { reference_date: referenceDate, target_basis: "current targets (not historical target snapshots)", calories: metric("calories", "calorie_target"), protein: metric("protein_g", "protein_target_g"), recorded: Boolean(log) };
}
