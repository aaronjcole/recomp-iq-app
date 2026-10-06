import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileJson, FileSpreadsheet, LoaderCircle, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ChildTopBar from "@/components/ChildTopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExportDeliveryUnavailable, deliverExportFile, exportFileName } from "@/lib/dataExport";
import { PRIVACY_REQUEST_MAILTO, SUPPORT_EMAIL } from "@/lib/support";
import { recordsToCsv } from "../../base44/shared/accountExportDomain.js";

// Friendly names for the records an export contains, in display order. Any
// entity not listed still appears, under its own name.
/** @type {Array<[string, string]>} */
const ENTITY_LABELS = [
  ["DailyLog", "Daily logs"],
  ["FoodLogEntry", "Food diary entries"],
  ["FoodItem", "Saved foods"],
  ["MealTemplate", "Meal templates"],
  ["Recipe", "Recipes"],
  ["ExerciseSession", "Workouts"],
  ["StrengthLog", "Lift records"],
  ["TrainingBlock", "Training blocks"],
  ["Habit", "Habits"],
  ["HabitEntry", "Habit check-ins"],
  ["WeeklyCheckIn", "Weekly check-ins"],
  ["DecisionLedger", "Plan changes"],
  ["CurrentStrategy", "Targets"],
  ["UserProfile", "Profile"],
  ["UserPreferences", "Preferences"],
  ["LifestyleProfile", "Lifestyle profile"],
  ["CoachConversation", "Coach conversations"],
  ["AiContentReport", "AI response reports"],
  ["CoachRequestUsage", "Coach usage"],
  ["AnalysisUpload", "Photo analysis uploads"],
  ["PremiumEntitlement", "Premium purchases"],
  ["ReferralCode", "Referral code"],
  ["Referral", "Referrals"],
  ["PushDevice", "Notification devices"],
  ["WaitlistEntry", "Waitlist sign-up"]
];
const LABELS = new Map(ENTITY_LABELS);
const ORDER = new Map(ENTITY_LABELS.map(([entity], index) => [entity, index]));

function sortedEntities(counts) {
  return Object.keys(counts ?? {}).sort((a, b) => (ORDER.get(a) ?? 999) - (ORDER.get(b) ?? 999) || a.localeCompare(b));
}

export default function YourData() {
  const [exportData, setExportData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const loadExport = async () => {
    if (exportData) return exportData;
    const response = await base44.functions.invoke("exportAccountData", {});
    const data = response?.data ?? response;
    if (!data?.entities) throw new Error("The export was empty.");
    setExportData(data);
    return data;
  };

  const deliver = async (key, build) => {
    if (busy) return;
    setBusy(key);
    setError("");
    setStatus("Preparing your export…");
    try {
      const file = build(await loadExport());
      const outcome = await deliverExportFile(file);
      setStatus(outcome === "shared" ? `${file.name} is ready to save.` : `${file.name} downloaded.`);
    } catch (failure) {
      setStatus("");
      if (failure?.name === "AbortError") return; // the user closed the share sheet
      setError(
        failure instanceof ExportDeliveryUnavailable
          ? failure.message
          : failure?.response?.data?.error || "Your export couldn't be prepared. Check your connection and try again."
      );
    } finally {
      setBusy(null);
    }
  };

  const showStored = async () => {
    if (busy) return;
    setBusy("load");
    setError("");
    try {
      await loadExport();
      setStatus("Your stored records are listed below.");
    } catch (failure) {
      setError(failure?.response?.data?.error || "We couldn't load your data. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const downloadJson = () => deliver("json", (data) => ({
    name: exportFileName("export", "json"),
    text: `${JSON.stringify(data, null, 2)}\n`,
    type: "application/json"
  }));

  const downloadCsv = (entity) => deliver(`csv:${entity}`, (data) => ({
    name: exportFileName((LABELS.get(entity) ?? entity).toLowerCase().replace(/[^a-z0-9]+/g, "-"), "csv"),
    text: recordsToCsv(data.entities[entity] ?? []),
    type: "text/csv"
  }));

  const total = exportData ? Object.values(exportData.counts).reduce((sum, count) => sum + count, 0) : null;

  return (
    <div className="space-y-4">
      <ChildTopBar title="Your data" />
      <p className="sr-only" role="status" aria-live="polite">{status}</p>

      <Card className="border-line bg-panel">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-teal" aria-hidden="true" />
            <h2 className="font-medium">Download your data</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Everything RecompOne stores for your account, the same records account deletion removes. JSON has all of it;
            CSV opens in a spreadsheet, one table at a time.
          </p>
          <Button type="button" className="min-h-11 w-full" disabled={Boolean(busy)} onClick={downloadJson}>
            {busy === "json" ? <LoaderCircle className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <FileJson className="mr-1 h-4 w-4" aria-hidden="true" />}
            Download everything (JSON)
          </Button>
          {!exportData && (
            <Button type="button" variant="outline" className="min-h-11 w-full border-line" disabled={Boolean(busy)} onClick={showStored}>
              {busy === "load" ? "Loading…" : "Show what's stored"}
            </Button>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          {exportData && (
            <section aria-labelledby="your-data-records" className="space-y-1.5 border-t border-line pt-3">
              <h3 id="your-data-records" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {total} {total === 1 ? "record" : "records"} stored
              </h3>
              {exportData.truncated?.length > 0 && (
                <p className="text-xs text-gold">
                  Some tables are too large for one export ({exportData.truncated.join(", ")}). Email {SUPPORT_EMAIL} for a full copy.
                </p>
              )}
              <ul className="divide-y divide-lineSoft">
                {sortedEntities(exportData.counts).map((entity) => (
                  <li key={entity} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span>{LABELS.get(entity) ?? entity}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">{exportData.counts[entity]}</span>
                      {exportData.counts[entity] > 0 && (
                        <button
                          type="button"
                          onClick={() => downloadCsv(entity)}
                          disabled={Boolean(busy)}
                          className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs text-teal hover:bg-teal/10 disabled:opacity-50"
                          aria-label={`Download ${LABELS.get(entity) ?? entity} as CSV`}
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" /> CSV
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </CardContent>
      </Card>

      <Card className="border-line bg-panel">
        <CardContent className="space-y-2 p-5 text-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-teal" aria-hidden="true" />
            <h2 className="font-medium">Where it's kept, and for how long</h2>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Your records are stored in RecompOne's hosted database for as long as your account exists.</li>
            <li>Progress photos stay on this device only. They are not uploaded and are not in the export.</li>
            <li>Deleting your account removes every record listed above.</li>
            <li>
              Backups, photo-analysis files and how long deletion takes are covered in the{" "}
              <Link className="text-teal underline underline-offset-2" to="/privacy">Privacy Policy</Link>.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-line bg-panel">
        <CardContent className="space-y-3 p-5 text-sm">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-teal" aria-hidden="true" />
            <h2 className="font-medium">Privacy questions or requests</h2>
          </div>
          <p className="text-muted-foreground">
            For a correction, a question about how your data is used, or anything this page doesn't cover, email us from
            your account's address so we can verify it's you.
          </p>
          <Button asChild variant="outline" className="min-h-11 w-full border-line">
            <a href={PRIVACY_REQUEST_MAILTO}>Email a privacy request</a>
          </Button>
          <Button asChild variant="ghost" className="min-h-11 w-full text-destructive">
            <Link to="/more/profile"><Trash2 className="mr-1 h-4 w-4" aria-hidden="true" /> Delete your account (in Profile)</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
