import { useState } from "react";
import { useRecomp } from "@/lib/RecompContext";
import { recalculateTargets, GOAL_LABELS, COACH_TONES, JOB_ACTIVITY_LABELS } from "@/lib/fitness";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
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
import { LogOut, Trash2, Pencil, Loader2 } from "lucide-react";
import ChildTopBar from "@/components/ChildTopBar";
import { deletePhotosForUser } from "@/lib/progressPhotos";
import { planCacheKeysForUser } from "@/lib/planCache";
import {
  BIOMETRIC_RANGES,
  inBiometricRange,
  optionalInBiometricRange
} from "@/lib/biometricRanges";

// The five targets a user can author by hand in CustomTargetsCard. While
// strategy.manual_override is on they belong to the user, so recalculating from
// biometrics must leave them alone.
const MANUAL_TARGET_KEYS = [
  "calorie_target",
  "protein_target_g",
  "carb_target_g",
  "fat_target_g",
  "step_target"
];

const GOAL_ORDER =["fat_loss", "aggressive_fat_loss", "fat_loss_biased_recomp", "body_recomposition", "strength_retention_cut", "maintenance", "lean_bulk", "muscle_gain", "aggressive_gain"];

const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "unspecified", label: "Unspecified" }
];

const EXPERIENCE_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" }
];

