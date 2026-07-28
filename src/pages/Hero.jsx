import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import AppSplash from "@/components/AppSplash";
import DeviceMockup from "@/components/hero/DeviceMockup";
import { PLAY_STORE_URL, APP_INTENT_URL } from "@/lib/storeLinks";
import {
  Brain, Activity, LineChart, RefreshCw, ShieldCheck, ArrowRight, Play, Smartphone, Target
} from "lucide-react";

const FEATURES = [
  { icon: Brain, title: "Adaptive engine", body: "Weekly check-ins recalculate your calories, macros, and steps from real adherence and trend data — not a static spreadsheet." },
  { icon: Activity, title: "Recomp signal", body: "A confidence-scored read on whether you're building muscle, losing fat, or stalling — with plain-English countermove guidance." },
  { icon: LineChart, title: "Progress you can see", body: "Weight trend, strength 1RM sparklines, waist tracking, and progress photos on one instrument-panel dashboard." },
  { icon: RefreshCw, title: "Always in sync", body: "Log from the gym or the kitchen; everything saves instantly and syncs across your devices when you reconnect." }
];

function PlayBadge() {
  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-3 rounded-2xl bg-foreground text-background px-5 h-14 shadow-lg hover:opacity-90 transition-opacity select-none"
    >
      <Play className="w-6 h-6 fill-current" />
      <span className="leading-tight text-left">
        <span className="block text-[10px] uppercase tracking-wide opacity-80">Get it on</span>
        <span className="block text-lg font-semibold -mt-0.5">Google Play</span>
      </span>
    </a>
  );
}

export default function Hero({ preview }) {
  const { isAuthenticated, authChecked, authError } = useAuth();

  if (!authChecked) return <AppSplash />;
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
            <PlayBadge />
            <a
              href={APP_INTENT_URL}
              className="inline-flex items-center gap-2 rounded-2xl border border-line bg-panel px-5 h-14 text-sm font-medium hover:bg-accent transition-colors"
            >
              <Smartphone className="w-5 h-5 text-teal" />
              Open in the app
            </a>
          </div>
          <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
            <ArrowRight className="w-3.5 h-3.5" /> Low monthly price · Cancel anytime
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
          <p className="mt-2 opacity-90 max-w-xl mx-auto">Download RecompIQ on Google Play and let the adaptive engine build your first week.</p>
          <div className="mt-6 flex justify-center">
            <PlayBadge />
          </div>
        </div>
      </section>

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
            <span>Not a medical device</span>
          </div>
        </div>
      </footer>
    </div>
  );
}