import DecisionLedgerTimeline from "@/components/common/DecisionLedgerTimeline";
import ChildTopBar from "@/components/ChildTopBar";

export default function DecisionHistory() {
  return (
    <div>
      <ChildTopBar title="Decision history" />
      <p className="text-xs text-muted-foreground mb-4">
        Every plan adjustment — from weekly check-ins or custom target changes — is logged here with the reason.
      </p>
      <DecisionLedgerTimeline />
    </div>
  );
}