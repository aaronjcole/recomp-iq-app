import { useRef } from "react";

const SEGMENTS = [
  { value: "diary", label: "Diary" },
  { value: "library", label: "Library" },
  { value: "tools", label: "Tools" },
];

// Stable ids shared with the page that renders the panels, so `aria-controls`
// and `aria-labelledby` stay wired to each other from one source of truth.
export const fuelTabId = (value) => `fuel-tab-${value}`;
export const fuelPanelId = (value) => `fuel-panel-${value}`;

/**
 * A low-emphasis segmented control for the Fuel page, styled to match the
 * bottom-nav active-pill pattern using existing RecompOne tokens.
 *
 * Implements the WAI-ARIA Tabs pattern with automatic activation: a roving
 * tabindex keeps one tab in the tab order, and Arrow/Home/End move focus and
 * select in the same step, which matches the existing click-to-switch
 * behavior.
 */
export default function FuelSegmentedControl({ value, onChange }) {
  const tabRefs = useRef({});

  const selectByIndex = (index) => {
    const next = SEGMENTS[index].value;
    onChange(next);
    // Programmatic focus works even while the target still carries
    // tabIndex={-1} from the previous render.
    tabRefs.current[next]?.focus();
  };

  const handleKeyDown = (event) => {
    const count = SEGMENTS.length;
    const current = Math.max(0, SEGMENTS.findIndex((seg) => seg.value === value));
    let next;
    if (event.key === "ArrowRight") next = (current + 1) % count;
    else if (event.key === "ArrowLeft") next = (current - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else return;
    event.preventDefault();
    selectByIndex(next);
  };

  return (
    <div
      className="flex gap-1 rounded-lg bg-panel2 p-1"
      role="tablist"
      aria-label="Fuel sections"
      onKeyDown={handleKeyDown}
    >
      {SEGMENTS.map((seg) => {
        const active = value === seg.value;
        return (
          <button
            key={seg.value}
            ref={(node) => {
              tabRefs.current[seg.value] = node;
            }}
            id={fuelTabId(seg.value)}
            role="tab"
            aria-selected={active}
            aria-controls={fuelPanelId(seg.value)}
            tabIndex={active ? 0 : -1}
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
