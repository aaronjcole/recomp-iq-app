export default function ConfidenceRing({ value, size = 120, stroke = 12, label }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const ringInner = (size - stroke * 2) / 2;
  const mask = `radial-gradient(circle, transparent ${ringInner}px, #000 ${ringInner + 0.5}px)`;

  return (
    <div
      className="inline-flex flex-col items-center"
      style={{ width: size }}
      role="img"
      aria-label={`${label || "Confidence"}: ${Math.round(v)} out of 100`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(var(--teal) ${v * 3.6}deg, var(--panel2) ${v * 3.6}deg 360deg)`,
            WebkitMask: mask,
            mask
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold leading-none tabular-nums">{Math.round(v)}</span>
        </div>
      </div>
      {label && (
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-2">{label}</span>
      )}
    </div>
  );
}
