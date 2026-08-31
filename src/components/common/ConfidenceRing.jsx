import { motion, useReducedMotion } from "framer-motion";

const TONE_COLOR = {
  high: "var(--teal)",
  building: "var(--gold)",
  early: "var(--muted-foreground)"
};

export default function ConfidenceRing({ value, size = 120, stroke = 12, label, tone = "high" }) {
  const reduceMotion = useReducedMotion();
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = TONE_COLOR[tone] ?? TONE_COLOR.high;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - v / 100);

  return (
    <div
      className="inline-flex flex-col items-center"
      style={{ width: size }}
      role="img"
      aria-label={`${label || "Confidence"}: ${Math.round(v)} out of 100`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="-rotate-90" width={size} height={size} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--panel2)" strokeWidth={stroke} />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: reduceMotion ? offset : circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: reduceMotion ? 0 : 0.38, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold leading-none tabular-nums">{Math.round(v)}</span>
        </div>
      </div>
      {label && (
        <span className="mt-2 font-mono text-label uppercase tracking-wider text-muted-foreground">{label}</span>
      )}
    </div>
  );
}