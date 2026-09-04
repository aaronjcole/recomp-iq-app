import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  FOOD_PHOTO_RESPONSE_SCHEMA,
  FoodPhotoRequestError,
  buildFoodPhotoPrompt,
  normalizeFoodPhotoResult
} from "../../shared/foodPhotoDomain.js";
import { json, safeErrorDetails, statusOf } from "../../shared/httpUtils.js";

const MAX_REQUEST_BYTES = 4_000;
const SIGNED_URL_TTL_SECONDS = 300;

export default async function(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
  }
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "Request is too large" }, { status: 413 });
  }

  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (error) {
    if ([401, 403].includes(statusOf(error))) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("analyzeFoodPhoto auth check failed", safeErrorDetails(error));
    return json({ error: "Could not verify the account" }, { status: 500 });
  }
  if (!user?.id) return json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "A JSON request body is required" }, { status: 400 });
  }

  const photoUri = typeof body?.photoUri === "string" ? body.photoUri.trim() : "";
  if (!photoUri) {
    return json({ error: "A photo reference is required" }, { status: 400 });
  }

  try {
    // The client uploads the photo to private storage (UploadPrivateFile) and
    // passes the opaque file_uri here. The server creates the short-lived
    // signed link and runs the vision LLM call under the service role so the
    // credit-consuming integration never runs from the browser.
    const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri: photoUri,
      expires_in: SIGNED_URL_TTL_SECONDS
    });
    if (!signed?.signed_url) throw new Error("Could not create a temporary image link");

    const rawResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: buildFoodPhotoPrompt(),
      model: "gemini_3_flash",
      file_urls: [signed.signed_url],
      response_json_schema: FOOD_PHOTO_RESPONSE_SCHEMA
    });
    return json(normalizeFoodPhotoResult(rawResult));
  } catch (error) {
    if (error instanceof FoodPhotoRequestError) {
      return json({ error: error.message }, { status: 502 });
    }
    console.error("analyzeFoodPhoto failed", safeErrorDetails(error));
    return json({ error: "The food photo estimate could not run right now" }, { status: 502 });
  }
}