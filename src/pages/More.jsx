import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRecomp } from "@/lib/RecompContext";
import { useAuth } from "@/lib/AuthContext";
import { useTheme } from "@/lib/useTheme";
import { GOAL_LABELS } from "@/lib/fitness";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  MessageCircle, RefreshCw, Target, SlidersHorizontal, BookMarked, ShoppingCart,
  Camera, Mail, CheckCircle, Moon, Sun, LogOut, User, Database, Trash2,
  ChevronRight, Loader2, Star, ShieldCheck, FileText, History
} from "lucide-react";
import { PLAY_STORE_URL } from "@/lib/storeLinks";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from "@/components/ui/alert-dialog";
import { seedDemoData, clearDemoData } from "@/lib/demoData";
import CheckInSheet from "@/components/more/CheckInSheet";

const APP_VERSION = "0.1.0";

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

function Row({ item, first, onActivate, themeChecked, onToggleTheme, loading }) {
  const Icon = item.icon;
  return (
    <div className={`flex w-full items-center gap-3 px-3 py-3 ${first ? "" : "border-t border-lineSoft"}`}>
      <button onClick={onActivate} className="flex flex-1 items-center gap-3 min-w-0 text-left">
        <Icon className="w-4 h-4 text-teal shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium truncate">{item.label}</span>
          {item.subtitle && <span className="block text-xs text-muted-foreground truncate">{item.subtitle}</span>}
        </span>
      </button>
      {item.badge && (
        <span className="rounded bg-questComplete text-gold px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide">
          {item.badge}
        </span>
      )}
      {item.control === "theme" ? (
        <Switch checked={themeChecked} onCheckedChange={onToggleTheme} aria-label="Toggle dark mode" />
      ) : loading ? (
        <Loader2 className="w-4 h-4 text-teal shrink-0 animate-spin" />
      ) : (
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      )}
    </div>
  );
}

export default function More() {
  const { profile, strategy, recompLevel, signal, runCheckIn, checkIns, reload, logs, mealTemplates } = useRecomp();
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinResult, setCheckinResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
      setCheckinOpen(true);
    } finally {
      setRunning(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedDemoData({ profile, strategy });
      await reload();
    } finally {
      setSeeding(false);
      setConfirmOpen(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearDemoData();
      await reload();
    } finally {
      setClearing(false);
    }
  };

  const onLoadClick = () => {
    if (logs.length > 0) setConfirmOpen(true);
    else handleSeed();
  };

  const handlers = {
    checkin: runCheck,
    reload: () => reload(),
    logout: () => base44.auth.logout(window.location.origin),
    demo: onLoadClick,
    clearDemo: handleClear,
    rate: () => window.open(PLAY_STORE_URL, "_blank", "noopener,noreferrer"),
    privacy: () => navigate("/privacy"),
    terms: () => navigate("/terms")
  };

  const SECTIONS = [
    {
      title: "Coaching & plan",
      items: [
        { icon: MessageCircle, label: "AI Coach", to: "/coach" },
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
        { icon: Target, label: "Plan & projections", to: "/plan" },
        { icon: SlidersHorizontal, label: "Custom targets", to: "/nutrition" }
      ]
    },
    {
      title: "Nutrition tools",
      items: [
        { icon: BookMarked, label: "Meal templates", to: "/nutrition", subtitle: `${mealTemplates.length} saved` },
        { icon: ShoppingCart, label: "Grocery list", to: "/nutrition" }
      ]
    },
    {
      title: "Progress & data",
      items: [
        { icon: Camera, label: "Progress photos", to: "/progress", subtitle: "On this device only" },
        { icon: History, label: "Decision history", to: "/decisions", subtitle: "Plan change log" },
        { icon: Mail, label: "Weekly email & export", to: "/profile" }
      ]
    },
    {
      title: "Habits",
      items: [{ icon: CheckCircle, label: "Manage habits", to: "/today" }]
    },
    {
      title: "App & account",
      items: [
        { icon: User, label: "Profile & plan", to: "/profile" },
        { icon: theme === "dark" ? Moon : Sun, label: "Dark mode", control: "theme" },
        { icon: Star, label: "Rate on Play Store", action: "rate" },
        { icon: RefreshCw, label: "Refresh data", action: "reload" },
        { icon: Database, label: "Demo data", action: "demo", subtitle: seeding ? "Seeding…" : "Preview charts" },
        { icon: LogOut, label: "Log out", action: "logout" }
      ]
    },
    {
      title: "Legal",
      items: [
        { icon: ShieldCheck, label: "Privacy Policy", action: "privacy" },
        { icon: FileText, label: "Terms of Service", action: "terms" }
      ]
    }
  ];

  const handleItem = (item) => {
    if (item.to) navigate(item.to);
    else if (item.action && handlers[item.action]) handlers[item.action]();
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">More</h1>

      {/* Identity header — status glance */}
      <Card className="bg-panel border-line">
        <CardContent className="p-4">
          <button className="flex w-full items-center gap-3" onClick={() => navigate("/profile")}>
            <div className="h-12 w-12 rounded-full bg-teal text-[#03110e] flex items-center justify-center font-semibold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="font-semibold truncate">{fullName}</div>
              <div className="text-xs text-muted-foreground truncate">{email}</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="rounded-full bg-panel2 text-muted-foreground px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide">
                  {goalLabel}
                </span>
                <span className="rounded-full bg-teal/15 text-teal px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide">
                  {level}
                </span>
                {signalScore != null && (
                  <span className="rounded-full bg-teal/15 text-teal px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide">
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

      {SECTIONS.map((section) => (
        <Card key={section.title} className="bg-panel border-line">
          <CardContent className="p-2">
            <div className="px-3 pt-2 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {section.title}
            </div>
            {section.items.map((item, idx) => (
              <Row
                key={item.label}
                item={item}
                first={idx === 0}
                onActivate={() => handleItem(item)}
                themeChecked={theme === "dark"}
                onToggleTheme={toggle}
                loading={running && item.action === "checkin"}
              />
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Demo data utility — preserved */}
      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-teal" />
            <div className="font-medium text-sm">Demo data</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onLoadClick}
              disabled={seeding}
              className="flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-md bg-teal text-buttonText text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              {seeding ? "Seeding…" : "Load"}
            </button>
            <button
              onClick={handleClear}
              disabled={clearing}
              className="flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-md border border-line text-foreground text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {clearing ? "Clearing…" : "Clear"}
            </button>
          </div>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Load demo data?</AlertDialogTitle>
                <AlertDialogDescription>
                  You already have logged data. Loading demo data will add ~35 days of demo history. Continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSeed}>Load demo data</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground pt-1">RecompIQ v{APP_VERSION}</p>

      <CheckInSheet
        open={checkinOpen}
        onOpenChange={setCheckinOpen}
        result={checkinResult}
        lastCheckIn={lastCheckIn}
      />
    </div>
  );
}