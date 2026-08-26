import SeoShell, { SITE_URL } from "@/components/seo/SeoShell";
import { Link } from "react-router-dom";

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Body Recomposition: The Complete Guide",
    description: "What body recomposition is, who it works for, and how to tell whether you're losing fat, building muscle, or both.",
    url: `${SITE_URL}/learn/body-recomposition-guide`,
    author: { "@type": "Organization", name: "RecompOne" },
    publisher: { "@type": "Organization", name: "RecompOne" }
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: "Can you lose fat and build muscle at the same time?", acceptedAnswer: { "@type": "Answer", text: "Yes — especially if you're a beginner, returning from a break, or carrying higher body fat. The process is slower than dedicated cutting or bulking, but it's real and well-documented." } },
      { "@type": "Question", name: "How long does body recomposition take?", acceptedAnswer: { "@type": "Answer", text: "Visible changes typically appear over 8–12 weeks of consistent training and protein intake, with measurable trend shifts in weight and waist before that." } },
      { "@type": "Question", name: "Do I need to be in a calorie deficit to recomp?", acceptedAnswer: { "@type": "Answer", text: "A small deficit or maintenance calories work best. Large deficits prioritize fat loss but make muscle gain much harder; large surpluses prioritize muscle gain but add fat." } }
    ]
  }
];

export default function RecompGuide() {
  return (
    <SeoShell
      title="Body Recomposition: The Complete Guide | RecompOne"
      description="A complete, evidence-based guide to body recomposition: what it is, who it works for, how to set calories and macros, how to train, and how to measure progress."
      canonicalPath="/learn/body-recomposition-guide"
      jsonLd={jsonLd}
    >
      <span className="font-mono text-xs uppercase tracking-wider text-teal">Guide</span>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Body Recomposition: The Complete Guide</h1>
      <p className="mt-3 text-sm text-muted-foreground">Updated 2026 · 8 min read</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <p>
          <strong className="text-foreground">Body recomposition</strong> means losing body fat and
          building muscle at the same time, rather than cycling between dedicated cutting and
          bulking phases. It's not a myth — but it's slower and more demanding than either goal
          alone, and it works best for specific people under specific conditions.
        </p>

        <h2 className="text-xl font-bold text-foreground">Who body recomposition works for</h2>
        <p>
          Recomposition is most achievable when your body has a strong reason to build muscle and an
          easy time using stored fat for energy. That describes four groups:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-foreground">Beginners</strong> — new lifters respond quickly to any consistent training.</li>
          <li><strong className="text-foreground">Returning lifters</strong> — muscle memory accelerates regain after a training break.</li>
          <li><strong className="text-foreground">Higher body-fat individuals</strong> — larger fat stores fund muscle building even in a deficit.</li>
          <li><strong className="text-foreground">Previously trained, now detrained</strong> — the same muscle-memory effect as returning lifters.</li>
        </ul>
        <p>
          If you're already lean and highly trained, true simultaneous recomp becomes rare; you'll
          usually get better results cycling between small surpluses and small deficits.
        </p>

        <h2 className="text-xl font-bold text-foreground">Calories: small deficit, not a crash</h2>
        <p>
          Recomposition thrives in a <strong className="text-foreground">small calorie deficit</strong>
          {" "}— roughly 5–15% below your TDEE — or at maintenance. A large deficit accelerates fat
          loss but suppresses muscle gain; a large surplus accelerates muscle gain but adds fat.
          The middle ground is where recomp lives. Use our{" "}
          <Link to="/tools/tdee-calculator" className="font-medium text-teal hover:underline">TDEE calculator</Link>{" "}
          to find your starting point.
        </p>

        <h2 className="text-xl font-bold text-foreground">Protein is non-negotiable</h2>
        <p>
          Building muscle in a deficit requires a strong protein signal. Aim for{" "}
          <strong className="text-foreground">0.8–1.0g of protein per pound of body weight</strong>{" "}
          per day, spread across 3–4 meals. Fat should sit at a floor of roughly 0.3g per pound to
          support hormones, with carbs filling the rest to fuel training. The{" "}
          <Link to="/tools/macro-calculator" className="font-medium text-teal hover:underline">macro calculator</Link>{" "}
          handles this split for you.
        </p>

        <h2 className="text-xl font-bold text-foreground">Training: progressive overload drives the change</h2>
        <p>
          Nutrition sets the conditions; training creates the demand. Focus on{" "}
          <strong className="text-foreground">progressive overload</strong> — gradually increasing
          weight, reps, or sets on compound lifts (squat, hinge, press, row) across 2–4 sessions per
          week. Without a rising training stimulus, your body has no reason to build muscle
          regardless of calories or protein.
        </p>

        <h2 className="text-xl font-bold text-foreground">How to measure progress</h2>
        <p>
          The scale alone is misleading during recomp, because muscle gain can offset fat loss. Track
          these together:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-foreground">Weight trend</strong> — use a 7-day moving average, not daily readings.</li>
          <li><strong className="text-foreground">Waist measurement</strong> — a dropping waist with stable weight is a classic recomp signal.</li>
          <li><strong className="text-foreground">Strength on key lifts</strong> — rising weights or reps indicate muscle gain.</li>
          <li><strong className="text-foreground">Progress photos</strong> — visual change often precedes scale change.</li>
        </ul>

        <h2 className="text-xl font-bold text-foreground">Frequently asked questions</h2>
        <details className="rounded-lg border border-line bg-panel p-4">
          <summary className="min-h-11 cursor-pointer font-medium">Can you lose fat and build muscle at the same time?</summary>
          <p className="mt-2">Yes — especially for beginners, returning lifters, and those with higher body fat. It's slower than dedicated phases, but it's real and well-documented.</p>
        </details>
        <details className="rounded-lg border border-line bg-panel p-4">
          <summary className="min-h-11 cursor-pointer font-medium">How long does body recomposition take?</summary>
          <p className="mt-2">Visible changes typically appear over 8–12 weeks of consistent training and protein intake, with measurable trend shifts in weight and waist before that.</p>
        </details>
        <details className="rounded-lg border border-line bg-panel p-4">
          <summary className="min-h-11 cursor-pointer font-medium">Do I need to be in a calorie deficit to recomp?</summary>
          <p className="mt-2">A small deficit or maintenance works best. Large deficits prioritize fat loss but make muscle gain harder; large surpluses prioritize muscle gain but add fat.</p>
        </details>

        <p className="rounded-xl border border-teal/20 bg-teal/5 p-4">
          RecompOne turns your weight, waist, training, and adherence trends into one adaptive next
          move — so you can tell whether you're actually recomping or just spinning your wheels.{" "}
          <Link to="/coming-soon" className="font-semibold text-teal hover:underline">See how it works</Link>.
        </p>
      </div>
    </SeoShell>
  );
}