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
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { LogOut, Trash2 } from "lucide-react";
import ChildTopBar from "@/components/ChildTopBar";
import { deletePhotosForUser } from "@/lib/progressPhotos";

const GOAL_ORDER = ["fat_loss", "aggressive_fat_loss", "fat_loss_biased_recomp", "body_recomposition", "strength_retention_cut", "maintenance", "lean_bulk", "muscle_gain", "aggressive_gain"];

export default function Profile() {
  const { profile, preferences, strategy, updateProfile, updatePreferences, updateStrategy } = useRecomp();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!profile) return null;

  const changeGoal = async (newGoal) => {
    setSaving(true);
    try {
      const updated = await updateProfile(profile.id, { goal: newGoal });
      const strat = recalculateTargets({ ...updated, goal: newGoal }, preferences ?? {});
      await updateStrategy(strategy.id, { ...strat, goal_type: newGoal }, `Goal changed to ${GOAL_LABELS[newGoal].label}.`);
    } finally {
      setSaving(false);
    }
  };

  const changeTone = async (newTone) => {
    if (preferences) await updatePreferences(preferences.id, { tone: newTone });
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const me = await base44.auth.me();
      if (!me?.id) throw new Error("Could not verify the signed-in account");

      const response = await base44.functions.invoke("deleteAccount", { confirmation: "DELETE" });
      if (!response.data?.ok) throw new Error("Account deletion was not confirmed");

      const localCleanup = await Promise.allSettled([deletePhotosForUser(me.id)]);
      if (localCleanup.some((result) => result.status === "rejected")) {
        console.error("Account deleted, but local progress-photo cleanup failed", localCleanup);
      }

      try {
        for (const key of [
          `recompiq_bf_scan_${me.id}`,
          `recomp-grocery-checked-${me.id}`,
          "recompiq_onboarding_v1",
          "recomp-demo-ids"
        ]) {
          localStorage.removeItem(key);
        }
      } catch {
        // The hosted account is already deleted; logout must still complete.
      }

      base44.auth.logout(window.location.origin);
    } catch (e) {
      const serverMessage = e?.response?.data?.error;
      toast({
        title: "Could not delete account",
        description: serverMessage || "Please try again. If the problem continues, contact support."
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <ChildTopBar title="Profile & plan" />

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

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" disabled={deleting} className="w-full border-destructive/30 text-destructive hover:bg-destructive/10">
            <Trash2 className="w-4 h-4 mr-2" /> Delete account
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes your RecompIQ account and data. This action can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={deleteAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
