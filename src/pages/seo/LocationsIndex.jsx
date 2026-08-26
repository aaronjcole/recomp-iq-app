import SeoShell, { SITE_URL } from "@/components/seo/SeoShell";
import { Link } from "react-router-dom";
import { MapPin, ArrowRight } from "lucide-react";
import { locations } from "@/lib/seo/locationsData";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  itemListElement: locations.map((loc, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: `Body recomposition coaching resources — ${loc.city}, ${loc.state}`,
    url: `${SITE_URL}/locations/${loc.slug}`
  }))
};

export default function LocationsIndex() {
  return (
    <SeoShell
      title="Body Recomposition Resources by City | RecompOne"
      description="Find adaptive body recomposition, nutrition, and training guidance for your city. RecompOne helps residents across the U.S. turn fitness data into one clear next move."
      canonicalPath="/locations"
      jsonLd={[jsonLd]}
    >
      <span className="font-mono text-xs uppercase tracking-wider text-teal">Local resources</span>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Body Recomposition Resources by City</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        RecompOne is a digital companion — your data lives on your device and travels with you. These
        city pages highlight how residents across the U.S. use adaptive nutrition and training
        guidance to pursue body recomposition.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {locations.map((loc) => (
          <Link
            key={loc.slug}
            to={`/locations/${loc.slug}`}
            className="block rounded-2xl border border-line bg-panel p-5 hover:border-teal/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal/10 text-teal">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-semibold">{loc.city}, {loc.state}</h2>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{loc.blurb}</p>
                </div>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>
          </Link>
        ))}
      </div>
    </SeoShell>
  );
}