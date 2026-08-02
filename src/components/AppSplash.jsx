import BrandMark from "@/components/BrandMark";

export default function AppSplash() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading RecompIQ"
      className="fixed inset-0 flex flex-col items-center justify-center bg-bg text-foreground"
    >
      <div className="relative flex items-center justify-center">
        <BrandMark className="h-16 w-16 rounded-2xl shadow-lg shadow-black/20" />
        <div className="absolute w-16 h-16 rounded-2xl border-2 border-teal/40 animate-ping" />
      </div>
      <div className="mt-5 font-semibold text-lg tracking-tight">RecompIQ</div>
      <div className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">adaptive recomposition</div>
    </div>
  );
}
