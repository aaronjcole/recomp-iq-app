import { useState } from "react";
import SeoShell, { SITE_URL } from "@/components/seo/SeoShell";
import SeoAppCta from "@/components/seo/SeoAppCta";
import {
  calculateBMR,
  calculateTDEE,
  calculateCalorieTarget,
  calculateMacroTargets,
  activityMultipliers,
  calorieGoalFactors
} from "@/lib/fitness/calculators";

const ACTIVITY_OPTIONS = [
  { value: "sedentary", label: "Sedentary — desk job, little exercise" },
  { value: "lightly_active", label: "Lightly active — light exercise 1–3 days/week" },
  { value: "moderately_active", label: "Moderately active — moderate exercise 3–5 days/week" },
  { value: "very_active", label: "Very active — hard exercise 6–7 days/week" },
  { value: "extremely_active", label: "Extremely active — physical job + training" }
];

const GOAL_OPTIONS = [
  { value: "maintenance", label: "Maintenance" },
  { value: "body_recomposition", label: "Body recomposition" },
  { value: "fat_loss_biased_recomp", label: "Fat-loss biased recomp" },
  { value: "fat_loss", label: "Fat loss" },
  { value: "aggressive_fat_loss", label: "Aggressive fat loss" },
  { value: "muscle_gain", label: "Muscle gain" },
  { value: "lean_bulk", label: "Lean bulk" },
  { value: "aggressive_gain", label: "Aggressive gain" },
  { value: "strength_retention_cut", label: "Strength retention cut" }
];

