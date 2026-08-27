import SeoShell, { SITE_URL } from "@/components/seo/SeoShell";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Scale } from "lucide-react";
import { comparisons, CATEGORIES, comparisonsByCategory } from "@/lib/seo/comparisonsData";

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Learn", item: `${SITE_URL}/learn` },
      { "@type": "ListItem", position: 2, name: "App Comparisons", item: `${SITE_URL}/compare` }
    ]
  },
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "RecompOne vs Other Fitness Apps",
    description:
      "Neutral, side-by-side comparisons of RecompOne and other fitness apps for macro tracking, training, and coaching.",
    url: `${SITE_URL}/compare`
  }
];

export default function ComparisonsIndex() {
  return (
    <SeoShell
      title="RecompOne vs Other Fitness Apps: Neutral Comparisons | RecompOne"
      description="Side-by-side, neutral comparisons of RecompOne and popular fitness apps for macro tracking, training, and coaching — features, pricing, and who each is best for."
      canonicalPath="/compare"
      jsonLd={jsonLd}
    >
      <span className="font-mono text-xs uppercase tracking-wider text-teal">App comparisons</span>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">RecompOne vs Other Fitness Apps</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        Neutral, side-by-side comparisons across macro tracking, training, and coaching apps —
        features, pricing, and who each tool suits best. RecompOne is made by us, and that's
        disclosed on every page.
      </p>

      <p className="mt-4 rounded-xl border border-teal/20 bg-teal/5 p-4 text-sm text-muted-foreground">
        <Scale className="mr-1 inline h-4 w-4 text-teal" aria-hidden="true" />
        Transparency: RecompOne is the app made by this site. These comparisons aim to be fair and
        factual — we note where each competitor is the better pick, not just where we are.
      </p>

      {CATEGORIES.map((cat) => {
        const items = comparisonsByCategory(cat.id);
        if (!items.length) return null;
        return (
          <section key={cat.id} className="mt-8">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <span className="font-mono text-xs uppercase tracking-wider text-teal">{cat.label}</span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{cat.blurb}</p>
            <div className="mt-3 grid gap-3">
              {items.map((c) => (
                <Link
                  key={c.slug}
                  to={`/compare/${c.slug}`}
                  className="block rounded-2xl border border-line bg-panel p-5 hover:border-teal/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{c.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{c.summary}</p>
                      <p className="mt-2 flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        <Clock className="h-3 w-3" aria-hidden="true" /> {c.readTime}
                      </p>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <p className="mt-8 text-sm text-muted-foreground">
        Looking for deeper context? Browse the{" "}
        <Link to="/learn" className="font-medium text-teal hover:underline">learning hub</Link>, try the free{" "}
        <Link to="/tools/tdee-calculator" className="font-medium text-teal hover:underline">TDEE calculator</Link> or{" "}
        <Link to="/tools/macro-calculator" className="font-medium text-teal hover:underline">macro calculator</Link>,
        or read our{" "}
        <Link to="/tips" className="font-medium text-teal hover:underline">fitness tips</Link>.
      </p>
    </SeoShell>
  );
}