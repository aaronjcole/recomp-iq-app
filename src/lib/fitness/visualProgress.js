const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export class VisualComparisonError extends Error {
  constructor(message) {
    super(message);
    this.name = "VisualComparisonError";
  }
}

function dateValue(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new VisualComparisonError("Progress photos need a valid date.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new VisualComparisonError("Progress photos need a valid date.");
  }
  return timestamp;
}

function validPhoto(photo) {
  if (!photo || typeof photo !== "object" || typeof photo.id !== "string" || !photo.id.trim()) {
    throw new VisualComparisonError("Choose two saved progress photos.");
  }
  return photo;
}

function normalizedPose(value) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function finiteWeight(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildVisualComparison(firstPhoto, secondPhoto) {
  const first = validPhoto(firstPhoto);
  const second = validPhoto(secondPhoto);
  if (first.id === second.id) {
    throw new VisualComparisonError("Choose two different progress photos.");
  }
  if (first.userId && second.userId && first.userId !== second.userId) {
    throw new VisualComparisonError("Progress photos must belong to the same account.");
  }

  const firstTime = dateValue(first.date);
  const secondTime = dateValue(second.date);
  const [earlier, later, earlierTime, laterTime] = firstTime <= secondTime
    ? [first, second, firstTime, secondTime]
    : [second, first, secondTime, firstTime];
  const daysApart = Math.round((laterTime - earlierTime) / DAY_MS);
  const earlierPose = normalizedPose(earlier.pose);
  const laterPose = normalizedPose(later.pose);
  const poseMatch = Boolean(earlierPose && laterPose && earlierPose === laterPose);
  const earlierWeight = finiteWeight(earlier.weight_lbs);
  const laterWeight = finiteWeight(later.weight_lbs);
  const weightDeltaLbs = earlierWeight === null || laterWeight === null
    ? null
    : Math.round((laterWeight - earlierWeight) * 10) / 10;

  const guidance = [];
  let readiness = "ready";
  if (!poseMatch) {
    readiness = "needs_alignment";
    guidance.push("Use the same pose for a more consistent visual comparison.");
  } else if (daysApart < 7) {
    readiness = "early";
    guidance.push("This is a short interval; compare again after at least one week.");
  } else {
    guidance.push("Look for broad changes in shape, fit, and posture rather than a single-day fluctuation.");
  }
  guidance.push("For future photos, match camera height, distance, lighting, clothing, and time of day.");

  return Object.freeze({
    earlierId: earlier.id,
    laterId: later.id,
    earlierDate: earlier.date,
    laterDate: later.date,
    earlierPose: earlier.pose || null,
    laterPose: later.pose || null,
    daysApart,
    weightDeltaLbs,
    poseMatch,
    readiness,
    guidance: Object.freeze(guidance)
  });
}
