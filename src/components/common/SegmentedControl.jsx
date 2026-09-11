import { cn } from "@/lib/utils";

/**
 * A pill-style segmented switch. The active segment fills with panel2 against
 * a panel track, matching the bottom-nav active-pill language. Used for the
 * Fuel page segments and the log sheet Simple/Full toggle.
 *
 * @param {{ options: { value: string, label: string }[], value: string, onChange: (value: string) => void, className?: string, size?: "sm" | "md" }} props
 */
export default function SegmentedControl({ options, value, onChange, className, size = "md" }) {
  const pad = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm";
  return (
    <div
      role="tablist"
      aria-label="View switch"
      className={cn(
        "inline-flex w-full items-center gap-1 rounded-xl border border-line bg-panel/60 p-1",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              pad,
              active
                ? "bg-panel2 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}