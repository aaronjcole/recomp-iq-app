import SeoShell, { SITE_URL } from "@/components/seo/SeoShell";
import { Link, useParams } from "react-router-dom";
import { MapPin, ArrowLeft } from "lucide-react";
import { findLocation, locations } from "@/lib/seo/locationsData";

export default function LocationPage() {
  const { slug } = useParams();
  const loc = findLocation(slug);

  if (!loc) {
    return (
      <SeoShell
        title="Location Not Found | RecompOne"
        description="The city page you're looking for doesn't exist."
        canonicalPath={`/locations/${slug || "unknown"}`}
      >
        <h1 className="text-3xl font-bold tracking-tight">Location not found</h1>
        <p className="mt-3 text-muted-foreground">
          We don't have a page for that city yet. Browse all available{" "}
          <Link to="/locations" className="font-medium text-teal hover:underline">locations</Link>.
        </p>
      </SeoShell>
    );
  }

  const nearby = locations.filter((l) => l.slug !== loc.slug).slice(0, 4);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: `RecompOne — ${loc.city}`,
      areaServed: { "@type": "City", name: loc.city },
      address: { "@type": "PostalAddress", addressLocality: loc.city, addressRegion: loc.state },
      url: `${SITE_URL}/locations/${loc.slug}`,
      description: loc.blurb
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Locations", item: `${SITE_URL}/locations` },
        { "@type": "ListItem", position: 2, name: `${loc.city}, ${loc.state}`, item: `${SITE_URL}/locations/${loc.slug}` }
      ]
    }
  ];

  return (
    <SeoShell
      title={`Body Recomposition in ${loc.city}, ${loc.state} | RecompOne`}
      description={`Adaptive body recomposition, nutrition, and training guidance for ${loc.city}, ${loc.state} residents. RecompOne turns your fitness data into one clear next move.`}
      canonicalPath={`/locations/${loc.slug}`}
      jsonLd={jsonLd}
    >
      <Link to="/locations" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All locations
      </Link>

      <div className="mt-4 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10 text-teal">
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="font-mono text-xs uppercase tracking-wider text-teal">{loc.city}, {loc.state}</span>
      </div>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Body Recomposition in {loc.city}, {loc.state}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">{loc.blurb}</p>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-xl font-bold text-foreground">How {loc.city} residents use RecompOne</h2>
        <p>
          RecompOne is a digital companion, so there's nothing to pick up and no appointment to
          book. {loc.city} users log nutrition, training, recovery, and body-trend data on their
          phone, and RecompOne turns that data into one evidence-backed next move each week —
          whether that's holding the plan, adjusting calories, or focusing on adherence.
        </p>
        <p>
          Because the guidance adapts to your real progress rather than a generic template, it
          works whether you train at a {loc.neighborhoods[0]} gym, run through {loc.neighborhoods[1]},
          or work out at home. The signals that matter — weight trend, waist, step consistency,
          training load, and recovery — are the same everywhere.
        </p>

        <h2 className="pt-2 text-xl font-bold text-foreground">Getting started in {loc.city}</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Calculate your starting calorie and macro targets with our free <Link to="/tools/tdee-calculator" className="font-medium text-teal hover:underline">TDEE calculator</Link>.</li>
          <li>Read the <Link to="/learn/body-recomposition-guide" className="font-medium text-teal hover:underline">body recomposition guide</Link> to understand what to expect.</li>
          <li>Track your weight, waist, and training for two to three weeks to establish a baseline.</li>
          <li>Let RecompOne read your trends and recommend the next adjustment.</li>
        </ol>

        <h2 className="pt-2 text-xl font-bold text-foreground">Areas we serve in {loc.city}</h2>
        <p>
          RecompOne is fully digital, but these {loc.city} neighborhoods are home to active
          communities already tracking their progress:
        </p>
        <ul className="flex flex-wrap gap-2">
          {loc.neighborhoods.map((n) => (
            <li key={n} className="rounded-full border border-line bg-panel px-3 py-1 text-xs">{n}</li>
          ))}
        </ul>
      </section>

      <p className="mt-8 rounded-xl border border-teal/20 bg-teal/5 p-4 text-sm">
        Ready to start? <Link to="/coming-soon" className="font-semibold text-teal hover:underline">Get RecompOne</Link>{" "}
        and turn your {loc.city} training and nutrition data into adaptive guidance.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Other locations</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {nearby.map((n) => (
            <Link key={n.slug} to={`/locations/${n.slug}`} className="block rounded-xl border border-line bg-panel px-4 py-3 text-sm hover:border-teal/40">
              {n.city}, {n.state}
            </Link>
          ))}
        </div>
      </section>
    </SeoShell>
  );
}