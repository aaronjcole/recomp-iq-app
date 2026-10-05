// Ownership of private analysis photos. Shared by the uploadAnalysisPhoto,
// analyzeFoodPhoto and analyzeBodyComposition functions and Node tests.
//
// The analyze functions sign photo references with the service role, which can
// read any private file in the app. A reference supplied by the client is
// therefore only signed when an AnalysisUpload record proves the caller
// uploaded it. Those records are written exclusively by uploadAnalysisPhoto,
// with the service role, after it stores the file itself. A client-written
// claim would prove nothing: any user could "claim" another user's file_uri.

export const ANALYSIS_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const ANALYSIS_UPLOAD_ALLOWED_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp"
]);
export const ANALYSIS_UPLOAD_PURPOSES = Object.freeze(["food_photo", "body_composition"]);
/** The most references one analysis may sign (body composition uses three). */
export const MAX_ANALYSIS_PHOTO_REFERENCES = 3;
export const MAX_ANALYSIS_FILE_URI_LENGTH = 2_000;

export class AnalysisUploadError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AnalysisUploadError";
    this.status = status;
  }
}

export class PhotoReferenceOwnershipError extends Error {
  constructor(message = "One or more photos were not uploaded by this account.") {
    super(message);
    this.name = "PhotoReferenceOwnershipError";
    this.status = 403;
  }
}

/** Validate an uploaded file's declared type and size before storing it. */
export function validateAnalysisUploadFile(file) {
  if (!file || typeof file !== "object" || typeof file.size !== "number") {
    throw new AnalysisUploadError("An image file is required.");
  }
  if (!ANALYSIS_UPLOAD_ALLOWED_TYPES.includes(file.type)) {
    throw new AnalysisUploadError("Use a JPEG, PNG, or WebP image.", 415);
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new AnalysisUploadError("The selected image is empty or unreadable.");
  }
  if (file.size > ANALYSIS_UPLOAD_MAX_BYTES) {
    throw new AnalysisUploadError("Choose an image smaller than 10 MB.", 413);
  }
}

export function normalizeAnalysisUploadPurpose(value) {
  return ANALYSIS_UPLOAD_PURPOSES.includes(value) ? value : null;
}

/** The server-owned record written after a successful private upload. */
export function analysisUploadRecord(ownerId, fileUri, purpose) {
  if (typeof ownerId !== "string" || ownerId.trim() === "") {
    throw new AnalysisUploadError("An owner id is required.", 500);
  }
  if (typeof fileUri !== "string" || !fileUri || fileUri.length > MAX_ANALYSIS_FILE_URI_LENGTH) {
    throw new AnalysisUploadError("Private image upload did not return a file reference.", 502);
  }
  const normalizedPurpose = normalizeAnalysisUploadPurpose(purpose);
  return {
    owner_id: ownerId,
    file_uri: fileUri,
    ...(normalizedPurpose ? { purpose: normalizedPurpose } : {})
  };
}

/** Bound and de-duplicate the references a request asks the server to sign. */
export function normalizePhotoReferences(references) {
  if (!Array.isArray(references) || references.length === 0) {
    throw new PhotoReferenceOwnershipError("A photo reference is required.");
  }
  if (references.length > MAX_ANALYSIS_PHOTO_REFERENCES) {
    throw new PhotoReferenceOwnershipError("Too many photo references.");
  }
  for (const reference of references) {
    if (
      typeof reference !== "string" ||
      reference === "" ||
      reference.length > MAX_ANALYSIS_FILE_URI_LENGTH
    ) {
      throw new PhotoReferenceOwnershipError("A photo reference is invalid.");
    }
  }
  return [...new Set(references)];
}

/**
 * Pure check: every reference must match an AnalysisUpload record owned by
 * ownerId. Records owned by anyone else never count, whatever they claim.
 */
export function assertOwnedPhotoReferences(references, records, ownerId) {
  if (typeof ownerId !== "string" || ownerId.trim() === "") {
    throw new PhotoReferenceOwnershipError();
  }
  const uris = normalizePhotoReferences(references);
  const owned = new Set(
    (Array.isArray(records) ? records : [])
      .filter((record) => record?.owner_id === ownerId && typeof record?.file_uri === "string")
      .map((record) => record.file_uri)
  );
  if (!uris.every((uri) => owned.has(uri))) throw new PhotoReferenceOwnershipError();
  return uris;
}

/**
 * Look up the caller's AnalysisUpload records for the given references through
 * the service role (the entity is server-owned; users cannot create rows) and
 * assert ownership. The filter is always bound to the caller's owner_id, so an
 * admin caller is held to their own uploads too.
 */
export async function verifyPhotoReferenceOwnership(analysisUploadEntity, ownerId, references) {
  if (typeof ownerId !== "string" || ownerId.trim() === "") {
    throw new PhotoReferenceOwnershipError();
  }
  const uris = normalizePhotoReferences(references);
  // One equality lookup per reference (at most three) keeps to plain filters.
  const pages = await Promise.all(
    uris.map((uri) =>
      analysisUploadEntity.filter({ owner_id: ownerId, file_uri: uri }, "-created_date", 1)
    )
  );
  const records = pages.flatMap((page) => (Array.isArray(page) ? page : []));
  return assertOwnedPhotoReferences(uris, records, ownerId);
}
