import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useRecomp } from "@/lib/RecompContext";
import {
  calculateInitialStrategy,
  dedupeLogsByDate,
  generateWeightProjection
} from "@/lib/fitness";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChartNoAxesCombined, Images, LayoutDashboard, ScanLine, Share2, Target } from "lucide-react";
import ProgressPhotos from "@/components/progress/ProgressPhotos";
import TrendsDashboard from "@/components/progress/TrendsDashboard";
import PremiumBadge from "@/components/premium/PremiumBadge";
import PullToRefresh from "@/components/common/PullToRefresh";
import { featureFlags } from "@/lib/featureFlags";
import { usePremiumAccess } from "@/lib/PremiumAccessContext";
import { PREMIUM_FEATURES } from "../../base44/shared/premiumDomain";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle
} from "@/components/ui/drawer";

const BodyCompositionScan = lazy(() => import("@/components/progress/BodyCompositionScan"));

const pct = (v) => (v === null || v === undefined ? "—" : Math.round(v * 100) + "%");
const EMPTY_LOGS = [];
const PROGRESS_SECTIONS = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "trends", label: "Trends", icon: ChartNoAxesCombined },
  { value: "photos", label: "Photos", icon: Images }
];

export default function Progress() {
  const { profile, strategy, logs, trend, reload } = useRecomp();
  const { canAccess, releaseFlags } = usePremiumAccess();
  const location = useLocation();
  const isActive = location.pathname.replace(/\/+$/, "") === "/progress";
  const [section, setSection] = useState("overview");
  const [showShare, setShowShare] = useState(false);
  const shareTriggerRef = useRef(null);
  const isOverviewActive = isActive && section === "overview";

  const dedupedLogs = useMemo(
    () => (isOverviewActive ? dedupeLogsByDate(logs) : EMPTY_LOGS),
    [isOverviewActive, logs]
  );

  const tdee = useMemo(() => (profile ? calculateInitialStrategy(profile).tdee_estimate : null), [profile]);
  const projection = useMemo(
    () =>
      isOverviewActive && profile && strategy
        ? generateWeightProjection({
            logs: dedupedLogs,
            logsAreDeduped: true,
            mode: "current_plan",
            weeks: 12,
            calorieTarget: strategy.calorie_target,
            tdee,
            goalWeight: profile.goal_weight_lbs,
            currentWeight: profile.current_weight_lbs
          })
        : null,
    [dedupedLogs, isOverviewActive, profile, strategy, tdee]
  );

  const handleSectionKeyDown = (event, index) => {
    let nextIndex = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % PROGRESS_SECTIONS.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + PROGRESS_SECTIONS.length) % PROGRESS_SECTIONS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = PROGRESS_SECTIONS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextSection = PROGRESS_SECTIONS[nextIndex].value;
    setSection(nextSection);
    document.getElementById(`progress-tab-${nextSection}`)?.focus();
  };

  if (!profile || !strategy) return (
    <div className="space-y-5">
      <div className="h-8 w-40 animate-pulse rounded-xl bg-panel2" />
      <div className="h-64 animate-pulse rounded-xl bg-panel2" />
      <div className="h-40 animate-pulse rounded-xl bg-panel2" />
      <div className="h-32 animate-pulse rounded-xl bg-panel2" />
    </div>
  );

  return (
    <PullToRefresh onRefresh={reload}>
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Progress</h1>

      <div
        role="tablist"
        aria-label="Progress sections"
        className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-panel p-1"
      >
        {PROGRESS_SECTIONS.map(({ value, label, icon: Icon }, index) => {
          const selected = section === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              id={`progress-tab-${value}`}
              aria-selected={selected}
              aria-controls={`progress-panel-${value}`}
              tabIndex={selected ? 0 : -1}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors ${
                selected ? "bg-teal text-buttonText shadow-sm" : "text-muted-foreground hover:bg-panel2 hover:text-foreground"
              }`}
              onClick={() => setSection(value)}
              onKeyDown={(event) => handleSectionKeyDown(event, index)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      {section === "overview" && (
        <div
          id="progress-panel-overview"
          role="tabpanel"
          aria-labelledby="progress-tab-overview"
          className="space-y-5"
        >
          <Card className="bg-panel border-line">
            <CardContent className="p-5 space-y-2 text-sm">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-medium">Latest read</h2>
                {trend && (
                  <Button
                    ref={shareTriggerRef}
                    variant="ghost"
                    size="sm"
                    className="h-11 px-3 text-teal hover:text-teal"
                    onClick={() => setShowShare(true)}
                  >
                    <Share2 className="w-4 h-4 mr-1" /> Share
                  </Button>
                )}
              </div>
              {trend ? (
                <>
                  <Row label="7-day avg weight" value={trend.avg_weight_current_7_day !== null ? `${trend.avg_weight_current_7_day} lb` : "—"} />
                  <Row label="Weekly change" value={trend.weight_change_lbs !== null ? `${trend.weight_change_lbs > 0 ? "+" : ""}${trend.weight_change_lbs} lb` : "—"} />
                  <Row label="Waist change" value={trend.waist_change_in !== null ? `${trend.waist_change_in} in` : "—"} />
                  <Row label="Calorie adherence" value={pct(trend.calorie_adherence)} />
                  <Row label="Protein adherence" value={pct(trend.protein_adherence)} />
                  <Row label="Step adherence" value={pct(trend.step_adherence)} />
                  <Row label="Workout adherence" value={pct(trend.workout_adherence)} />
                </>
              ) : (
                <p className="text-muted-foreground">Trend data unavailable — log a few more weigh-ins to unlock your trend read.</p>
              )}
            </CardContent>
          </Card>

          {trend && (
            <ShareCard
              trend={trend}
              open={showShare}
              onOpenChange={setShowShare}
              returnFocusRef={shareTriggerRef}
            />
          )}

          {projection && (
            <Card className="bg-panel border-line">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium">12-week projection</h2>
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
        </div>
      )}

      {section === "trends" && (
        <div
          id="progress-panel-trends"
          role="tabpanel"
          aria-labelledby="progress-tab-trends"
        >
          <TrendsDashboard />
        </div>
      )}

      {section === "photos" && (
        <div
          id="progress-panel-photos"
          role="tabpanel"
          aria-labelledby="progress-tab-photos"
          className="space-y-5"
        >
          {(featureFlags.bodyCompositionScan || releaseFlags.bodyCompositionScan) && canAccess(PREMIUM_FEATURES.VISUAL_PROGRESS) && (
            <Suspense fallback={<div className="h-16 animate-pulse rounded-xl bg-panel2" />}>
              <BodyCompositionScan />
            </Suspense>
          )}

          <Card className="border-line bg-panel">
            <CardContent className="flex gap-3 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/15 text-teal">
                <ScanLine className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">Visual Progress Check</h2>
                  <PremiumBadge />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Compare two private photos with an on-device reveal—no upload or body-fat estimate.
                </p>
                <Button asChild variant="outline" className="mt-3 w-full justify-between border-line">
                  <Link to="/progress/visual-check">Open visual check <ArrowRight aria-hidden="true" /></Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <ProgressPhotos />
        </div>
      )}
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
        {value}<span className="ml-1 text-xs font-normal text-muted-foreground">lb</span>
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ShareCard({ trend, open, onOpenChange, returnFocusRef }) {
  const isMobile = useIsMobile();
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const weeklyChange = trend.weight_change_lbs !== null
    ? `${trend.weight_change_lbs > 0 ? "+" : ""}${trend.weight_change_lbs} lb`
    : "—";

  const stats = [
    { label: "Weekly change", value: weeklyChange },
    { label: "Calorie adherence", value: pct(trend.calorie_adherence) },
    { label: "Protein adherence", value: pct(trend.protein_adherence) },
    { label: "Workout adherence", value: pct(trend.workout_adherence) }
  ];

  const handleShare = () => {
    const text = [
      "My RecompOne progress this week:",
      ...stats.map((s) => `${s.label}: ${s.value}`)
    ].join("\n");
    navigator.share({ title: "RecompOne Progress", text }).catch(() => {});
  };

  const restoreTriggerFocus = (event) => {
    event.preventDefault();
    returnFocusRef.current?.focus();
  };

  const content = (
    <div className="w-full overflow-hidden rounded-2xl shadow-2xl">
      <div className="bg-[#07110f] px-6 py-8 space-y-5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#2fc4a7] flex items-center justify-center">
            <Target className="w-4 h-4 text-[#07110f]" aria-hidden="true" />
          </div>
          <span className="font-semibold text-[#2fc4a7]">RecompOne</span>
        </div>
        <div className="space-y-2">
          {stats.map((stat) => (
            <div key={stat.label} className="flex justify-between">
              <span className="text-sm text-white/50">{stat.label}</span>
              <span className="text-sm font-semibold text-white">{stat.value}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/30 text-center">recompone.app</p>
      </div>
      <div className="bg-panel p-4 space-y-2">
        {canShare ? (
          <Button
            className="w-full bg-teal text-buttonText hover:opacity-90"
            onClick={handleShare}
          >
            <Share2 className="w-4 h-4 mr-2" aria-hidden="true" /> Share
          </Button>
        ) : (
          <p className="text-xs text-center text-muted-foreground">
            Screenshot the card above to share your progress
          </p>
        )}
        <Button variant="outline" className="w-full border-line" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
        <DrawerContent
          className="mx-auto max-w-sm border-0 bg-transparent px-4 pb-[max(2rem,env(safe-area-inset-bottom))]"
          onCloseAutoFocus={restoreTriggerFocus}
        >
          <DrawerHeader className="sr-only">
            <DrawerTitle>Share weekly progress</DrawerTitle>
            <DrawerDescription>Preview and share your latest weekly progress summary.</DrawerDescription>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xs gap-0 overflow-hidden border-0 bg-transparent p-0"
        onCloseAutoFocus={restoreTriggerFocus}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Share weekly progress</DialogTitle>
          <DialogDescription>Preview and share your latest weekly progress summary.</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
