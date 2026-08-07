import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import AppSplash from "@/components/AppSplash";
import BrandMark from "@/components/BrandMark";
import DeviceMockup from "@/components/hero/DeviceMockup";
import PremiumBadge from "@/components/premium/PremiumBadge";
import {
  Brain,
  Activity,
  LineChart,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  UserPlus,
  LogIn,
  CalendarDays,
  Dumbbell,
  Sparkles,
  ScanLine
} from "lucide-react";

const FEATURES = [
  { icon: Brain, title: "Adaptive engine", body: "Weekly check-ins recalculate your calories, macros, and steps from real adherence and trend data — not a static spreadsheet." },
  { icon: Activity, title: "Recomp signal", body: "A confidence-scored read on whether you're building muscle, losing fat, or stalling — with plain-English countermove guidance." },
  { icon: LineChart, title: "Progress you can see", body: "Weight trend, strength 1RM sparklines, waist tracking, and progress photos on one instrument-panel dashboard." },
  { icon: RefreshCw, title: "Your data, wherever you train", body: "When you're online, signed-in data stays available across your devices." }
];

const PREMIUM_FEATURES = [
  {
    icon: CalendarDays,
    title: "Adaptive meal planning",
    body: "Builds seven target-scaled days and one consolidated grocery list from your goals, preferences, and last week's adherence."
  },
  {
    icon: Dumbbell,
    title: "Adaptive training blocks",
    body: "Builds a 4–6 week block around recent sessions, schedule, equipment, and recovery—without inventing loads."
  },
  {
    icon: Sparkles,
    title: "Weekly Autopilot",
    body: "Connects nutrition, training, weight, habits, and recovery into one confidence-aware next move."
  },
  {
    icon: ScanLine,
    title: "Visual progress tools",
    body: "Compare photos privately on your device, with an optional AI-assisted body-composition range for eligible testers."
  }
];

export default function Hero({ preview }) {
  const { isAuthenticated, authChecked, authError } = useAuth();

  if (!authChecked && !authError) return <AppSplash />;
  if (!preview && isAuthenticated && !authError) return <Navigate to="/today" replace />;

  return (
    <div className="min-h-screen bg-bg text-foreground">
      <header className="sticky top-0 z-40 backdrop-blur bg-bg/80 border-b border-lineSoft">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/coming-soon" className="flex items-center gap-2">
            <BrandMark className="h-9 w-9 rounded-xl" />
            <span className="font-semibold text-lg">RecompOne</span>
          </Link>
          <Link to="/login" className="text-sm font-medium text-teal hover:underline">Sign in</Link>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="max-w-5xl mx-auto px-5 grid md:grid-cols-2 gap-10 items-center pt-12 pb-16">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal/10 text-teal px-3 py-1 text-[11px] font-mono uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" /> Adaptive recomposition
          </span>
          <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05]">
            Train and eat for the body you're actually building.
          </h1>
          <p className="mt-4 text-muted-foreground text-lg max-w-md">
            RecompOne turns your daily logs into a living plan — recalculating calories, macros, and training every week based on how you're actually progressing.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-teal text-buttonText px-5 h-14 text-sm font-medium shadow-lg hover:opacity-90 transition-opacity"
            >
              <UserPlus className="w-5 h-5" /> Create your account
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-panel px-5 h-14 text-sm font-medium hover:bg-accent transition-colors"
            >
              <LogIn className="w-5 h-5 text-teal" /> Sign in
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
            <ArrowRight className="w-3.5 h-3.5" /> For adults 18+ · Educational guidance, not medical advice
          </p>
        </div>
        <div className="flex justify-center md:justify-end">
          <DeviceMockup />
        </div>
        </section>

        <section className="max-w-5xl mx-auto px-5 pb-16">
        <div className="grid sm:grid-cols-2 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-panel p-5">
              <div className="w-10 h-10 rounded-xl bg-teal/10 flex items-center justify-center">
                <f.icon className="w-5 h-5 text-teal" />
              </div>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
        </section>

        <section className="max-w-5xl mx-auto px-5 pb-16" aria-labelledby="premium-heading">
          <div className="overflow-hidden rounded-3xl border border-teal/20 bg-panel shadow-sm">
            <div className="border-b border-lineSoft bg-gradient-to-br from-teal/10 via-panel to-panel p-6 sm:p-9">
              <PremiumBadge label="Premium beta" />
              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)] md:items-end">
                <div>
                  <h2 id="premium-heading" className="text-2xl sm:text-3xl font-bold tracking-tight">
                    Premium plans that adapt with you.
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
                    Turn the same signals you already track into a practical week of food, a progressive training block, and one clear adjustment at a time.
                  </p>
                </div>
                <p className="rounded-2xl border border-lineSoft bg-bg/60 px-4 py-3 text-sm text-muted-foreground md:text-right">
                  Premium features are available to approved testers during beta.
                </p>
              </div>
            </div>

            <div className="grid gap-px bg-lineSoft sm:grid-cols-2">
              {PREMIUM_FEATURES.map((feature) => (
                <article key={feature.title} className="bg-panel p-6 sm:p-7">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal/10">
                      <feature.icon className="h-5 w-5 text-teal" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{feature.title}</h3>
                      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{feature.body}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="flex flex-col gap-3 border-t border-lineSoft p-6 sm:flex-row sm:items-center sm:justify-between sm:px-9">
              <p className="text-xs text-muted-foreground">
                AI-assisted estimates are educational, optional, and never medical measurements.
              </p>
              <Link
                to="/register"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal px-5 py-3 text-sm font-semibold text-buttonText hover:opacity-90"
              >
                Join the beta <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-5 pb-16">
        <div className="rounded-3xl bg-teal text-buttonText p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">Your recomposition, instrumented.</h2>
          <p className="mt-2 opacity-90 max-w-xl mx-auto">Create an account and let the adaptive engine build your first week.</p>
          <div className="mt-6 flex justify-center">
            <Link to="/register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-bg px-5 py-3 text-sm font-semibold text-foreground hover:opacity-90">
              <UserPlus className="w-4 h-4" /> Get started
            </Link>
          </div>
        </div>
        </section>
      </main>

      <footer className="border-t border-lineSoft">
        <div className="max-w-5xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <BrandMark className="h-6 w-6 rounded-lg" />
            <span>© {new Date().getFullYear()} RecompOne</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <span>RecompOne is not a medical device and does not diagnose, treat, cure, or prevent any medical condition.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
