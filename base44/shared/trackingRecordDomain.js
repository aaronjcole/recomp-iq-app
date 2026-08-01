// Shared by Base44 functions and Node regression tests. Base44 packages modules
// from base44/shared with each importing function deployment.
export class TrackingRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "TrackingRequestError";
  }
}

export const DAILY_LOG_FIELDS = Object.freeze([
  "weight_lbs",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "steps",
  "workout_completed",
  "workout_type",
  "waist_in",
  "water_oz",
  "hunger_rating",
  "energy_rating",
  "sleep_hours",
  "sleep_quality",
  "soreness_rating",
  "notes"
]);

export const HABIT_ENTRY_FIELDS = Object.freeze(["value", "done"]);

const dailyLogRules = {
  weight_lbs: nullable(numberBetween(40, 1200)),
  calories: nullable(numberBetween(0, 20000)),
  protein_g: nullable(numberBetween(0, 2000)),
  carbs_g: nullable(numberBetween(0, 3000)),
  fat_g: nullable(numberBetween(0, 2000)),
  steps: nullable(numberBetween(0, 200000)),
  workout_completed: isBoolean,
  workout_type: nullable(stringUpTo(200)),
  waist_in: nullable(numberBetween(10, 150)),
  water_oz: nullable(numberBetween(0, 2000)),
  hunger_rating: nullable(numberBetween(1, 5)),
  energy_rating: nullable(numberBetween(1, 5)),
  sleep_hours: nullable(numberBetween(0, 24)),
  sleep_quality: nullable(numberBetween(1, 5)),
  soreness_rating: nullable(numberBetween(1, 5)),
  notes: nullable(stringUpTo(4000))
};

const habitEntryRules = {
  value: numberBetween(0, 1000000),
  done: isBoolean
};

function numberBetween(minimum, maximum) {
  return (value) =>
    typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function nullable(rule) {
  return (value) => value === null || rule(value);
}

function isBoolean(value) {
  return typeof value === "boolean";
}

function stringUpTo(maximumLength) {
  return (value) => typeof value === "string" && value.length <= maximumLength;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function sanitizeFields(fields, rules) {
  if (!isRecord(fields)) throw new TrackingRequestError("fields must be an object");

  const allowed = new Set(Object.keys(rules));
  const keys = Object.keys(fields);
  if (keys.length === 0) throw new TrackingRequestError("At least one field is required");

  const sanitized = {};
  for (const key of keys) {
    if (!allowed.has(key)) throw new TrackingRequestError(`Unsupported field: ${key}`);
    if (!rules[key](fields[key])) throw new TrackingRequestError(`Invalid value for ${key}`);
    sanitized[key] = fields[key];
  }
  return sanitized;
}

function fieldsForCreate(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null));
}

export function normalizeTrackingRequest(body) {
  if (!isRecord(body)) throw new TrackingRequestError("A JSON request body is required");
  if (!isIsoDate(body.date)) throw new TrackingRequestError("date must be a valid YYYY-MM-DD value");

  if (body.kind === "daily_log") {
    const fields = sanitizeFields(body.fields, dailyLogRules);
    return {
      kind: body.kind,
      date: body.date,
      queueKey: `daily_log:${body.date}`,
      query: { date: body.date },
      createData: { date: body.date, ...fieldsForCreate(fields) },
      fields,
      mutableFields: DAILY_LOG_FIELDS
    };
  }

  if (body.kind === "habit_entry") {
    const habitId = typeof body.habit_id === "string" ? body.habit_id.trim() : "";
    if (!habitId || habitId.length > 200) {
      throw new TrackingRequestError("habit_id is required");
    }
    const fields = sanitizeFields(body.fields, habitEntryRules);
    return {
      kind: body.kind,
      date: body.date,
      habitId,
      queueKey: `habit_entry:${habitId}:${body.date}`,
      query: { habit_id: habitId, date: body.date },
      createData: { habit_id: habitId, date: body.date, ...fieldsForCreate(fields) },
      fields,
      mutableFields: HABIT_ENTRY_FIELDS
    };
  }

  throw new TrackingRequestError("kind must be daily_log or habit_entry");
}

function compareRecords(left, right) {
  const leftStamp = left?.created_date ?? "";
  const rightStamp = right?.created_date ?? "";
  const byCreated = leftStamp.localeCompare(rightStamp);
  if (byCreated !== 0) return byCreated;
  return String(left?.id ?? "").localeCompare(String(right?.id ?? ""));
}

export function reconcileTrackingRecords(records, incomingFields, mutableFields) {
  const unique = new Map();
  for (const record of records ?? []) {
    if (record?.id) unique.set(record.id, record);
  }
  const ordered = [...unique.values()].sort(compareRecords);
  const canonical = ordered[0] ?? null;
  const fields = {};
  const unsetFields = [];

  for (const record of ordered) {
    for (const field of mutableFields) {
      if (record[field] !== undefined && record[field] !== null) fields[field] = record[field];
    }
  }
  for (const field of mutableFields) {
    if (incomingFields[field] === null) {
      delete fields[field];
      unsetFields.push(field);
    } else if (incomingFields[field] !== undefined) {
      fields[field] = incomingFields[field];
    }
  }

  return { canonical, duplicates: ordered.slice(1), fields, unsetFields };
}
