import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Target } from "lucide-react";

const SITE_URL = "https://fitnesstrackerapps.com";

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

export default function LegalShell({ title, description, canonicalPath, updated, children }) {
  useEffect(() => {
    const fullTitle = `${title} | RecompOne`;
    const fullUrl = `${SITE_URL}${canonicalPath}`;
    document.title = fullTitle;
    upsertMeta("name", "description", description);
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", fullUrl);
    upsertMeta("property", "og:type", "website");
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", description);
    upsertLink("canonical", fullUrl);
  }, [title, description, canonicalPath]);

  return (
    <div className="min-h-screen bg-bg text-foreground">
      <header className="sticky top-0 z-40 backdrop-blur bg-bg/80 border-b border-lineSoft">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center gap-3">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium hover:opacity-80">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-teal flex items-center justify-center">
              <Target className="w-4 h-4 text-buttonText" />
            </div>
            <span className="font-semibold">RecompOne</span>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <article className="max-w-3xl mx-auto px-5 py-10 space-y-6 text-sm leading-relaxed">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {updated && <p className="text-muted-foreground -mt-3">Last updated: {updated}</p>}
          {children}
        </article>
      </main>
    </div>
  );
}