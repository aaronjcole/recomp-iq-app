// Encoded NASM OPT-model principles as plain structured JavaScript. Only
// widely-published framework principles (phase names, rep/set/rest ranges,
// movement patterns) — no proprietary NASM text. Offline, free, copyright-safe.
//
// Used by the adaptive training block generator to ground session design in
// recognized exercise-science progression rather than ad-hoc heuristics.

export const NASM_PHASES = Object.freeze({
  stabilization_endurance: {
    id: "stabilization_endurance",
    name: "Stabilization Endurance",
    description:
      "Build technique, joint stability, and movement control before adding load. High reps, slow tempo, short rest.",
    reps: "12–20",
    sets: "2–3",
    restSeconds: 30,
    tempo: "4-2-1",
    intensityRange: "50–70% 1RM",
    loadGuidance: "Light loads; focus on control and full range of motion."
  },
  strength_endurance: {
    id: "strength_endurance",
    name: "Strength Endurance",
    description:
      "Moderate loads with moderate reps to build work capacity and repeatability. A bridge between stability and hypertrophy.",
    reps: "8–12",
    sets: "2–4",
    restSeconds: 45,
    tempo: "2-0-2",
    intensityRange: "60–75% 1RM",
    loadGuidance: "Moderate loads; finish each set with 2–3 reps in reserve."
  },
  hypertrophy: {
    id: "hypertrophy",
    name: "Hypertrophy",
    description:
      "Moderate-to-heavy loads in a muscle-building rep range to drive size and structural adaptation.",
    reps: "6–12",
    sets: "3–5",
    restSeconds: 60,
    tempo: "2-0-2",
    intensityRange: "70–85% 1RM",
    loadGuidance: "Finish each set with 1–2 reps in reserve near the top of the range."
  },
  maximal_strength: {
    id: "maximal_strength",
    name: "Maximal Strength",
    description:
      "Heavy loads, low reps, long rest to improve force production and neural efficiency. For advanced trainees.",
    reps: "1–5",
    sets: "4–6",
    restSeconds: 180,
    tempo: "1-0-1",
    intensityRange: "85–100% 1RM",
    loadGuidance: "Heavy loads; reserve for experienced lifters with solid technique."
  },
  power: {
    id: "power",
    name: "Power",
    description:
      "Explosive execution with moderate-to-heavy loads to develop rate of force development. Peaks after a strength base.",
    reps: "3–8",
    sets: "3–5",
    restSeconds: 120,
    tempo: "1-0-X",
    intensityRange: "30–85% 1RM (varies by movement)",
    loadGuidance: "Move the load as fast as controlled technique allows."
  }
});

export const NASM_MOVEMENT_PATTERNS = Object.freeze([
  { id: "squat", name: "Squat / Knee-dominant", description: "Squat-pattern lower-body movements." },
  { id: "hinge", name: "Hinge / Hip-dominant", description: "Deadlift and hip-extension patterns." },
  { id: "lunge", name: "Lunge / Single-leg", description: "Split-stance and unilateral leg work." },
  { id: "push", name: "Push", description: "Horizontal and vertical pressing." },
  { id: "pull", name: "Pull", description: "Horizontal and vertical pulling." },
  { id: "rotation", name: "Rotation / Carry", description: "Anti-rotation, rotation, and loaded carries." },
  { id: "core", name: "Core", description: "Trunk stability and dynamic core work." }
]);

const GAIN_GOALS = new Set(["muscle_gain", "lean_bulk", "aggressive_gain"]);
const FAT_LOSS_GOALS = new Set([
  "fat_loss",
  "aggressive_fat_loss",
  "strength_retention_cut"
]);
const RECOMP_GOALS = new Set(["body_recomposition", "fat_loss_biased_recomp"]);

/**
 * Selects the NASM OPT phase appropriate for the user's goal and experience.
 * Beginners always start at Stabilization Endurance regardless of goal; advanced
 * trainees with gain goals can progress to Hypertrophy/Maximal Strength.
 *
 * @param {string} goal — one of the goal_type enum values
 * @param {string} experience — "beginner" | "intermediate" | "advanced"
 * @returns {object} the selected phase object from NASM_PHASES
 */
export function selectNasmPhase(goal, experience) {
  const exp = ["beginner", "intermediate", "advanced"].includes(experience)
    ? experience
    : "beginner";

  // Beginners build the stability base first, regardless of goal.
  if (exp === "beginner") {
    return NASM_PHASES.stabilization_endurance;
  }

  if (GAIN_GOALS.has(goal)) {
    if (exp === "advanced" && goal !== "lean_bulk") {
      return NASM_PHASES.maximal_strength;
    }
    return NASM_PHASES.hypertrophy;
  }

  if (FAT_LOSS_GOALS.has(goal)) {
    return NASM_PHASES.strength_endurance;
  }

  if (RECOMP_GOALS.has(goal)) {
    return exp === "advanced" ? NASM_PHASES.hypertrophy : NASM_PHASES.strength_endurance;
  }

  // maintenance
  return NASM_PHASES.strength_endurance;
}

/**
 * Returns the acute variables (reps, sets, rest, tempo, load) for a phase,
 * adjusted slightly for equipment — bodyweight training skews toward the
 * higher end of the rep range since absolute load is harder to add.
 *
 * @param {string} phaseId — key into NASM_PHASES
 * @param {string} equipment — "bodyweight_home" | "dumbbells" | "full_gym"
 * @returns {object} { phaseId, phaseName, reps, sets, restSeconds, tempo, intensityRange, loadGuidance, description }
 */
export function getNasmAcuteVariables(phaseId, equipment) {
  const phase = NASM_PHASES[phaseId] ?? NASM_PHASES.strength_endurance;
  const bodyweight = equipment === "bodyweight_home";

  // Bodyweight: favor the higher rep end and slightly shorter rest (tempo work).
  const reps = bodyweight
    ? phase.reps.replace(/(\d+)–(\d+)/, (_m, lo, hi) => `${lo}–${Number(hi) + 5}`)
    : phase.reps;
  const restSeconds = bodyweight ? Math.max(30, phase.restSeconds - 15) : phase.restSeconds;

  return {
    phaseId: phase.id,
    phaseName: phase.name,
    reps,
    sets: phase.sets,
    restSeconds,
    tempo: phase.tempo,
    intensityRange: phase.intensityRange,
    loadGuidance: phase.loadGuidance,
    description: phase.description
  };
}