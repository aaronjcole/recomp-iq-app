import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";
import { scoreNutritionQuality } from "@/lib/fitness";

const LABEL_LABELS = {
  high_satiety: "High satiety",
  balanced: "Balanced",
  energy_dense: "Energy dense",
  needs_context: "Needs context"
};

const LABEL_COLORS = {
  high_satiety: "text-green border-green/40",
  balanced: "text-teal border-teal/40",
  energy_dense: "text-gold border-gold/40",
  needs_context: "text-muted-foreground border-line"
};

/**
 * Renders the nutrition quality label badge and an expandable strengths/cautions
 * block for a food item. Uses the existing scoreNutritionQuality output — no
 * new computation. Free for all users.
 *
 * @param {object} props
 * @param {object} props.food — a FoodItem-like object with calories, protein_g, etc.
 * @param {boolean} [props.showScore] — include the numeric score in the badge (default true)
 */
export default function QualityScoreBadge({ food, showScore = true }) {
  const [open, setOpen] = useState(false);
  if (!food) return null;
  const q = scoreNutritionQuality(food);
  const hasCoaching = (q.strengths?.length ?? 0) > 0 || (q.cautions?.length ?? 0) > 0;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={hasCoaching ? () => setOpen((v) => !v) : undefined}
        className={`flex w-full items-center justify-between gap-2 ${hasCoaching ? "cursor-pointer" : "cursor-default"}`}
        aria-expanded={hasCoaching ? open : undefined}
      >
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={`shrink-0 ${LABEL_COLORS[q.label] ?? ""}`}
          >
            {LABEL_LABELS[q.label] ?? q.label}
          </Badge>
          {showScore && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {q.score}/100
            </span>
          )}
        </div>
        {hasCoaching && (
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        )}
      </button>
      {hasCoaching && open && (
        <div className="mt-2 space-y-1.5 pl-1">
          {q.strengths?.length > 0 && (
            <ul className="space-y-0.5">
              {q.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <span className="mt-0.5 text-green">+</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
          {q.cautions?.length > 0 && (
            <ul className="space-y-0.5">
              {q.cautions.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <span className="mt-0.5 text-gold">!</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}