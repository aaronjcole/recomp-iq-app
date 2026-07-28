import { useState } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { recalculateTargets, GOAL_LABELS, COACH_TONES } from "@/lib/fitness";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { LogOut } from "lucide-react";

const GOAL_ORDER = ["fat_loss", "aggressive_fat_loss", "fat_loss_biased_recomp", "body_recomposition", "strength_retention_cut", "maintenance", "lean_bulk", "muscle_gain", "aggressive_gain"];

export default function Profile() {
  const { profile, preferences, strategy, updateProfile, updatePreferences, updateStrategy } = useRecomp();
  const [saving, setSaving] = useState(false);

  if (!profile) return null;

  const changeGoal = async (newGoal) => {
    setSaving(true);
    try {
      const updated = await updateProfile(profile.id, { goal: newGoal });
      const strat = recalculateTargets({ ...updated, goal: newGoal });
      await updateStrategy(strategy.id, { ...strat, goal_type: newGoal }, `Goal changed to ${GOAL_LABELS[newGoal].label}.`);
    } finally {
      setSaving(false);
    }
  };

  const changeTone = async (newTone) => {
    if (preferences) await updatePreferences(preferences.id, { tone: newTone });
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Profile & plan</h1>

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-2 text-sm">
          <div className="font-medium mb-1">You</div>
          <Row label="Age" value={profile.age} />
          <Row label="Sex" value={profile.sex} />
          <Row label="Height" value={`${profile.height_in} in`} />
          <Row label="Current weight" value={`${profile.current_weight_lbs} lb`} />
          {profile.goal_weight_lbs && <Row label="Goal weight" value={`${profile.goal_weight_lbs} lb`} />}
          <Row label="Activity" value={profile.job_activity.replace(/_/g, " ")} />
          <Row label="Avg steps" value={profile.average_steps} />
          <Row label="Training" value={`${profile.training_days_per_week} lift / ${profile.cardio_days_per_week} cardio`} />
          <Row label="Experience" value={profile.experience_level} />
        </CardContent>
      </Card>

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-4">
          <div className="font-medium">Adjust your goal</div>
          <div className="space-y-1.5">
            <Label>Goal</Label>
            <Select value={profile.goal} onValueChange={changeGoal} disabled={saving}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GOAL_ORDER.map((g) => (
                  <SelectItem key={g} value={g}>{GOAL_LABELS[g].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Coach tone</Label>
            <Select value={preferences?.tone ?? "direct"} onValueChange={changeTone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COACH_TONES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {strategy && (
        <Card className="bg-panel border-line">
          <CardContent className="p-5 space-y-2 text-sm">
            <div className="font-medium mb-1">Current targets</div>
            <Row label="Calories" value={`${strategy.calorie_target} kcal`} />
            <Row label="Protein" value={`${strategy.protein_target_g} g`} />
            <Row label="Carbs" value={`${strategy.carb_target_g} g`} />
            <Row label="Fat" value={`${strategy.fat_target_g} g`} />
            <Row label="Steps" value={strategy.step_target} />
            <Row label="Lifting days" value={strategy.lifting_days_target} />
            {strategy.behavior_focus && <Row label="Focus" value={strategy.behavior_focus} />}
          </CardContent>
        </Card>
      )}

      <Button variant="outline" className="w-full border-line text-muted-foreground" onClick={() => base44.auth.logout(window.location.origin)}>
        <LogOut className="w-4 h-4 mr-2" /> Log out
      </Button>
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