import SeoShell, { SITE_URL } from "@/components/seo/SeoShell";
import { Link } from "react-router-dom";
import { BookOpen, Calculator, MapPin, ArrowRight } from "lucide-react";

const ARTICLES = [
  {
    to: "/learn/body-recomposition-guide",
    title: "Body Recomposition: The Complete Guide",
    summary: "What body recomposition is, who it works for, and how to tell whether you're losing fat, building muscle, or both."
  }
];

const TOOLS = [
  { to: "/tools/tdee-calculator", title: "TDEE Calculator", summary: "Estimate your daily calorie burn with the Mifflin-St Jeor equation." },
  { to: "/tools/macro-calculator", title: "Macro Calculator", summary: "Turn your calorie target into a balanced protein, carb, and fat split." }
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Learn", item: `${SITE_URL}/learn` }
  ]
};

export default function LearnIndex() {
  return (
    <SeoShell
      title="Learn Body Recomposition, Nutrition & Training | RecompOne"
      description="Free guides and tools on body recomposition, TDEE, macros, and adaptive training. Learn how to read your progress data and make evidence-backed adjustments."
      canonicalPath="/learn"
      jsonLd={[jsonLd]}
    >
      <span className="font-mono text-xs uppercase tracking-wider text-teal">Learning hub</span>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Learn</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
        Evidence-based guides and free tools to help you understand body recomposition, nutrition,
        and training — without the hype.
      </p>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpen className="h-5 w-5 text-teal" aria-hidden="true" /> Guides</h2>
        <div className="mt-3 grid gap-3">
          {ARTICLES.map((a) => (
            <Link key={a.to} to={a.to} className="block rounded-2xl border border-line bg-panel p-5 hover:border-teal/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{a.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{a.summary}</p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Calculator className="h-5 w-5 text-teal" aria-hidden="true" /> Free tools</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <Link key={t.to} to={t.to} className="block rounded-2xl border border-line bg-panel p-5 hover:border-teal/40">
              <h3 className="font-semibold">{t.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.summary}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><MapPin className="h-5 w-5 text-teal" aria-hidden="true" /> Local resources</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Looking for recomposition guidance in your area? Browse our{" "}
          <Link to="/locations" className="font-medium text-teal hover:underline">city resource pages</Link>.
        </p>
      </section>
    </SeoShell>
  );
}