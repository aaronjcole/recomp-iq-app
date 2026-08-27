import SeoShell, { SITE_URL } from "@/components/seo/SeoShell";
import { Link, useParams } from "react-router-dom";
import { Clock, Check, X, Minus } from "lucide-react";
import { comparisons, findComparison } from "@/lib/seo/comparisonsData";

function SupportCell({ value }) {
  if (value === true) return <span className="inline-flex items-center gap-1 text-teal"><Check className="h-4 w-4" aria-hidden="true" /> Yes</span>;
  if (value === false) return <span className="inline-flex items-center gap-1 text-muted-foreground"><X className="h-4 w-4" aria-hidden="true" /> No</span>;
  return <span className="text-foreground">{value ?? "—"}</span>;
}

export default function ComparisonArticle() {
  const { slug } = useParams();
  const comparison = findComparison(slug);

  if (!comparison) {
    return (
      <SeoShell
        title="Comparison not found | RecompOne"
        description="The app comparison you're looking for could not be found."
        canonicalPath="/compare"
      >
        <span className="font-mono text-xs uppercase tracking-wider text-teal">Not found</span>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Comparison not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We couldn't find that comparison.{" "}
          <Link to="/compare" className="font-medium text-teal hover:underline">Browse all app comparisons</Link>.
        </p>
      </SeoShell>
    );
  }

  const canonicalPath = `/compare/${comparison.slug}`;
  const related = comparison.relatedSlugs
    .map((s) => comparisons.find((c) => c.slug === s))
    .filter(Boolean);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: comparison.title,
      description: comparison.summary,
      url: `${SITE_URL}${canonicalPath}`,
      author: { "@type": "Organization", name: "RecompOne" },
      publisher: { "@type": "Organization", name: "RecompOne" }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Learn", item: `${SITE_URL}/learn` },
        { "@type": "ListItem", position: 2, name: "App Comparisons", item: `${SITE_URL}/compare` },
        { "@type": "ListItem", position: 3, name: comparison.title, item: `${SITE_URL}${canonicalPath}` }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: comparison.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a }
      }))
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "RecompOne",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web, iOS, Android",
      publisher: { "@type": "Organization", name: "RecompOne" }
    }
  ];

  return (
    <SeoShell
      title={`${comparison.title}: Neutral Feature Comparison | RecompOne`}
      description={comparison.summary}
      canonicalPath={canonicalPath}
      jsonLd={jsonLd}
    >
      <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/learn" className="hover:text-foreground">Learn</Link>
        {" / "}
        <Link to="/compare" className="hover:text-foreground">Comparisons</Link>
      </nav>
      <span className="mt-3 block font-mono text-xs uppercase tracking-wider text-teal">
        {comparison.category === "macro_tracking" ? "Macro tracking" : comparison.category === "training" ? "Training" : "Coaching & programs"}
      </span>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{comparison.title}</h1>
      <p className="mt-3 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {comparison.readTime} · Updated {comparison.updated}
      </p>

      <p className="mt-4 rounded-xl border border-teal/20 bg-teal/5 p-4 text-sm text-muted-foreground">
        Transparency: RecompOne is the app made by this site. This comparison is intended to be fair
        and factual — we note where {comparison.competitor} is the better pick, not just where we are.
      </p>

      <p className="mt-6 text-base leading-relaxed text-foreground">{comparison.intro}</p>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-foreground">Feature comparison</h2>
        <p className="mt-1 text-sm text-muted-foreground">Side-by-side facts. No overall winner — just what each tool does.</p>

        {/* Desktop table */}
        <div className="mt-4 hidden overflow-hidden rounded-2xl border border-line sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel2 text-left">
                <th className="p-3 font-semibold">Feature</th>
                <th className="p-3 font-semibold text-teal bg-teal/10 border-l-2 border-teal/40">RecompOne</th>
                <th className="p-3 font-semibold">{comparison.competitor}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.featureMatrix.map((row, i) => (
                <tr key={row.feature} className={i % 2 === 0 ? "bg-panel" : "bg-panel2/40"}>
                  <td className="p-3 align-top font-medium">{row.feature}</td>
                  <td className="p-3 align-top text-foreground bg-teal/5 border-l-2 border-teal/40"><SupportCell value={row.recompone} /></td>
                  <td className="p-3 align-top text-muted-foreground"><SupportCell value={row.competitor} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked rows */}
        <div className="mt-4 space-y-3 sm:hidden">
          {comparison.featureMatrix.map((row) => (
            <div key={row.feature} className="rounded-2xl border border-line bg-panel p-4">
              <h3 className="font-semibold">{row.feature}</h3>
              <dl className="mt-2 space-y-2 text-sm">
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-wider text-teal">RecompOne</dt>
                  <dd className="text-muted-foreground"><SupportCell value={row.recompone} /></dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{comparison.competitor}</dt>
                  <dd className="text-muted-foreground"><SupportCell value={row.competitor} /></dd>
                </div>
              </dl>
              {row.notes && <p className="mt-2 text-xs text-muted-foreground"><Minus className="mr-1 inline h-3 w-3" aria-hidden="true" />{row.notes}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-panel p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">Pricing</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-wider text-teal">RecompOne</dt>
              <dd className="text-muted-foreground">{comparison.pricing.recompone}</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{comparison.competitor}</dt>
              <dd className="text-muted-foreground">{comparison.pricing.competitor}</dd>
            </div>
          </dl>
          {comparison.pricing.notes && <p className="mt-3 text-xs text-muted-foreground">{comparison.pricing.notes}</p>}
        </div>
        <div className="rounded-2xl border border-line bg-panel p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">Who it's best for</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-wider text-teal">RecompOne</dt>
              <dd className="text-muted-foreground">{comparison.bestFor.recompone}</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{comparison.competitor}</dt>
              <dd className="text-muted-foreground">{comparison.bestFor.competitor}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-foreground">Frequently asked questions</h2>
        <div className="mt-3 space-y-2">
          {comparison.faqs.map((f) => (
            <details key={f.q} className="rounded-lg border border-line bg-panel p-4">
              <summary className="min-h-11 cursor-pointer font-medium text-foreground">{f.q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="mt-8 rounded-xl border border-teal/20 bg-teal/5 p-4">
        RecompOne turns your weight, waist, training, and adherence trends into one adaptive next
        move — so the comparison above becomes a plan you can actually follow.{" "}
        <Link to="/coming-soon" className="font-semibold text-teal hover:underline">See how it works</Link>.
      </p>

      {related.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Related comparisons</h2>
          <div className="mt-3 grid gap-3">
            {related.map((r) => (
              <Link key={r.slug} to={`/compare/${r.slug}`} className="block rounded-2xl border border-line bg-panel p-4 hover:border-teal/40">
                <h3 className="text-sm font-semibold">{r.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{r.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="mt-8">
        <Link to="/compare" className="font-medium text-teal hover:underline">← Browse all app comparisons</Link>
        {" · "}
        <Link to="/learn/body-recomposition-guide" className="font-medium text-teal hover:underline">Read the body recomposition guide</Link>
      </p>
    </SeoShell>
  );
}