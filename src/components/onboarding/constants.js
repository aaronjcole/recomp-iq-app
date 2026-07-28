export const GOAL_ORDER = [
  "fat_loss",
  "aggressive_fat_loss",
  "fat_loss_biased_recomp",
  "body_recomposition",
  "strength_retention_cut",
  "maintenance",
  "lean_bulk",
  "muscle_gain",
  "aggressive_gain"
];

export const SAFETY_FLAGS = [
  { id: "medical_condition", label: "Diagnosed medical condition" },
  { id: "eating_disorder_history", label: "History of disordered eating" },
  { id: "pregnancy", label: "Currently pregnant or breastfeeding" },
  { id: "medication", label: "On weight-affecting medication" }
];

export const DIET_STYLES = [
  "No restriction",
  "Omnivore",
  "Vegetarian",
  "Vegan",
  "Pescatarian",
  "Lower-carb",
  "Mediterranean",
  "Other"
];

export const PREFERRED_TRAINING = [
  "Full-body",
  "Upper-lower",
  "Push-pull-legs",
  "Home",
  "Gym",
  "Bodyweight"
];

export const DISLIKED_STRATEGIES = [
  "Long cardio",
  "Fasted training",
  "Very low carb",
  "Strict meal timing",
  "Tracking every bite",
  "Cutting out food groups"
];

export const KNOWN_BARRIERS = [
  "Limited time",
  "Travel often",
  "Shift work",
  "Frequent eating out",
  "Stress/emotional eating",
  "Cooking skills",
  "Budget"
];

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

export const EXPERIENCE_LABELS = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced"
};

export const toneLabel = (t) =>
  t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());