export default function Profile() {
  const { profile, preferences, strategy, updateProfile, updatePreferences, updateStrategy } = useRecomp();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(null);
  const [bioSaving, setBioSaving] = useState(false);

  if (!profile) return null;

  const startEdit = () => {
    setDraft({
      age: String(profile.age ?? ""),
      sex: profile.sex ?? "male",
      height_in: String(profile.height_in ?? ""),
      current_weight_lbs: String(profile.current_weight_lbs ?? ""),
      goal_weight_lbs: String(profile.goal_weight_lbs ?? ""),
      job_activity: profile.job_activity ?? "sedentary",
      average_steps: String(profile.average_steps ?? ""),
      training_days_per_week: String(profile.training_days_per_week ?? ""),
      cardio_days_per_week: String(profile.cardio_days_per_week ?? ""),
      experience_level: profile.experience_level ?? "beginner"
    });
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setDraft(null);
  };

  const setDraftField = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  // Every field the biometrics editor can write, checked against the same bounds
  // onboarding enforces. Without this a cleared input saved as 0 and silently
  // recomputed the user's targets from it (0 lb bodyweight => 0 g protein).
  const bioInvalid = draft
    ? {
        age: !inBiometricRange("age", draft.age),
        height_in: !inBiometricRange("height_in", draft.height_in),
        current_weight_lbs: !inBiometricRange("current_weight_lbs", draft.current_weight_lbs),
        goal_weight_lbs: !optionalInBiometricRange("goal_weight_lbs", draft.goal_weight_lbs),
        average_steps: !inBiometricRange("average_steps", draft.average_steps),
        training_days_per_week: !inBiometricRange(
          "training_days_per_week",
          draft.training_days_per_week
        ),
        cardio_days_per_week: !inBiometricRange("cardio_days_per_week", draft.cardio_days_per_week)
      }
    : {};
  const bioHasErrors = Object.values(bioInvalid).some(Boolean);
  const ringIf = (invalid) => (invalid ? "ring-1 ring-destructive border-destructive" : "");

  const saveEdits = async () => {
    if (bioHasErrors) return;
    setBioSaving(true);
    try {
      const profileData = {
        age: Number(draft.age),
        sex: draft.sex,
        height_in: Number(draft.height_in),
        current_weight_lbs: Number(draft.current_weight_lbs),
        goal_weight_lbs: draft.goal_weight_lbs ? Number(draft.goal_weight_lbs) : undefined,
        job_activity: draft.job_activity,
        average_steps: Number(draft.average_steps),
        training_days_per_week: Number(draft.training_days_per_week),
        cardio_days_per_week: Number(draft.cardio_days_per_week),
        experience_level: draft.experience_level
      };
      const updated = await updateProfile(profile.id, profileData);
      const manual = Boolean(strategy?.manual_override);
      if (strategy?.id) {
        const strat = recalculateTargets({ ...updated, goal: profile.goal }, preferences ?? {});
        // In manual mode the user's own calorie/macro/step numbers must survive a
        // biometrics edit — the same invariant the weekly check-in enforces.
        if (manual) {
          for (const key of MANUAL_TARGET_KEYS) delete strat[key];
        }
        await updateStrategy(
          strategy.id,
          { ...strat, goal_type: profile.goal },
          manual ? "Biometrics updated. Custom targets kept." : "Biometrics updated."
        );
      }
      toast({
        title: "Biometrics saved",
        description: manual ? "Your custom targets were kept." : undefined
      });
      setEditMode(false);
      setDraft(null);
    } catch {
      toast({ title: "Could not save biometrics", description: "Please try again." });
    } finally {
      setBioSaving(false);
    }
  };

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
        // Legacy storage identifiers remain part of account cleanup after the RecompOne rebrand.
        for (const key of [
          `recompiq_bf_scan_${me.id}`,
          `recomp-grocery-checked-${me.id}`,
          ...planCacheKeysForUser(me.id),
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
          <div className="flex items-center justify-between mb-1">
            <div className="font-medium">You</div>
            {!editMode && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
                onClick={startEdit}
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Edit biometrics
              </Button>
            )}
          </div>

          {editMode && draft ? (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-age">Age</Label>
                  <Input
                    id="edit-age"
                    type="number"
                    inputMode="numeric"
                    min={BIOMETRIC_RANGES.age[0]}
                    max={BIOMETRIC_RANGES.age[1]}
                    value={draft.age}
                    onChange={(e) => setDraftField("age", e.target.value)}
                    className={ringIf(bioInvalid.age)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-sex">Sex</Label>
                  <AdaptiveSelect
                    id="edit-sex"
                    value={draft.sex}
                    onValueChange={(v) => setDraftField("sex", v)}
                    drawerTitle="Sex"
                    options={SEX_OPTIONS}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-height">Height (inches)</Label>
                <Input
                  id="edit-height"
                  type="number"
                  inputMode="decimal"
                  min={BIOMETRIC_RANGES.height_in[0]}
                  max={BIOMETRIC_RANGES.height_in[1]}
                  // Tenths are legitimate here — metric onboarding stores them.
                  step={0.1}
                  value={draft.height_in}
                  onChange={(e) => setDraftField("height_in", e.target.value)}
                  className={ringIf(bioInvalid.height_in)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-cw">Current weight (lb)</Label>
                  <Input
                    id="edit-cw"
                    type="number"
                    inputMode="decimal"
                    min={BIOMETRIC_RANGES.current_weight_lbs[0]}
                    max={BIOMETRIC_RANGES.current_weight_lbs[1]}
                    value={draft.current_weight_lbs}
                    onChange={(e) => setDraftField("current_weight_lbs", e.target.value)}
                    className={ringIf(bioInvalid.current_weight_lbs)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-gw">Goal weight (lb)</Label>
                  <Input
                    id="edit-gw"
                    type="number"
                    inputMode="decimal"
                    min={BIOMETRIC_RANGES.goal_weight_lbs[0]}
                    max={BIOMETRIC_RANGES.goal_weight_lbs[1]}
                    placeholder="Optional"
                    value={draft.goal_weight_lbs}
                    onChange={(e) => setDraftField("goal_weight_lbs", e.target.value)}
                    className={ringIf(bioInvalid.goal_weight_lbs)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-activity">Daily job activity</Label>
                <AdaptiveSelect
                  id="edit-activity"
                  value={draft.job_activity}
                  onValueChange={(v) => setDraftField("job_activity", v)}
                  drawerTitle="Daily job activity"
                  options={Object.entries(JOB_ACTIVITY_LABELS).map(([k, label]) => ({ value: k, label }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-steps">Avg daily steps</Label>
                <Input
                  id="edit-steps"
                  type="number"
                  inputMode="numeric"
                  min={BIOMETRIC_RANGES.average_steps[0]}
                  max={BIOMETRIC_RANGES.average_steps[1]}
                  value={draft.average_steps}
                  onChange={(e) => setDraftField("average_steps", e.target.value)}
                  className={ringIf(bioInvalid.average_steps)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-lift">Lifting days / wk</Label>
                  <Input
                    id="edit-lift"
                    type="number"
                    inputMode="numeric"
                    min={BIOMETRIC_RANGES.training_days_per_week[0]}
                    max={BIOMETRIC_RANGES.training_days_per_week[1]}
                    value={draft.training_days_per_week}
                    onChange={(e) => setDraftField("training_days_per_week", e.target.value)}
                    className={ringIf(bioInvalid.training_days_per_week)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-cardio">Cardio days / wk</Label>
                  <Input
                    id="edit-cardio"
                    type="number"
                    inputMode="numeric"
                    min={BIOMETRIC_RANGES.cardio_days_per_week[0]}
                    max={BIOMETRIC_RANGES.cardio_days_per_week[1]}
                    value={draft.cardio_days_per_week}
                    onChange={(e) => setDraftField("cardio_days_per_week", e.target.value)}
                    className={ringIf(bioInvalid.cardio_days_per_week)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-exp">Experience</Label>
                <AdaptiveSelect
                  id="edit-exp"
                  value={draft.experience_level}
                  onValueChange={(v) => setDraftField("experience_level", v)}
                  drawerTitle="Experience"
                  options={EXPERIENCE_OPTIONS}
                />
              </div>

              {bioHasErrors && (
                <p className="text-xs text-red">
                  Check the highlighted fields — one is missing or out of range.
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  className="flex-1 bg-teal text-buttonText hover:opacity-90 min-h-11 disabled:cursor-not-allowed"
                  disabled={bioSaving || bioHasErrors}
                  onClick={saveEdits}
                >
                  {bioSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-line min-h-11"
                  disabled={bioSaving}
                  onClick={cancelEdit}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Row label="Age" value={profile.age} />
              <Row label="Sex" value={profile.sex} />
              {/* Number() drops a trailing ".0" so whole inches still read "70 in". */}
              <Row label="Height" value={`${Number(profile.height_in)} in`} />
              <Row label="Current weight" value={`${profile.current_weight_lbs} lb`} />
              {profile.goal_weight_lbs && <Row label="Goal weight" value={`${profile.goal_weight_lbs} lb`} />}
              <Row label="Activity" value={profile.job_activity.replace(/_/g, " ")} />
              <Row label="Avg steps" value={profile.average_steps} />
              <Row label="Training" value={`${profile.training_days_per_week} lift / ${profile.cardio_days_per_week} cardio`} />
              <Row label="Experience" value={profile.experience_level} />
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-panel border-line">
        <CardContent className="p-5 space-y-4">
          <div className="font-medium">Adjust your goal</div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-goal">Goal</Label>
            <AdaptiveSelect
              id="profile-goal"
              value={profile.goal}
              onValueChange={changeGoal}
              disabled={saving}
              drawerTitle="Goal"
              options={GOAL_ORDER.map((goal) => ({ value: goal, label: GOAL_LABELS[goal].label }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coach-tone">Coach tone</Label>
            <AdaptiveSelect
              id="coach-tone"
              value={preferences?.tone ?? "direct"}
              onValueChange={changeTone}
              drawerTitle="Coach tone"
              options={COACH_TONES.map((tone) => ({
                value: tone,
                label: <span className="capitalize">{tone.replace("_", " ")}</span>
              }))}
            />
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
              This removes your RecompOne account, hosted records, and progress photos
              stored in this browser. Files previously submitted for optional AI analysis follow
              the provider retention terms described in the Privacy Policy. This action can't be
              undone.
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
