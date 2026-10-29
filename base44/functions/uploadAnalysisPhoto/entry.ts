import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { json, safeErrorDetails, statusOf } from "../../shared/httpUtils.js";
import {
  ANALYSIS_UPLOAD_MAX_BYTES,
  AnalysisUploadError,
  analysisUploadRecord,
  assertAnalysisUploadAllowed,
  validateAnalysisUploadFile
} from "../../shared/analysisUploadDomain.js";
import { resolvePremiumAccess } from "../../shared/premiumDomain.js";
import { loadPremiumAccessRecords } from "../../shared/entitlementAccess.js";

// Stores one private analysis photo for the signed-in user and records that
// this account uploaded it. The upload runs here, not in the browser, because
// the AnalysisUpload record is the proof analyzeFoodPhoto and
// analyzeBodyComposition rely on before signing a reference with the service
// role: only a server that stored the file itself can attest who uploaded it.

// Room for the multipart envelope and the purpose field around the image.
const MAX_REQUEST_BYTES = ANALYSIS_UPLOAD_MAX_BYTES + 64 * 1024;
// The same release flags the analyze functions enforce. Storing a photo for an
// analysis that cannot run would only accumulate private files that the SDK
// offers no way to delete.
const ENABLED_PURPOSES = Object.freeze({
  food_photo: Deno.env.get("ENABLE_FOOD_PHOTO_SCAN") === "true",
  body_composition: Deno.env.get("ENABLE_BODY_COMPOSITION_SCAN") === "true"
});

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
  }
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "Choose an image smaller than 10 MB." }, { status: 413 });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("uploadAnalysisPhoto auth check failed", safeErrorDetails(error));
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  let file;
  let purpose;
  try {
    const form = await req.formData();
    file = form.get("file");
    purpose = form.get("purpose");
  } catch {
    return json({ error: "A multipart image upload is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return json({ error: "An image file is required." }, { status: 400 });
  }

  try {
    // Release flag and Premium entitlement are checked before anything is
    // stored: an account the analysis would refuse must not fill private
    // storage, which is never cleaned up.
    const access = resolvePremiumAccess(await loadPremiumAccessRecords(base44, user, { testerEmails: Deno.env.get("PREMIUM_TESTER_EMAILS") }));
    const allowedPurpose = assertAnalysisUploadAllowed(purpose, {
      features: access.features,
      enabledPurposes: ENABLED_PURPOSES
    });
    validateAnalysisUploadFile(file);
    const uploaded = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
    const record = analysisUploadRecord(user.id, uploaded?.file_uri, allowedPurpose);
    await base44.asServiceRole.entities.AnalysisUpload.create(record);
    return json({ file_uri: record.file_uri });
  } catch (error) {
    if (error instanceof AnalysisUploadError) {
      // The SDK reads data.message || data.detail, so mirror the text there.
      return json({ error: error.message, message: error.message }, { status: error.status });
    }
    console.error("uploadAnalysisPhoto failed", safeErrorDetails(error));
    return json({ error: "The photo could not be uploaded right now" }, { status: 502 });
  }
}
