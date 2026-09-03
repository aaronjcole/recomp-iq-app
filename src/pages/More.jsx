import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRecomp } from "@/lib/RecompContext";
import { useAuth } from "@/lib/AuthContext";
import { useTheme } from "@/lib/useTheme";
import { GOAL_LABELS } from "@/lib/fitness";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import {
  MessageCircle, RefreshCw, Target, SlidersHorizontal, BookMarked, ShoppingCart,
  Camera, CheckCircle, Moon, Sun, LogOut, User, Crown, Gift,
  ChevronRight, Loader2, ShieldCheck, FileText, History, LifeBuoy, Trash2, BrainCircuit
} from "lucide-react";
import CheckInSheet from "@/components/more/CheckInSheet";
import { SUPPORT_EMAIL } from "@/lib/support";
import { HAPTIC_TRIGGERS, triggerHaptic } from "@/lib/haptics";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";

const APP_VERSION = "0.1.0";
const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" }
];

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const [y, m, d] = dateStr.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  return (Date.now() - then.getTime()) / 86400000;
}

function initialsFrom(name, email) {
  if (name && name !== "—") {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "—";
}

function sectionHeadingId(title) {
  return `more-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-heading`;
}

function Row({ item, first, onActivate, theme, themePreference, onThemeChange, loading }) {
  const Icon = item.icon;
  const label = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.label}</span>
        {item.subtitle && <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>}
      </span>
    </>
  );

  if (item.control === "theme") {
    return (
      <div
        className={`flex min-h-11 w-full items-center gap-3 px-3 py-3 text-left ${first ? "" : "border-t border-lineSoft"}`}
      >
        <Icon className="h-4 w-4 shrink-0 text-teal" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <label htmlFor="appearance-theme" className="block truncate text-sm font-medium">Appearance</label>
          <span className="block truncate text-xs text-muted-foreground">
            {themePreference === "system" ? "Matches your device" : `Using ${theme} mode`}
          </span>
        </span>
        <AdaptiveSelect
          id="appearance-theme"
          value={themePreference}
          onValueChange={onThemeChange}
          options={THEME_OPTIONS}
          drawerTitle="Appearance"
          drawerDescription="Choose whether RecompOne follows your device or uses a fixed theme."
          triggerClassName="w-28 shrink-0 border-0 bg-transparent px-2 shadow-none"
        />
      </div>
    );
  }

  return (
    <div className={`flex w-full items-center gap-3 px-3 py-3 ${first ? "" : "border-t border-lineSoft"}`}>
      <button type="button" onClick={onActivate} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
        {label}
      </button>
      {item.badge && (
        <span className="rounded bg-questComplete text-gold px-1.5 py-0.5 text-label font-mono uppercase tracking-wide">
          {item.badge}
        </span>
      )}
      {loading ? (
        <Loader2 className="w-4 h-4 text-teal shrink-0 animate-spin" />
      ) : (
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      )}
    </div>
  );
}

