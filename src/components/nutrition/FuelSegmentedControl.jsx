const SEGMENTS = [
  { value: "diary", label: "Diary" },
  { value: "library", label: "Library" },
  { value: "tools", label: "Tools" },
];

/**
 * A low-emphasis segmented control for the Fuel page, styled to match the
 * bottom-nav active-pill pattern using existing RecompOne tokens.
 */
export default function FuelSegmentedControl({ value, onChange }) {
  return (
    <div className="flex gap-1 rounded-lg bg-panel2 p-1" role="tablist" aria-label="Fuel sections">
      {SEGMENTS.map((seg) => {
        const active = value === seg.value;
        return (
          <button
            key={seg.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(seg.value)}
            className={`flex-1 min-h-11 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-panel text-teal shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}