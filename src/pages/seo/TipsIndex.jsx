import SeoShell, { SITE_URL } from "@/components/seo/SeoShell";
import { Link } from "react-router-dom";
import { ArrowRight, Clock } from "lucide-react";
import { tips } from "@/lib/seo/tipsData";

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Learn", item: `${SITE_URL}/learn` },
      { "@type": "ListItem", position: 2, name: "Fitness Tips", item: `${SITE_URL}/tips` }
    ]
  },
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Health & Fitness Tips",
    description:
      "Practical, evidence-based health and fitness tips on calorie deficits, protein, steps, strength training, progress tracking, and meal prep.",
    url: `${SITE_URL}/tips`
  }
];

export default function TipsIndex() {
  return (
    <SeoShell
      title="Health & Fitness Tips for Fat Loss and Recomposition | RecompOne"
      description="Practical, evidence-based fitness tips on calorie deficits, high-protein meals, daily steps, beginner strength training, progress tracking, and meal prep."
      canonicalPath="/tips"
      jsonLd={jsonLd}
    >
      <span className="font-mono text-xs uppercase tracking-wider text-teal">Fitness tips</span>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Health & Fitness Tips</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        Short, actionable guides on the habits that drive fat loss, muscle retention, and body
        recomposition — without the hype.
      </p>

      <div className="mt-8 grid gap-3">
        {tips.map((tip) => (
          <Link
            key={tip.slug}
            to={`/tips/${tip.slug}`}
            className="block rounded-2xl border border-line bg-panel p-5 hover:border-teal/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{tip.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{tip.summary}</p>
                <p className="mt-2 flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Clock className="h-3 w-3" aria-hidden="true" /> {tip.readTime}
                </p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Looking for deeper guides? Browse our{" "}
        <Link to="/learn" className="font-medium text-teal hover:underline">learning hub</Link>{" "}
        or try the free{" "}
        <Link to="/tools/tdee-calculator" className="font-medium text-teal hover:underline">TDEE calculator</Link>.
      </p>
    </SeoShell>
  );
}