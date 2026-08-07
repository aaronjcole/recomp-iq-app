import { Crown } from "lucide-react";

export default function PremiumBadge({ label = "Premium" }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-questComplete px-2 py-1 text-label font-mono uppercase tracking-wide text-gold">
      <Crown className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}
