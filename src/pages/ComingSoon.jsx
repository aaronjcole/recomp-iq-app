import { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import BrandMark from "@/components/BrandMark";
import DeviceMockup from "@/components/hero/DeviceMockup";
import PremiumBadge from "@/components/premium/PremiumBadge";
import { buildWaitlistAttribution } from "@/lib/marketingAttribution";
import {
  Activity,
  ArrowRight,
  Brain,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Dumbbell,
  Loader2,
  Mail,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck
} from "lucide-react";

const STEPS = [
  {
    icon: ClipboardList,
    number: "01",
    title: "Log the signals",
    body: "Capture the essentials across nutrition, training, recovery, activity, weight, and waist."
  },
  {
    icon: Activity,
    number: "02",
    title: "Read the Recomp Signal",
    body: "See whether the recent data is strong enough to support a decision instead of reacting to one day."
  },
  {
    icon: Target,
    number: "03",
    title: "Act on one best move",
    body: "Get a prioritized next step, the evidence behind it, and what would change the recommendation."
  }
];

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    title: "Conservative by design",
    body: "RecompOne looks for enough recent signal before suggesting a measured adjustment."
  },
  {
    icon: Brain,
    title: "Reasoning you can inspect",
    body: "See the evidence used, alternatives ruled out, and the limits of the current data."
  },
  {
    icon: UserCheck,
    title: "You stay in control",
    body: "Use adaptive guidance or keep manual targets. Recommendations never write a meal or workout for you."
  }
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

const FAQS = [
  {
    question: "Who is RecompOne for?",
    answer: "Adults pursuing sustainable fat loss, muscle retention, or body recomposition who want help interpreting their own fitness data."
  },
  {
    question: "Does one weigh-in change the plan?",
    answer: "No. RecompOne uses recent patterns, logging consistency, and recovery context before treating a change as meaningful."
  },
  {
    question: "Is RecompOne medical advice?",
    answer: "No. RecompOne provides general educational fitness and nutrition guidance and is not a medical device."
  }
];

