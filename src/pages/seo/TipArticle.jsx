import SeoShell, { SITE_URL } from "@/components/seo/SeoShell";
import { Link, useParams } from "react-router-dom";
import { Clock } from "lucide-react";
import { findTip, tips } from "@/lib/seo/tipsData";

export default function TipArticle() {
  const { slug } = useParams();
  const tip = findTip(slug);

  if (!tip) {
    return (
      <SeoShell
        title="Tip not found | RecompOne"
        description="The fitness tip you're looking for could not be found."
        canonicalPath="/tips"
      >
        <span className="font-mono text-xs uppercase tracking-wider text-teal">Not found</span>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Tip not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We couldn't find that article.{" "}
          <Link to="/tips" className="font-medium text-teal hover:underline">Browse all fitness tips</Link>.
        </p>
      </SeoShell>
    );
  }

  const canonicalPath = `/tips/${tip.slug}`;
  const tipIndex = tips.findIndex((t) => t.slug === tip.slug);
  const related = [...tips.slice(tipIndex + 1), ...tips.slice(0, tipIndex)].slice(0, 3);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: tip.title,
      description: tip.summary,
      url: `${SITE_URL}${canonicalPath}`,
      author: { "@type": "Organization", name: "RecompOne" },
      publisher: { "@type": "Organization", name: "RecompOne" }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Learn", item: `${SITE_URL}/learn` },
        { "@type": "ListItem", position: 2, name: "Fitness Tips", item: `${SITE_URL}/tips` },
        { "@type": "ListItem", position: 3, name: tip.title, item: `${SITE_URL}${canonicalPath}` }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: tip.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a }
      }))
    }
  ];

  return (
    <SeoShell
      title={`${tip.title} | RecompOne`}
      description={tip.summary}
      canonicalPath={canonicalPath}
      jsonLd={jsonLd}
    >
      <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/learn" className="hover:text-foreground">Learn</Link>
        {" / "}
        <Link to="/tips" className="hover:text-foreground">Tips</Link>
      </nav>
      <span className="mt-3 block font-mono text-xs uppercase tracking-wider text-teal">Tip</span>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{tip.title}</h1>
      <p className="mt-3 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {tip.readTime} · Updated {tip.updated}
      </p>

      <p className="mt-6 text-base leading-relaxed text-foreground">{tip.intro}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        {tip.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-bold text-foreground">{section.heading}</h2>
            {section.paragraphs?.map((p, i) => (
              <p key={i} className="mt-2">{p}</p>
            ))}
            {section.list && (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {section.list.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <h2 className="text-xl font-bold text-foreground">Frequently asked questions</h2>
        {tip.faqs.map((f) => (
          <details key={f.q} className="rounded-lg border border-line bg-panel p-4">
            <summary className="min-h-11 cursor-pointer font-medium text-foreground">{f.q}</summary>
            <p className="mt-2">{f.a}</p>
          </details>
        ))}

        <p className="rounded-xl border border-teal/20 bg-teal/5 p-4">
          RecompOne turns your weight, waist, training, and adherence trends into one adaptive next
          move — so the tips you read here become a plan you can actually follow.{" "}
          <Link to="/coming-soon" className="font-semibold text-teal hover:underline">See how it works</Link>.
        </p>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Related tips</h2>
          <div className="mt-3 grid gap-3">
            {related.map((r) => (
              <Link key={r.slug} to={`/tips/${r.slug}`} className="block rounded-2xl border border-line bg-panel p-4 hover:border-teal/40">
                <h3 className="text-sm font-semibold">{r.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{r.summary}</p>
              </Link>
            ))}
          </div>
        </section>

        <p>
          <Link to="/tips" className="font-medium text-teal hover:underline">← Browse all fitness tips</Link>
        </p>
      </div>
    </SeoShell>
  );
}