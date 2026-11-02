export const ANALYSIS_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const ANALYSIS_URL_TTL_SECONDS = 300;

const ALLOWED_ANALYSIS_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export function validateAnalysisImage(file) {
  if (!file) throw new Error("Choose an image first.");
  if (!ALLOWED_ANALYSIS_IMAGE_TYPES.has(file.type)) {
    throw new Error("Use a JPEG, PNG, or WebP image.");
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error("The selected image is empty or unreadable.");
  }
  if (file.size > ANALYSIS_IMAGE_MAX_BYTES) {
    throw new Error("Choose an image smaller than 10 MB.");
  }
}

/**
 * Upload an analysis photo through the uploadAnalysisPhoto backend function,
 * which stores it privately and records this account as its uploader. The
 * analyze functions refuse any reference without that record, so the browser
 * must not upload analysis photos with Core.UploadPrivateFile directly.
 *
 * @param {{ invoke: (name: string, data: object) => Promise<any> }} functions base44.functions
 * @param {File} file
 * @param {"food_photo" | "body_composition"} purpose
 */
export async function uploadPrivateAnalysisImage(functions, file, purpose) {
  validateAnalysisImage(file);

  const response = await functions.invoke("uploadAnalysisPhoto", { file, purpose });
  const fileUri = (response?.data ?? response)?.file_uri;
  if (typeof fileUri !== "string" || !fileUri) {
    throw new Error("Private image upload did not return a file reference.");
  }
  return fileUri;
}