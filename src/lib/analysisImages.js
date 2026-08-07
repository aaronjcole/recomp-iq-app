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

export async function uploadPrivateAnalysisImage(core, file) {
  validateAnalysisImage(file);

  const { file_uri: fileUri } = await core.UploadPrivateFile({ file });
  if (!fileUri) throw new Error("Private image upload did not return a file reference.");
  return fileUri;
}

export async function createPrivateAnalysisUrl(core, file) {
  const fileUri = await uploadPrivateAnalysisImage(core, file);

  const { signed_url: signedUrl } = await core.CreateFileSignedUrl({
    file_uri: fileUri,
    expires_in: ANALYSIS_URL_TTL_SECONDS
  });
  if (!signedUrl) throw new Error("Could not create a temporary image link.");

  return { fileUri, signedUrl };
}
