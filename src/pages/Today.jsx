import { useState } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { Link } from "react-router-dom";
import ProgressRing from "@/components/common/ProgressRing";
import MacroBar from "@/components/common/MacroBar";
import QuickLogSheet from "@/components/today/QuickLogSheet";
import QuickLogCard from "@/components/today/QuickLogCard";
import HabitsCard from "@/components/today/HabitsCard";
import RecompSignalHero from "@/components/today/RecompSignalHero";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Check, ChevronRight, Bot } from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Today() {
  const { strategy, trend, quests, todayLog, sessions } = useRecomp();
  const [logOpen, setLogOpen] = useState(false);

  if (!strategy) return null;

  const consumed = {
    calories: todayLog?.calories ?? 0,
    protein: todayLog?.protein_g ?? 0,
    carbs: todayLog?.carbs_g ?? 0,
    fat: todayLog?.fat_g ?? 0,
    steps: todayLog?.steps ?? 0
  };
  const remaining = Math.max(0, strategy.calorie_target - consumed.calories);
  const workoutsThisWeek = sessions.filter((s) => s.date >= weekStart()).length;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{greeting()}</p>
        <h1 className="text-2xl font-bold">Today</h1>
      </div>

      <Card className="bg-panel border-line">
        <CardContent className="p-5 flex items-center gap-5">
          <ProgressRing
            value={consumed.calories}
            max={strategy.calorie_target}
            label={String(Math.round(consumed.calories))}
            sublabel={`of ${strategy.calorie_target}`}
          />
          <div className="flex-1 space-y-1">
            <div className="text-xs text-muted-foreground">Calories</div>
            <div className="text-xl font-bold">{remaining} left</div>
            <Button size="sm" className="mt-2 bg-teal text-buttonText hover:opacity-90" onClick={() => setLogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Log today
            </Button>
          </div>
        </CardContent>
      </Card>

      <QuickLogCard />

      <HabitsCard />

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-3">
          <MacroBar label="Protein" value={consumed.protein} target={strategy.protein_target_g} unit="g" colorClass="bg-teal" />
          <MacroBar label="Carbs" value={consumed.carbs} target={strategy.carb_target_g} unit="g" colorClass="bg-blue" />
          <MacroBar label="Fat" value={consumed.fat} target={strategy.fat_target_g} unit="g" colorClass="bg-gold" />
          <MacroBar label="Steps" value={consumed.steps} target={strategy.step_target} colorClass="bg-green" />
          <MacroBar label="Lifts this week" value={workoutsThisWeek} target={strategy.lifting_days_target} colorClass="bg-orange" />
        </CardContent>
      </Card>

      <RecompSignalHero />

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-3">
          <div className="font-medium">This week's quests</div>
          {quests.map((q) => (
            <div key={q.id} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${q.complete ? "bg-teal" : "bg-panel2 border border-line"}`}>
                {q.complete && <Check className="w-3 h-3 text-buttonText" />}
              </div>
              <div className="flex-1">
                <div className={`text-sm ${q.complete ? "text-muted-foreground line-through" : ""}`}>{q.title}</div>
                <div className="text-xs text-muted-foreground">{q.detail}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {trend && (
        <Card className="bg-panel border-line">
          <CardContent className="p-5 space-y-2 text-sm">
            <div className="font-medium mb-1">Latest read</div>
            <Row label="7-day avg weight" value={trend.avg_weight_current_7_day !== null ? `${trend.avg_weight_current_7_day} lb` : "—"} />
            <Row label="Weekly change" value={trend.weight_change_lbs !== null ? `${trend.weight_change_lbs > 0 ? "+" : ""}${trend.weight_change_lbs} lb` : "—"} />
            <Row label="Waist change" value={trend.waist_change_in !== null ? `${trend.waist_change_in} in` : "—"} />
            <Row label="Recovery" value={trend.recovery_label} />
            <Row label="Days logged" value={trend.days_logged} />
          </CardContent>
        </Card>
      )}

      <Link to="/coach">
        <Card className="bg-teal/10 border-teal/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Bot className="w-5 h-5 text-teal" />
            <div className="flex-1">
              <div className="text-sm font-medium">Ask your AI coach</div>
              <div className="text-xs text-muted-foreground">Specific guidance from your data</div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <QuickLogSheet open={logOpen} onOpenChange={setLogOpen} />
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}

function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}