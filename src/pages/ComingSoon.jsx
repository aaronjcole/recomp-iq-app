import { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import BrandMark from "@/components/BrandMark";
import DeviceMockup from "@/components/hero/DeviceMockup";
import {
  Brain, Activity, LineChart, RefreshCw, ShieldCheck,
  Check, Loader2, ArrowRight, Mail
} from "lucide-react";

const FEATURES = [
  { icon: Brain, title: "Adaptive engine", body: "Weekly check-ins recalculate your calories, macros, and steps from real adherence and trend data." },
  { icon: Activity, title: "Recomp signal", body: "A confidence-scored read on whether you're building muscle, losing fat, or stalling." },
  { icon: LineChart, title: "Progress you can see", body: "Weight trend, strength 1RM sparklines, waist tracking, and progress photos on one dashboard." },
  { icon: RefreshCw, title: "Your data, wherever you train", body: "When you're online, signed-in data stays available across your devices." }
];



export default function ComingSoon() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [msg, setMsg] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setMsg("");
    try {
      const res = await base44.functions.invoke("joinWaitlist", { email, source: "coming_soon_page" });
      if (res.data?.error) throw new Error(res.data.error);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setMsg(err?.message || "Something went wrong. Try again.");
    }
  };

  return (
    <div className="min-h-screen bg-bg text-foreground">
      <header className="sticky top-0 z-40 backdrop-blur bg-bg/80 border-b border-lineSoft">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BrandMark className="h-9 w-9 rounded-xl" />
            <span className="font-semibold text-lg">RecompIQ</span>
          </Link>

        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="max-w-5xl mx-auto px-5 grid md:grid-cols-2 gap-10 items-center pt-12 pb-16">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 text-gold px-3 py-1 text-[11px] font-mono uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" /> Coming soon
          </span>
          <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05]">
            Join RecompIQ early access.
          </h1>
          <p className="mt-4 text-muted-foreground text-lg max-w-md">
            RecompIQ turns your daily logs into a living plan — recalculating calories, macros, and training every week based on how you're actually progressing. Be first in line when we launch.
          </p>

          {status === "done" ? (
            <div role="status" className="mt-7 flex items-center gap-3 rounded-2xl border border-teal/40 bg-teal/10 px-5 py-4">
              <span className="w-9 h-9 rounded-full bg-teal flex items-center justify-center shrink-0">
                <Check className="w-5 h-5 text-buttonText" />
              </span>
              <div>
                <div className="font-semibold">You're on the list!</div>
                <div className="text-sm text-muted-foreground">We'll email you the moment RecompIQ goes live.</div>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-7 flex flex-col sm:flex-row gap-2 max-w-md">
              <div className="relative flex-1">
                <label htmlFor="waitlist-email" className="sr-only">Email address</label>
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  id="waitlist-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
                  placeholder="you@email.com"
                  className="w-full h-14 rounded-2xl border border-line bg-panel pl-10 pr-4 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal"
                />
              </div>
              <button
                type="submit"
                disabled={status === "loading"}
                className="h-14 px-6 rounded-2xl bg-teal text-buttonText font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60 select-none"
              >
                {status === "loading" ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                {status === "loading" ? "Joining…" : "Notify me"}
              </button>
            </form>
          )}
          {status === "error" && (
            <p role="alert" className="mt-2 text-sm text-red">{msg}</p>
          )}

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
      </main>

      <footer className="border-t border-lineSoft">
        <div className="max-w-5xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <BrandMark className="h-6 w-6 rounded-lg" />
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
