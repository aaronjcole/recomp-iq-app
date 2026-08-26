import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Target } from "lucide-react";
import BrandMark from "@/components/BrandMark";

const SITE_URL = "https://fitnesstrackerapps.com";

const NAV_LINKS = [
  { to: "/tools/tdee-calculator", label: "TDEE Calculator" },
  { to: "/tools/macro-calculator", label: "Macro Calculator" },
  { to: "/learn", label: "Learn" },
  { to: "/tips", label: "Tips" },
  { to: "/locations", label: "Locations" }
];

function upsertMeta(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel, href) {
  if (!href) return;
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Shared shell for web-only SEO/GEO pages. Injects per-page meta tags and
 * JSON-LD structured data on mount, renders a consistent header/footer, and
 * wraps article content in a semantic container. These pages are public and
 * intentionally excluded from the app's bottom navigation.
 */
export default function SeoShell({ title, description, canonicalPath, jsonLd, children }) {
  useEffect(() => {
    const fullUrl = `${SITE_URL}${canonicalPath}`;
    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", fullUrl);
    upsertMeta("property", "og:type", "website");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertLink("canonical", fullUrl);

    const scripts = (jsonLd ?? []).map((data) => {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.text = JSON.stringify(data);
      s.dataset.seoShell = "true";
      document.head.appendChild(s);
      return s;
    });

    return () => {
      scripts.forEach((s) => s.remove());
    };
  }, [title, description, canonicalPath, jsonLd]);

  return (
    <div className="min-h-screen bg-bg text-foreground">
      <header className="sticky top-0 z-40 border-b border-lineSoft bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-5">
          <Link to="/" className="flex min-h-11 items-center gap-2" aria-label="RecompOne home">
            <BrandMark className="h-8 w-8 rounded-lg" />
            <span className="font-semibold">RecompOne</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 sm:flex" aria-label="SEO pages">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="min-h-11 content-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <Link
            to="/coming-soon"
            className="ml-auto min-h-11 content-center rounded-lg bg-teal px-4 text-sm font-semibold text-buttonText sm:ml-2"
          >
            Get the app
          </Link>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <article className="mx-auto max-w-3xl px-5 py-10 sm:py-14">{children}</article>
      </main>

      <footer className="border-t border-lineSoft">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-5 py-8 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal">
              <Target className="h-3.5 w-3.5 text-buttonText" aria-hidden="true" />
            </div>
            <span>© {new Date().getFullYear()} RecompOne</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-end">
            {NAV_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="min-h-11 content-center hover:text-foreground">
                {link.label}
              </Link>
            ))}
            <Link to="/privacy" className="min-h-11 content-center hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="min-h-11 content-center hover:text-foreground">Terms</Link>
            <span>Educational guidance, not medical advice.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export { SITE_URL };