export default function More() {
  const { profile, strategy, recompLevel, signal, runCheckIn, checkIns, reload, mealTemplates } = useRecomp();
  const { user } = useAuth();
  const { theme, preference: themePreference, setTheme } = useTheme();
  const navigate = useNavigate();

  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinResult, setCheckinResult] = useState(null);
  const [running, setRunning] = useState(false);

  const lastCheckIn = checkIns[0];
  const checkinDue = !lastCheckIn || daysSince(lastCheckIn.end_date) >= 6;

  const goalLabel =
    (profile && GOAL_LABELS[profile.goal]?.label) ||
    (strategy && GOAL_LABELS[strategy.goal_type]?.label) ||
    "—";
  const level = recompLevel ? recompLevel.level : "—";
  const levelTitle = recompLevel ? recompLevel.title : "";
  const signalScore = signal ? signal.score : null;

  const fullName = user?.full_name || "—";
  const email = user?.email || "";
  const initials = initialsFrom(fullName, email);

  const runCheck = async () => {
    setRunning(true);
    try {
      const r = await runCheckIn();
      setCheckinResult(r);
      triggerHaptic(HAPTIC_TRIGGERS.WEEKLY_CHECK_IN_SUBMITTED);
      setCheckinOpen(true);
    } finally {
      setRunning(false);
    }
  };

  const handlers = {
    checkin: runCheck,
    reload: () => reload(),
    logout: () => base44.auth.logout(window.location.origin),
    support: () => navigate("/support"),
    deleteAccount: () => navigate("/delete-account"),
    privacy: () => navigate("/privacy"),
    terms: () => navigate("/terms")
  };

  const SECTIONS = [
    {
      title: "Coaching & plan",
      items: [
        { icon: Crown, label: "Premium features", to: "/more/premium", badge: "Premium" },
        { icon: Gift, label: "Refer friends", to: "/more/referrals", subtitle: "Earn free months" },
        { icon: MessageCircle, label: "Coach", to: "/more/coach" },
        { icon: BrainCircuit, label: "Lifestyle Coach", to: "/more/coach/lifestyle", badge: "Soon" },
        {
          icon: RefreshCw,
          label: "Weekly check-in",
          action: "checkin",
          badge: checkinDue ? "Due" : null,
          subtitle: running
            ? "Analyzing…"
            : lastCheckIn
            ? `Last ${lastCheckIn.end_date}`
            : "Run the adaptive engine"
        },
        { icon: Target, label: "Plan & projections", to: "/more/plan" },
        { icon: SlidersHorizontal, label: "Custom targets", to: "/nutrition?panel=targets" }
      ]
    },
    {
      title: "Nutrition tools",
      items: [
        { icon: BookMarked, label: "Meal templates", to: "/nutrition", state: { scrollTo: "meal-templates-section" }, subtitle: `${mealTemplates.length} saved` },
        { icon: ShoppingCart, label: "Grocery list", to: "/nutrition", state: { scrollTo: "grocery-list-section" } }
      ]
    },
    {
      title: "Progress & data",
      items: [
        { icon: Camera, label: "Progress photos", to: "/progress", subtitle: "On this device only" },
        { icon: History, label: "Decision history", to: "/more/decisions", subtitle: "Plan change log" }
      ]
    },
    {
      title: "Habits",
      items: [{ icon: CheckCircle, label: "Manage habits", to: "/today", state: { scrollTo: "habits-section" } }]
    },
    {
      title: "App & account",
      items: [
        { icon: User, label: "Profile & plan", to: "/more/profile" },
        { icon: theme === "dark" ? Moon : Sun, label: "Appearance", control: "theme" },
        { icon: RefreshCw, label: "Refresh data", action: "reload" },
        { icon: LogOut, label: "Log out", action: "logout" }
      ]
    },
    {
      title: "Legal",
      items: [
        { icon: LifeBuoy, label: "Support", action: "support", subtitle: SUPPORT_EMAIL },
        { icon: Trash2, label: "Account deletion", action: "deleteAccount" },
        { icon: ShieldCheck, label: "Privacy Policy", action: "privacy" },
        { icon: FileText, label: "Terms of Service", action: "terms" }
      ]
    }
  ];

  const handleItem = (item) => {
    if (item.to) navigate(item.to, item.state ? { state: item.state } : undefined);
    else if (item.action && handlers[item.action]) handlers[item.action]();
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">More</h1>

      {/* Identity header — status glance */}
      <Card className="bg-panel border-line">
        <CardContent className="p-4">
          <button className="flex w-full items-center gap-3" onClick={() => navigate("/more/profile")}>
            <div className="h-12 w-12 rounded-full bg-teal text-[#03110e] flex items-center justify-center font-semibold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="font-semibold truncate">{fullName}</div>
              <div className="text-xs text-muted-foreground truncate">{email}</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="rounded-full bg-panel2 text-muted-foreground px-2 py-0.5 text-label font-mono uppercase tracking-wide">
                  {goalLabel}
                </span>
                <span className="rounded-full bg-teal/15 text-teal px-2 py-0.5 text-label font-mono uppercase tracking-wide">
                  {level}
                </span>
                {signalScore != null && (
                  <span className="rounded-full bg-teal/15 text-teal px-2 py-0.5 text-label font-mono uppercase tracking-wide">
                    Signal {signalScore}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
          {levelTitle && <div className="text-xs text-muted-foreground mt-3 pl-1">{levelTitle}</div>}
        </CardContent>
      </Card>

      {SECTIONS.map((section) => {
        const headingId = sectionHeadingId(section.title);
        return (
          <section key={section.title} aria-labelledby={headingId}>
            <Card className="bg-panel border-line">
              <CardContent className="p-2">
                <h2 id={headingId} className="px-3 pt-2 pb-1 font-mono text-label uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h2>
                <ul>
                  {section.items.map((item, idx) => (
                    <li key={item.label}>
                      <Row
                        item={item}
                        first={idx === 0}
                        onActivate={() => handleItem(item)}
                        theme={theme}
                        themePreference={themePreference}
                        onThemeChange={setTheme}
                        loading={running && item.action === "checkin"}
                      />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        );
      })}

      <p className="text-center text-xs text-muted-foreground pt-1">RecompOne v{APP_VERSION}</p>

      <CheckInSheet
        open={checkinOpen}
        onOpenChange={setCheckinOpen}
        result={checkinResult}
        lastCheckIn={lastCheckIn}
      />
    </div>
  );
}
