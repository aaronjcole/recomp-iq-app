import { useState } from "react";
import SeoShell, { SITE_URL } from "@/components/seo/SeoShell";
import SeoAppCta from "@/components/seo/SeoAppCta";
import { calculateMacroTargets } from "@/lib/fitness/calculators";

const inputClass =
  "h-11 min-h-[44px] w-full rounded-md border border-input bg-transparent px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export default function MacroCalculator() {
  const [calories, setCalories] = useState("2200");
  const [weight, setWeight] = useState("180");
  const [goalWeight, setGoalWeight] = useState("");
  const [result, setResult] = useState(null);

  const compute = (e) => {
    e.preventDefault();
    const cal = Number(calories);
    const w = Number(weight);
    const gw = goalWeight ? Number(goalWeight) : w;
    if (!cal || !w) return;
    const macros = calculateMacroTargets({
      calories: cal,
      current_weight_lbs: w,
      goal_weight_lbs: gw
    });
    setResult({ ...macros, calories: cal });
  };

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "RecompOne Macro Calculator",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web, Android, iOS",
      url: `${SITE_URL}/tools/macro-calculator`,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "How do I calculate my macros?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Start from your calorie target, set protein based on your body weight (around 0.8–1.0g per pound), allocate fat at roughly 0.3g per pound or 23% of calories, then fill the remainder with carbohydrates."
          }
        },
        {
          "@type": "Question",
          name: "What if I don't hit my macros exactly?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Consistency over the week matters more than any single day. Hitting protein and total calories within a reasonable range most days produces steady progress."
          }
        },
        {
          "@type": "Question",
          name: "Are these macros right for cutting or bulking?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "The split adapts to whatever calorie target you enter. Lower the calories for a cut and protein stays high to preserve muscle; raise them for a lean bulk and carbs increase to support training."
          }
        }
      ]
    }
  ];

  return (
    <SeoShell
      title="Macro Calculator — Protein, Carbs & Fat Targets | RecompOne"
      description="Free macro calculator. Enter your calorie target and body weight to get personalized protein, carbohydrate, and fat targets for fat loss, maintenance, or muscle gain."
      canonicalPath="/tools/macro-calculator"
      jsonLd={jsonLd}
    >
      <span className="font-mono text-xs uppercase tracking-wider text-teal">Free tool</span>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Macro Calculator</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        Turn your daily calorie target into a balanced split of protein, carbs, and fat. Protein is
        set by body weight, fat by a minimum floor, and carbs fill the rest — the same approach
        RecompOne uses to build adaptive targets.
      </p>

      <form onSubmit={compute} className="mt-8 grid gap-4">
        <label className="block">
          <span className="text-sm font-medium">Daily calorie target (kcal)</span>
          <input className={`${inputClass} mt-1`} type="number" min="1200" max="20000" value={calories} onChange={(e) => setCalories(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Current weight (lbs)</span>
          <input className={`${inputClass} mt-1`} type="number" min="40" max="1200" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Goal weight (lbs, optional)</span>
          <input className={`${inputClass} mt-1`} type="number" min="40" max="1200" value={goalWeight} onChange={(e) => setGoalWeight(e.target.value)} placeholder="Used to set protein if lower than current" />
        </label>
        <button
          type="submit"
          className="min-h-12 mt-2 content-center rounded-xl bg-teal px-6 font-semibold text-buttonText hover:opacity-90"
        >
          Calculate my macros
        </button>
      </form>

      {result && (
        <section className="mt-8 rounded-2xl border border-line bg-panel p-6" aria-label="Your macro targets">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Protein" value={result.protein_target_g} unit="g" pct={Math.round((result.protein_target_g * 4 * 100) / result.calories)} />
            <Stat label="Carbs" value={result.carb_target_g} unit="g" pct={Math.round((result.carb_target_g * 4 * 100) / result.calories)} />
            <Stat label="Fat" value={result.fat_target_g} unit="g" pct={Math.round((result.fat_target_g * 9 * 100) / result.calories)} />
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            Based on {result.calories.toLocaleString()} kcal/day. Percentages may not sum to 100 due
            to rounding.
          </p>
        </section>
      )}

      <section className="mt-10 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-bold text-foreground">How macros are calculated</h2>
        <p>
          <strong>Protein</strong> is set at roughly 0.85g per pound of your reference weight (your
          goal weight if it's lower than your current weight), capped at 250g to avoid extreme
          targets. <strong>Fat</strong> uses a floor of about 0.3g per pound or 23% of calories —
          whichever is higher — to support hormones and satiety. <strong>Carbohydrates</strong> fill
          the remaining calories, fueling training and recovery.
        </p>
        <h2 className="pt-2 text-xl font-bold text-foreground">Frequently asked questions</h2>
        <details className="rounded-lg border border-line bg-panel p-4">
          <summary className="min-h-11 cursor-pointer font-medium">How do I calculate my macros?</summary>
          <p className="mt-2">Start from your calorie target, set protein by body weight (around 0.8–1.0g per pound), allocate fat at roughly 0.3g per pound, then fill the remainder with carbs.</p>
        </details>
        <details className="rounded-lg border border-line bg-panel p-4">
          <summary className="min-h-11 cursor-pointer font-medium">What if I don't hit my macros exactly?</summary>
          <p className="mt-2">Consistency over the week matters more than any single day. Hitting protein and total calories within a reasonable range most days produces steady progress.</p>
        </details>
        <details className="rounded-lg border border-line bg-panel p-4">
          <summary className="min-h-11 cursor-pointer font-medium">Are these macros right for cutting or bulking?</summary>
          <p className="mt-2">The split adapts to whatever calorie target you enter. Lower the calories for a cut and protein stays high to preserve muscle; raise them for a lean bulk and carbs increase to support training.</p>
        </details>
      </section>

      <SeoAppCta
        title="Get macros that adjust with your weekly adherence"
        body="RecompOne builds adaptive macro targets from your real logs, then revisits them every week against your progress — so your plan stays on track without manual math."
      />
    </SeoShell>
  );
}

function Stat({ label, value, unit, pct }) {
  return (
    <div className="rounded-xl border border-line bg-bg p-4">
      <div className="font-mono text-2xl font-bold tabular-nums text-foreground">
        {value}
        <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
      </div>
      <div className="font-mono text-micro uppercase tracking-wider text-muted-foreground">
        {label} · {pct}% of cals
      </div>
    </div>
  );
}
