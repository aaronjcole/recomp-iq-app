import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import LoggingDatePicker from "@/components/LoggingDatePicker";
import { useLoggingDate } from "@/lib/LoggingDateContext";
import { useRecomp } from "@/lib/RecompContext";
import { buildNutritionReport, NUTRITION_REPORT_METRICS, nutritionReportRange } from "@/lib/nutritionReport";
import { useNutritionReportData } from "@/lib/nutritionReportHook";

const MACROS = [
  { key: "protein_g", label: "Protein", color: "bg-teal" },
  { key: "carbs_g", label: "Carbs", color: "bg-blue" },
  { key: "fat_g", label: "Fat", color: "bg-gold" }
];
const number = (value) => value === null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
const shortDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function IncompleteNotice({ label, result }) {
  if (result.complete) return null;
  const reason = result.issue === "limit" ? "The report safety limit was reached."
    : result.issue === "error" ? "A request failed."
      : "The server returned inconsistent pages.";
  return <p>{label} incomplete: {reason} Loaded {number(result.records.length)} records; figures and coverage may be understated. Refresh to retry.</p>;
}

export default function NutritionReport() {
  const { selectedDate } = useLoggingDate();
  const { strategy } = useRecomp();
  const [days, setDays] = useState(7);
  const [contributorMetric, setContributorMetric] = useState("calories");
  const { data, loading, error, refresh } = useNutritionReportData(selectedDate, days);
  const range = nutritionReportRange(selectedDate, days);
  const report = useMemo(() => data ? buildNutritionReport({ dailyLogs: data.daily.records,
    foodEntries: data.foods.records, endDate: selectedDate, days, strategy }) : null, [data, selectedDate, days, strategy]);
  const metric = NUTRITION_REPORT_METRICS.find(({ key }) => key === contributorMetric);
  const partial = data && (!data.daily.complete || !data.foods.complete);
  const maxEnergy = report ? Math.max(1, ...report.byDay.map((day) => day.macroEnergy || 0)) : 1;

  return <section aria-labelledby="nutrition-report-heading" className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="nutrition-report-heading" className="text-lg font-semibold">Nutrition report</h2>
      <Button variant="outline" className="min-h-11 border-line" onClick={refresh} disabled={loading}>
        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
        Refresh report
      </Button>
    </div>
    <LoggingDatePicker />
    <div role="group" aria-label="Nutrition report range" className="flex gap-2">
      {[7, 30].map((count) => <Button key={count} variant={days === count ? "default" : "outline"}
        className="min-h-11 flex-1" aria-pressed={days === count} onClick={() => setDays(count)}>{count} days</Button>)}
    </div>
    <p className="text-sm text-muted-foreground">{shortDate(range.startDate)}–{shortDate(selectedDate)}, {selectedDate.slice(0, 4)} · ending on your selected date, inclusive.</p>
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading nutrition report…</p>}
    {error && <p role="alert" className="rounded-xl border border-line bg-panel p-4 text-sm">The report could not be loaded. Refresh to retry; missing data has not been counted as zero.</p>}
    {!loading && report && <>
      {partial && <div role="alert" className="space-y-2 rounded-xl border border-gold bg-panel p-4 text-sm">
        <p className="font-medium">Partial nutrition report</p>
        <IncompleteNotice label="Daily totals" result={data.daily} />
        <IncompleteNotice label="Itemized foods" result={data.foods} />
      </div>}
      <Card className="border-line bg-panel">
        <CardContent className="space-y-4 p-5">
          <h3 className="font-medium">Macro energy by day</h3>
          <p className="text-xs text-muted-foreground">Protein × 4 + carbs × 4 + fat × 9 kcal. This estimate can differ from logged calories. Bars require all three macros; missing days are not zero.</p>
          <div className="flex flex-wrap gap-4 text-xs" aria-label="Macro energy legend">
            {MACROS.map(({ key, label, color }) => <span key={key} className="flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}</span>)}
          </div>
          <p className="text-xs text-muted-foreground">Complete macro coverage: {report.macroCoverage}/{days} days{!data.daily.complete ? " (partial fetch)" : ""}.</p>
          <ul aria-label="Daily macro energy" className="space-y-2">
            {report.byDay.map((day) => <li key={day.date} className="grid grid-cols-[3.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-xs">
              <time dateTime={day.date} className="text-muted-foreground">{shortDate(day.date)}</time>
              {day.macroComplete ? <>
                <div role="img" aria-label={`${day.date}: protein ${number(day.energy.protein_g)} kcal, carbs ${number(day.energy.carbs_g)} kcal, fat ${number(day.energy.fat_g)} kcal. Total ${number(day.macroEnergy)} kcal.`}
                  className="flex h-5 overflow-hidden rounded bg-panel2">
                  {MACROS.map(({ key, color }) => <span key={key} className={`h-full ${color}`} style={{ width: `${day.energy[key] / maxEnergy * 100}%` }} />)}
                </div>
                <span className="text-right font-mono tabular-nums">{number(day.macroEnergy)}</span>
              </> : <>
                <div className="h-5 rounded border border-dashed border-line" aria-hidden="true" />
                <span className="text-right text-muted-foreground">{data.daily.complete ? "No data" : "Unknown"}</span>
              </>}
            </li>)}
          </ul>
          <p className="text-right text-xs text-muted-foreground">kcal · same scale for all days</p>
        </CardContent>
      </Card>
      <Card className="border-line bg-panel">
        <CardContent className="space-y-3 p-5">
          <h3 className="font-medium">Average vs current targets</h3>
          <p className="text-xs text-muted-foreground">Compared with your CURRENT strategy targets, not targets from the historical dates. Each average uses only days with that metric recorded. Coverage is not proof of a complete food diary.</p>
          <div className="overflow-x-auto" data-pull-to-refresh-ignore>
            <table className="w-full text-left text-xs sm:text-sm">
              <caption className="sr-only">Nutrition averages, current daily targets, and per-metric day coverage</caption>
              <thead className="text-muted-foreground"><tr>
                <th scope="col" className="py-2 pr-3 font-medium">Nutrient</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Average</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Current target</th>
                <th scope="col" className="py-2 pl-2 text-right font-medium">Coverage</th>
              </tr></thead>
              <tbody>{report.metrics.map((item) => <tr key={item.key} className="border-t border-line" data-testid={`nutrition-metric-${item.key}`}>
                <th scope="row" className="py-3 pr-3 font-medium">{item.label}</th>
                <td className="px-2 py-3 text-right font-mono tabular-nums">{number(item.average)}{item.average !== null ? ` ${item.unit}` : ""}</td>
                <td className="px-2 py-3 text-right">
                  <span className="font-mono tabular-nums">{item.target === null ? "Not set" : `${number(item.target)} ${item.unit}`}</span>
                  {item.percentOfTarget !== null && <span className="block text-xs text-muted-foreground">{number(item.percentOfTarget)}% of target</span>}
                </td>
                <td className="py-3 pl-2 text-right font-mono tabular-nums">{item.coverage}/{days}
                  {!(item.key === "fiber_g" ? data.foods.complete : data.daily.complete) && <span className="block text-xs text-muted-foreground">partial</span>}
                </td>
              </tr>)}</tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Calories and macros use daily totals without adding diary entries again. Fiber covers itemized foods only, on days when every loaded item has fiber recorded; it excludes unitemized meals. No fiber target is stored in your current strategy.</p>
          {report.duplicateDailyCount > 0 && <p className="text-xs text-muted-foreground">Duplicate daily records were resolved to the most recently updated record per date, not added together.</p>}
        </CardContent>
      </Card>
      <Card className="border-line bg-panel">
        <CardContent className="space-y-3 p-5">
          <h3 className="font-medium">Top itemized-food contributors</h3>
          <p className="text-xs text-muted-foreground">{number(report.itemizedCount)} itemized entries{!data.foods.complete ? " loaded (partial)" : " in this range"}. Manually entered daily totals cannot be attributed to individual foods. These rankings may not explain your daily totals.</p>
          <label className="flex flex-wrap items-center gap-2 text-sm" htmlFor="nutrition-contributor-metric">Rank by
            <select id="nutrition-contributor-metric" value={contributorMetric} onChange={(event) => setContributorMetric(event.target.value)}
              className="min-h-11 rounded-lg border border-line bg-panel2 px-3 text-sm text-foreground">
              {NUTRITION_REPORT_METRICS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          {report.contributors[contributorMetric].length ? <ol className="divide-y divide-line" aria-label={`Top foods by ${metric.label.toLowerCase()}`}>
            {report.contributors[contributorMetric].map((item) => <li key={item.name} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0"><p className="break-words font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.entries} {item.entries === 1 ? "entry" : "entries"}</p></div>
              <span className="shrink-0 font-mono tabular-nums">{number(item.total)} {metric.unit}</span>
            </li>)}
          </ol> : <p className="text-sm text-muted-foreground">No positive {metric.label.toLowerCase()} values in the loaded itemized foods. Missing values are not counted as zero.</p>}
        </CardContent>
      </Card>
    </>}
  </section>;
}
