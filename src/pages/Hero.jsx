import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import AppSplash from "@/components/AppSplash";
import DeviceMockup from "@/components/hero/DeviceMockup";
import {
  Brain, Activity, LineChart, RefreshCw, ShieldCheck, ArrowRight, Target, UserPlus, LogIn
} from "lucide-react";

const FEATURES = [
  { icon: Brain, title: "Adaptive engine", body: "Weekly check-ins recalculate your calories, macros, and steps from real adherence and trend data — not a static spreadsheet." },
  { icon: Activity, title: "Recomp signal", body: "A confidence-scored read on whether you're building muscle, losing fat, or stalling — with plain-English countermove guidance." },
  { icon: LineChart, title: "Progress you can see", body: "Weight trend, strength 1RM sparklines, waist tracking, and progress photos on one instrument-panel dashboard." },
  { icon: RefreshCw, title: "Your data, wherever you train", body: "When you're online, signed-in data stays available across your devices." }
];

export default function Hero({ preview }) {
  const { isAuthenticated, authChecked, authError } = useAuth();

  if (!authChecked && !authError) return <AppSplash />;
  if (!preview && isAuthenticated && !authError) return <Navigate to="/today" replace />;

  return (
    <div className="min-h-screen bg-bg text-foreground">
      <header className="sticky top-0 z-40 backdrop-blur bg-bg/80 border-b border-lineSoft">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-teal flex items-center justify-center">
              <Target className="w-5 h-5 text-buttonText" />
            </div>
            <span className="font-semibold text-lg">RecompIQ</span>
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
            RecompIQ turns your daily logs into a living plan — recalculating calories, macros, and training every week based on how you're actually progressing.
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

        <section className="max-w-5xl mx-auto px-5 pb-16">
        <div className="rounded-3xl bg-teal text-buttonText p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">Your recomposition, instrumented.</h2>
          <p className="mt-2 opacity-90 max-w-xl mx-auto">Create an account and let the adaptive engine build your first week.</p>
          <div className="mt-6 flex justify-center">
            <Link to="/register" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-buttonText text-[#07211b] px-5 py-3 text-sm font-semibold hover:opacity-90">
              <UserPlus className="w-4 h-4" /> Get started
            </Link>
          </div>
        </div>
        </section>
      </main>

      <footer className="border-t border-lineSoft">
        <div className="max-w-5xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-teal flex items-center justify-center">
              <Target className="w-3.5 h-3.5 text-buttonText" />
            </div>
            <span>© {new Date().getFullYear()} RecompIQ</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <span>RecompIQ is not a medical device and does not diagnose, treat, cure, or prevent any medical condition.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
