import { useRecompActions } from "@/lib/RecompContext";
import StrengthProgressionCard from "@/components/training/StrengthProgressionCard";
import SessionBuilder from "@/components/training/SessionBuilder";
import SessionHistory from "@/components/training/SessionHistory";
import PullToRefresh from "@/components/common/PullToRefresh";

export default function Training() {
  const { reload } = useRecompActions();
  return (
    <PullToRefresh onRefresh={reload}>
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Training</h1>
        <StrengthProgressionCard />
        <SessionBuilder />
        <SessionHistory />
      </div>
    </PullToRefresh>
  );
}