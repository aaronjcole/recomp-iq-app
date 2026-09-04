import { Link } from "react-router-dom";
import { ArrowRight, Bot, CalendarDays, Dumbbell, ScanLine, Sparkles } from "lucide-react";
import ChildTopBar from "@/components/ChildTopBar";
import PremiumBadge from "@/components/premium/PremiumBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePremiumAccess } from "@/lib/PremiumAccessContext";
import { PREMIUM_FEATURES } from "../../base44/shared/premiumDomain";
import { featureFlags } from "@/lib/featureFlags";
import { SUPPORT_REQUEST_MAILTO } from "@/lib/support";

const FEATURES = [
  {
    key: PREMIUM_FEATURES.MEAL_PLANNING,
    icon: CalendarDays,
    title: "Adaptive meal planning",
    actionLabel: "Open meal planner",
    description: "A weekly meal plan and grocery list shaped by your targets and recent progress.",
    to: "/nutrition/meal-plan",
    preview: [
      { value: "7 days", label: "Target-scaled meals" },
      { value: "1 list", label: "Consolidated groceries" }
    ]
  },
  {
    key: PREMIUM_FEATURES.TRAINING_PLANNING,
    icon: Dumbbell,
    title: "Adaptive training blocks",
    actionLabel: "Open training planner",
    description: "Four-to-six-week workout blocks that respond to your schedule, training history, and recovery.",
    to: "/training/plan",
    preview: [
      { value: "4–6 weeks", label: "Progressive block" },
      { value: "Final week", label: "Planned deload" }
    ]
  },
  {
    key: PREMIUM_FEATURES.WEEKLY_AUTOPILOT,
    icon: Sparkles,
    title: "Weekly Autopilot Review",
    actionLabel: "Open Weekly Autopilot",
    description: "One clear weekly review connecting your nutrition, training, habits, and progress signals.",
    to: "/today/autopilot",
    preview: [
      { value: "5 signals", label: "Weekly scorecard" },
      { value: "1 move", label: "Prioritized action" }
    ]
  },
  {
    key: PREMIUM_FEATURES.VISUAL_PROGRESS,
    icon: ScanLine,
    title: "Visual progress tools",
    actionLabel: "Open visual progress tools",
    description: "Private, on-device comparisons plus an optional AI-assisted body-composition range—not a medical measurement.",
    to: "/progress?section=photos",
    preview: [
      { value: "On-device", label: "Private comparison" },
      { value: "Optional", label: "AI-assisted range" }
    ]
  },
  {
    key: PREMIUM_FEATURES.AI_LIFESTYLE_COACH,
    icon: Bot,
    title: "Lifestyle coach",
    actionLabel: "Open Lifestyle coach",
    description: "A conversational coach that draws on your logs, habits, and progress to give context-aware guidance.",
    to: featureFlags.lifestyleCoach ? "/more/coach/lifestyle" : null,
    preview: [
      { value: "Your logs", label: "Context-aware guidance" },
      { value: "Guarded", label: "Educational scope" }
    ]
  }
];

export default function Premium() {
  const { canAccess, testerAccess, isLoading, isUnavailable } = usePremiumAccess();

  return (
    <div className="space-y-5">
      <ChildTopBar title="Premium features" />

      <Card className="border-line bg-panel">
        <CardContent className="space-y-3 p-5">
          <PremiumBadge label={testerAccess ? "Premium tester" : "Premium"} />
          <h2 className="text-xl font-semibold">
            {testerAccess ? "Testing access enabled" : "Your adaptive toolkit"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {testerAccess
              ? "Your account is authorized to test Premium features as they roll out."
              : "Premium features are visible during testing and will require verified access at launch."}
          </p>
          {isLoading && <p className="text-xs text-muted-foreground">Checking access…</p>}
          {isUnavailable && (
            <p className="text-xs text-gold" role="status">
              Premium status is temporarily unavailable. Access remains locked until it can be verified.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3" aria-label="Premium feature catalog">
        {FEATURES.map(({ key, icon: Icon, title, actionLabel, description, to, preview }) => {
          const available = canAccess(key);
          return (
            <Card key={key} className="border-line bg-panel">
              <CardContent className="flex gap-3 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal/15 text-teal">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{title}</h2>
                    <PremiumBadge />
                  </div>
                  <p className="text-sm text-muted-foreground">{description}</p>
                  <div
                    role="group"
                    aria-label={`${title} preview`}
                    className="grid grid-cols-2 gap-2 pt-1"
                  >
                    {preview.map((item) => (
                      <div key={item.label} className="rounded-xl border border-lineSoft bg-panel2/50 px-3 py-2.5">
                        <p className="font-semibold text-foreground">{item.value}</p>
                        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{item.label}</p>
                      </div>
                    ))}
                  </div>
                  <p className={`text-xs font-medium ${available ? "text-teal" : "text-muted-foreground"}`}>
                    {available && to ? "Access granted · available now" : available ? "Access granted · rollout in progress" : "Available to approved testers — contact us to request access"}
                  </p>
                  {available && to && (
                    <Button asChild variant="outline" size="sm" className="mt-2 w-full border-line">
                      <Link to={to}>{actionLabel} <ArrowRight aria-hidden="true" /></Link>
                    </Button>
                  )}
                  {!available && (
                    <Button asChild variant="outline" size="sm" className="mt-2 w-full border-line">
                      <a href={SUPPORT_REQUEST_MAILTO}>Request {title} access <ArrowRight aria-hidden="true" /></a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
