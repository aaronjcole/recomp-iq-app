import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * Prominent "convert to signup" CTA used on SEO tool pages. Links to the
 * coming-soon waitlist via client-side navigation (no full reload).
 */
export default function SeoAppCta({
  title = "Get the full adaptive app",
  body = "RecompOne turns these numbers into weekly-adaptive nutrition and training plans that adjust to your real adherence, weight, and waist trends.",
  cta = "Join the waitlist"
}) {
  return (
    <section className="mt-10 rounded-2xl border border-teal/30 bg-gradient-to-br from-teal/10 to-panel p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal/15 text-teal">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>
      </div>
      <Link
        to="/coming-soon"
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal px-5 text-sm font-semibold text-buttonText hover:opacity-90"
      >
        {cta}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}