export default function ComingSoon() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [message, setMessage] = useState("");
  const [explainerViewed, setExplainerViewed] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setMessage("");

    try {
      const search = typeof window === "undefined" ? "" : window.location.search;
      const response = await base44.functions.invoke("joinWaitlist", {
        email,
        source: "coming_soon_page",
        attribution: buildWaitlistAttribution(search, { explainerViewed })
      });
      if (response.data?.error) throw new Error(response.data.error);
      setStatus("done");
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "Something went wrong. Try again.");
    }
  };

  return (
    <div className="min-h-screen bg-bg text-foreground">
      <header className="sticky top-0 z-40 border-b border-lineSoft bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Link to="/" className="flex min-h-11 items-center gap-2" aria-label="RecompOne home">
            <BrandMark className="h-9 w-9 rounded-xl" />
            <span className="text-lg font-semibold">RecompOne</span>
          </Link>
          <div className="flex items-center gap-2">
            <a
              href="#how-it-works"
              className="hidden min-h-11 items-center px-2 text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
              onClick={() => setExplainerViewed(true)}
            >
              How it works
            </a>
            <Link
              to="/hero"
              className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-teal hover:underline"
            >
              Beta tester sign in
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="mx-auto grid max-w-5xl items-center gap-12 px-5 pb-16 pt-12 md:grid-cols-[1.1fr_0.9fr] md:pt-16">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 font-mono text-xs uppercase tracking-wider text-gold">
              <Activity className="h-3.5 w-3.5" aria-hidden="true" /> Adaptive body recomposition app
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
              Know when to hold, adjust, or push your body recomposition plan.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              RecompOne turns nutrition, training, recovery, and body-trend data into one evidence-backed next move—then shows which signals influenced it.
            </p>

            {status === "done" ? (
              <div role="status" className="mt-7 flex items-center gap-3 rounded-2xl border border-teal/40 bg-teal/10 px-5 py-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal">
                  <Check className="h-5 w-5 text-buttonText" aria-hidden="true" />
                </span>
                <div>
                  <div className="font-semibold">You&apos;re on the beta list.</div>
                  <div className="text-sm text-muted-foreground">We&apos;ll email you when Android testing opens.</div>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-7 max-w-xl" aria-label="Join the RecompOne Android beta">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <label htmlFor="waitlist-email" className="sr-only">Email address</label>
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input
                      id="waitlist-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => { setEmail(event.target.value); setStatus("idle"); }}
                      placeholder="you@email.com"
                      className="h-14 w-full rounded-2xl border border-line bg-panel pl-10 pr-4 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    data-marketing-event="waitlist-submit"
                    className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal px-6 font-medium text-buttonText transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {status === "loading" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-5 w-5" aria-hidden="true" />}
                    {status === "loading" ? "Joining…" : "Join the Android beta"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Beta invitations and launch updates only. No advertising cookies or cross-site tracking.
                </p>
              </form>
            )}

            {status === "error" && <p role="alert" className="mt-2 text-sm text-red">{message}</p>}

            <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <a
                href="#how-it-works"
                data-marketing-event="explainer-open"
                onClick={() => setExplainerViewed(true)}
                className="inline-flex min-h-11 items-center gap-2 font-medium text-teal hover:underline"
              >
                See how RecompOne decides <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <span className="text-xs text-muted-foreground">For adults 18+ · Educational guidance, not medical advice</span>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 border-t border-lineSoft pt-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-teal" aria-hidden="true" /> No silent log changes</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-teal" aria-hidden="true" /> Signal strength shown</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-teal" aria-hidden="true" /> Manual targets available</span>
            </div>
          </div>

          <div className="flex justify-center md:justify-end">
            <DeviceMockup />
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 border-y border-lineSoft bg-panel/40">
          <div className="mx-auto max-w-5xl px-5 py-16">
            <div className="max-w-2xl">
              <span className="font-mono text-xs uppercase tracking-wider text-teal">One decision from many signals</span>
              <h2 className="mt-3 text-3xl font-bold tracking-tight">A feedback loop, not another dashboard.</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                RecompOne organizes the signals you already care about, waits for enough context, and turns them into one inspectable next step.
              </p>
            </div>

            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {STEPS.map((step) => (
                <article key={step.number} className="rounded-2xl border border-line bg-panel p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10 text-teal">
                      <step.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{step.number}</span>
                  </div>
                  <h3 className="mt-4 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16" aria-labelledby="premium-heading">
          <div className="overflow-hidden rounded-3xl border border-teal/20 bg-panel shadow-sm">
            <div className="border-b border-lineSoft bg-gradient-to-br from-teal/10 via-panel to-panel p-6 sm:p-9">
              <PremiumBadge label="Premium beta" />
              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)] md:items-end">
                <div>
                  <h2 id="premium-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Premium plans that adapt with you.
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
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
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="flex flex-col gap-3 border-t border-lineSoft p-6 sm:flex-row sm:items-center sm:justify-between sm:px-9">
              <p className="text-xs text-muted-foreground">
                AI-assisted estimates are educational, optional, and never medical measurements.
              </p>
              <a
                href="#waitlist-email"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-teal px-5 py-3 text-sm font-semibold text-buttonText hover:opacity-90"
              >
                Join the Android beta <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16">
          <div className="grid gap-4 md:grid-cols-3">
            {TRUST_POINTS.map((point) => (
              <article key={point.title} className="rounded-2xl border border-line bg-panel p-5">
                <point.icon className="h-5 w-5 text-teal" aria-hidden="true" />
                <h3 className="mt-3 font-semibold">{point.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{point.body}</p>
              </article>
            ))}
          </div>

          <div className="mx-auto mt-14 max-w-3xl">
            <div className="text-center">
              <span className="font-mono text-xs uppercase tracking-wider text-teal">Early-access FAQ</span>
              <h2 className="mt-3 text-2xl font-bold">Built to reduce second-guessing.</h2>
            </div>
            <div className="mt-6 divide-y divide-lineSoft rounded-2xl border border-line bg-panel px-5">
              {FAQS.map((item) => (
                <details key={item.question} className="group py-4">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="pb-2 pr-8 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-lineSoft">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-5 py-8 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <BrandMark className="h-6 w-6 rounded-lg" />
            <span>© {new Date().getFullYear()} RecompOne</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-end">
            <Link to="/privacy" className="min-h-11 content-center hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="min-h-11 content-center hover:text-foreground">Terms</Link>
            <span>RecompOne is not a medical device.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
