const OPTIONS = [1, 2, 3, 4, 5];

export default function RatingControl({ label, value, onChange }) {
  return (
    <div className="space-y-1.5 col-span-2">
      <span className="text-sm font-medium leading-none">{label}</span>
      <div className="flex gap-1.5" role="group" aria-label={label}>
        {OPTIONS.map((n) => {
          const selected = Number(value) === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={selected}
              aria-label={`${label} ${n}`}
              onClick={() => onChange(n)}
              className={`h-11 min-h-11 min-w-11 flex-1 rounded-lg border text-sm font-mono font-bold tabular-nums transition-colors ${
                selected
                  ? "border-teal bg-teal/10 text-teal"
                  : "border-line bg-panel2 text-muted-foreground hover:bg-panel3"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}