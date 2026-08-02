import { Link } from "react-router-dom";
import { ArrowLeft, Target } from "lucide-react";

export default function LegalShell({ title, updated, children }) {
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
            <span className="font-semibold">RecompIQ</span>
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
