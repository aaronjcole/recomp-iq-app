import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Dumbbell,
  Moon,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Utensils
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import ChildTopBar from "@/components/ChildTopBar";
import PremiumBadge from "@/components/premium/PremiumBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePremiumAccess } from "@/lib/PremiumAccessContext";
import { PREMIUM_FEATURES } from "../../base44/shared/premiumDomain";

const SIGNAL_ICONS = {
  nutrition: Utensils,
  training: Dumbbell,
  recovery: Moon,
  habits: CheckCircle2,
  progress: TrendingUp
};

const STATUS_STYLES = {
  on_track: "border-teal/30 bg-teal/10 text-teal",
  opportunity: "border-gold/30 bg-gold/10 text-gold",
  insufficient: "border-line bg-panel2 text-muted-foreground"
};

function todayString() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function shortDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function readable(value) {
  return String(value ?? "").replaceAll("_", " ");
}

function errorMessage(error) {
  return error?.response?.data?.error
    ?? error?.data?.error
    ?? error?.message
    ?? "Weekly Autopilot could not run right now.";
}

export default function WeeklyAutopilot() {
  const { canAccess, isLoading: accessLoading } = usePremiumAccess();
  const allowed = canAccess(PREMIUM_FEATURES.WEEKLY_AUTOPILOT);
  const weekEnd = useMemo(todayString, []);
  const [review, setReview] = useState(() => {
    try {
      const stored = localStorage.getItem("recompiq_autopilot_v1");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.scorecard) && parsed.primaryAction) {
          return parsed;
        }
      }
    } catch {
      // ignore parse errors
    }
    return null;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    setIsGenerating(true);
    setError("");
    setReview(null);
    try {
      const result = await base44.functions.invoke("generateWeeklyAutopilot", { weekEnd });
      const nextReview = result?.data ?? result;
      if (!nextReview || !Array.isArray(nextReview.scorecard) || !nextReview.primaryAction) {
        throw new Error("Weekly Autopilot returned an incomplete review.");
      }
      setReview(nextReview);
      try { localStorage.setItem("recompiq_autopilot_v1", JSON.stringify(nextReview)); } catch {}
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <ChildTopBar title="Weekly Autopilot" fallbackTo="/today" />

      <Card className="border-line bg-panel">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal/15 text-teal">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <PremiumBadge />
          </div>
          <div>
            <h2 className="font-semibold">Five signals. One next move.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review your last seven days across nutrition, training, recovery, habits, and progress—then act on the clearest constraint.
            </p>
          </div>

          {!accessLoading && !allowed && (
            <div className="space-y-3 rounded-lg border border-lineSoft bg-panel2 p-4">
              <p className="text-sm text-muted-foreground">
                This feature is visible during testing and requires verified Premium access.
              </p>
              <Button asChild variant="outline" className="w-full border-line">
                <Link to="/more/premium">Review Premium access</Link>
              </Button>
            </div>
          )}

          {allowed && (
            <Button
              className="w-full bg-teal text-buttonText hover:opacity-90"
              onClick={generate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <><RefreshCw className="animate-spin" aria-hidden="true" /> Reviewing your week…</>
              ) : review ? (
                <><RefreshCw aria-hidden="true" /> Refresh weekly review</>
              ) : (
                <><Sparkles aria-hidden="true" /> Run weekly review</>
              )}
            </Button>
          )}

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </CardContent>
      </Card>

      {review && (
        <>
          <Card className="border-teal/30 bg-teal/10">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="outline" className="border-teal/30 capitalize text-teal">
                  {review.confidence.level} confidence
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {shortDate(review.weekStart)}–{shortDate(review.weekEnd)}
                </span>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-teal">Your one move</p>
                <h2 className="mt-1 text-xl font-semibold">{review.primaryAction.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{review.primaryAction.detail}</p>
              </div>
              <Button asChild className="w-full bg-teal text-buttonText hover:opacity-90">
                <Link to={review.primaryAction.route}>Take this step <ArrowRight aria-hidden="true" /></Link>
              </Button>
              <p className="text-xs text-muted-foreground">{review.confidence.detail}</p>
            </CardContent>
          </Card>

          <section className="space-y-3" aria-labelledby="weekly-scorecard">
            <div className="flex items-center justify-between gap-2">
              <h2 id="weekly-scorecard" className="font-semibold">Weekly scorecard</h2>
              <span className="text-xs text-muted-foreground">Saved locally</span>
            </div>
            {review.scorecard.map((signal) => {
              const Icon = SIGNAL_ICONS[signal.key] ?? CheckCircle2;
              return (
                <Card key={signal.key} className="border-line bg-panel">
                  <CardContent className="flex gap-3 p-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-panel2 text-teal">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-medium">{signal.label}</h3>
                        <Badge variant="outline" className={`capitalize ${STATUS_STYLES[signal.status] ?? STATUS_STYLES.insufficient}`}>
                          {readable(signal.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 font-medium">{signal.value}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{signal.detail}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <Card className="border-line bg-panel">
            <CardContent className="space-y-4 p-5">
              <h2 className="font-semibold">How the adaptive tools respond</h2>
              <div className="rounded-lg bg-panel2 p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">Meal plan</h3>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/nutrition/meal-plan" aria-label="Open adaptive meal plan"><ArrowRight aria-hidden="true" /></Link>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{review.mealPlanImpact}</p>
              </div>
              <div className="rounded-lg bg-panel2 p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">Training block</h3>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/training/plan" aria-label="Open adaptive training block"><ArrowRight aria-hidden="true" /></Link>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{review.trainingBlockImpact}</p>
              </div>
            </CardContent>
          </Card>

          {review.supportingActions.length > 0 && (
            <Card className="border-line bg-panel">
              <CardContent className="space-y-2 p-5">
                <h2 className="font-semibold">Also worth doing</h2>
                {review.supportingActions.map((action) => (
                  <Button key={action.key} asChild variant="outline" className="w-full justify-between border-line">
                    <Link to={action.route}>{action.title} <ArrowRight aria-hidden="true" /></Link>
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          <p className="px-1 text-xs text-muted-foreground">{review.notice}</p>
        </>
      )}
    </div>
  );
}