const inputClass =
  "h-11 min-h-[44px] w-full rounded-md border border-input bg-transparent px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export default function TdeeCalculator() {
  const [age, setAge] = useState("30");
  const [sex, setSex] = useState("male");
  const [feet, setFeet] = useState("5");
  const [inches, setInches] = useState("10");
  const [weight, setWeight] = useState("180");
  const [activity, setActivity] = useState("moderately_active");
  const [goal, setGoal] = useState("body_recomposition");
  const [result, setResult] = useState(null);

  const compute = (e) => {
    e.preventDefault();
    const heightIn = Number(feet) * 12 + Number(inches);
    const weightLbs = Number(weight);
    const ageNum = Number(age);
    if (!weightLbs || !ageNum || !heightIn) return;

    const bmr = calculateBMR({ sex, weight_lbs: weightLbs, height_in: heightIn, age: ageNum });
    const tdee = calculateTDEE(bmr, activity);
    const calories = calculateCalorieTarget(tdee, goal);
    const macros = calculateMacroTargets({
      calories,
      current_weight_lbs: weightLbs,
      goal_weight_lbs: weightLbs
    });
    setResult({ bmr, tdee, calories, macros, multiplier: activityMultipliers[activity], factor: calorieGoalFactors[goal] });
  };

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "RecompOne TDEE Calculator",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web, Android, iOS",
      url: `${SITE_URL}/tools/tdee-calculator`,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is TDEE?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Total Daily Energy Expenditure (TDEE) is the estimated number of calories you burn each day, calculated by multiplying your basal metabolic rate (BMR) by an activity factor that reflects your lifestyle and exercise habits."
          }
        },
        {
          "@type": "Question",
          name: "Which formula does this calculator use?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "This calculator uses the Mifflin-St Jeor equation for BMR, then applies an activity multiplier between 1.2 (sedentary) and 1.9 (extremely active) to estimate TDEE."
          }
        },
        {
          "@type": "Question",
          name: "Should I eat my exact TDEE to maintain?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "For maintenance, yes — but day-to-day variation is normal. A weekly average near your TDEE is a better target than hitting an exact number every single day."
          }
        },
        {
          "@type": "Question",
          name: "How accurate is this calculator?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Mifflin-St Jeor is among the most accurate predictive equations, but every formula is still an estimate. Track your real weight and waist trends for two to three weeks, then adjust based on observed change."
          }
        }
      ]
    }
  ];

  return (
    <SeoShell
      title="TDEE Calculator — Estimate Your Daily Calorie Burn | RecompOne"
      description="Free TDEE calculator using the Mifflin-St Jeor equation. Enter your age, sex, height, weight, and activity level to estimate your total daily energy expenditure and goal-based calorie target."
      canonicalPath="/tools/tdee-calculator"
      jsonLd={jsonLd}
    >
      <span className="font-mono text-xs uppercase tracking-wider text-teal">Free tool</span>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">TDEE Calculator</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        Estimate your Total Daily Energy Expenditure with the Mifflin-St Jeor equation, then see a
        goal-adjusted calorie target and macro split. Everything is computed in your browser — no
        sign-up required.
      </p>

      <form onSubmit={compute} className="mt-8 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Age</span>
          <input className={`${inputClass} mt-1`} type="number" min="18" max="120" value={age} onChange={(e) => setAge(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Sex</span>
          <select className={`${inputClass} mt-1`} value={sex} onChange={(e) => setSex(e.target.value)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="unspecified">Prefer not to say</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Height (feet)</span>
          <input className={`${inputClass} mt-1`} type="number" min="3" max="9" value={feet} onChange={(e) => setFeet(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Height (inches)</span>
          <input className={`${inputClass} mt-1`} type="number" min="0" max="11" value={inches} onChange={(e) => setInches(e.target.value)} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">Weight (lbs)</span>
          <input className={`${inputClass} mt-1`} type="number" min="40" max="1200" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">Activity level</span>
          <select className={`${inputClass} mt-1`} value={activity} onChange={(e) => setActivity(e.target.value)}>
            {ACTIVITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">Goal</span>
          <select className={`${inputClass} mt-1`} value={goal} onChange={(e) => setGoal(e.target.value)}>
            {GOAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="min-h-12 mt-2 content-center rounded-xl bg-teal px-6 font-semibold text-buttonText hover:opacity-90 sm:col-span-2"
        >
          Calculate my TDEE
        </button>
      </form>

      {result && (
        <section className="mt-8 rounded-2xl border border-line bg-panel p-6" aria-label="Your results">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="BMR" value={result.bmr.toLocaleString()} unit="kcal/day" />
            <Stat label="TDEE" value={result.tdee.toLocaleString()} unit="kcal/day" highlight />
            <Stat label="Calorie target" value={result.calories.toLocaleString()} unit="kcal/day" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Stat label="Protein" value={result.macros.protein_target_g} unit="g" />
            <Stat label="Carbs" value={result.macros.carb_target_g} unit="g" />
            <Stat label="Fat" value={result.macros.fat_target_g} unit="g" />
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            Activity multiplier {result.multiplier}× · goal factor {result.factor}×. This is an
            estimate. RecompOne refines targets weekly using your real adherence, weight, and waist
            trends.
          </p>
        </section>
      )}

      <section className="mt-10 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-bold text-foreground">How TDEE is calculated</h2>
        <p>
          Your <strong>basal metabolic rate (BMR)</strong> is the energy your body uses at complete
          rest. The Mifflin-St Jeor equation estimates BMR from your weight, height, age, and sex.
          Your <strong>total daily energy expenditure (TDEE)</strong> multiplies BMR by an activity
          factor that reflects how much you move throughout the day.
        </p>
        <p>
          Once TDEE is known, a goal factor adjusts it up or down: maintenance uses 1.0×, fat loss
          ranges from 0.75× to 0.85×, and muscle gain ranges from 1.05× to 1.12×. The resulting calorie
          target is the starting point — real progress depends on consistency, which is why
          RecompOne revisits targets weekly against your actual data.
        </p>
        <h2 className="pt-2 text-xl font-bold text-foreground">Frequently asked questions</h2>
        <details className="rounded-lg border border-line bg-panel p-4">
          <summary className="min-h-11 cursor-pointer font-medium">What is TDEE?</summary>
          <p className="mt-2">Total Daily Energy Expenditure is the estimated calories you burn each day, combining BMR with activity. It's the baseline for setting any fat-loss, maintenance, or muscle-gain calorie target.</p>
        </details>
        <details className="rounded-lg border border-line bg-panel p-4">
          <summary className="min-h-11 cursor-pointer font-medium">How accurate is this calculator?</summary>
          <p className="mt-2">Mifflin-St Jeor is among the most accurate predictive equations, but every formula is still an estimate. Track your real weight and waist trends for two to three weeks, then adjust based on observed change.</p>
        </details>
        <details className="rounded-lg border border-line bg-panel p-4">
          <summary className="min-h-11 cursor-pointer font-medium">Should I eat my exact TDEE to maintain?</summary>
          <p className="mt-2">For maintenance, yes — but day-to-day variation is normal. A weekly average near your TDEE is a better target than hitting an exact number every single day.</p>
        </details>
      </section>

      <SeoAppCta
        title="Get adaptive targets that update with your real progress"
        body="RecompOne takes your TDEE and turns it into a weekly-adaptive calorie and macro plan that adjusts based on your actual adherence, weight, and waist trends — so you stop guessing and start converging."
      />
    </SeoShell>
  );
}

function Stat({ label, value, unit, highlight = false }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-teal/40 bg-teal/10" : "border-line bg-bg"}`}>
      <div className="font-mono text-2xl font-bold tabular-nums text-foreground">
        {value}
        <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
      </div>
      <div className="font-mono text-micro uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
