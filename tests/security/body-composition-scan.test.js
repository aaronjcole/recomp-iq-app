import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("body composition analysis verifies Premium access before sensitive reads or AI use", () => {
  const server = readFileSync(
    resolve(repoRoot, "base44/functions/analyzeBodyComposition/entry.ts"),
    "utf8"
  );

  assert.match(server, /req\.method !== "POST"/);
  assert.match(server, /user = await base44\.auth\.me\(\)/);
  assert.match(server, /Cache-Control", "no-store"/);
  assert.match(server, /asServiceRole\.entities\.PremiumEntitlement\.filter/);
  assert.match(server, /MAX_ENTITLEMENT_RECORDS/);
  assert.doesNotMatch(server, /throw error/);
  assert.match(server, /PREMIUM_FEATURES\.VISUAL_PROGRESS/);
  assert.match(server, /Deno\.env\.get\(["']ENABLE_BODY_COMPOSITION_SCAN["']\)/);
  assert.match(server, /BODY_COMPOSITION_SCAN_DISABLED/);
  assert.match(server, /created_by_id:\s*userId/);
  assert.match(server, /CreateFileSignedUrl/);
  assert.match(server, /SIGNED_URL_TTL_SECONDS = 300/);
  assert.match(server, /expires_in:\s*SIGNED_URL_TTL_SECONDS/);
  assert.match(server, /integrations\.Core\.InvokeLLM/);
  assert.doesNotMatch(server, /\bemail\b/i);

  const releaseGate = server.indexOf("if (BODY_COMPOSITION_SCAN_DISABLED)");
  const authorization = server.indexOf("const entitlements = await listAllEntitlements");
  const profileRead = server.indexOf('ownedRecords(base44, "UserProfile"');
  const signedUrl = server.indexOf("CreateFileSignedUrl");
  const inference = server.indexOf("integrations.Core.InvokeLLM");
  assert.ok(
    releaseGate >= 0 && releaseGate < authorization && authorization < profileRead,
    "The deploy opt-in and Premium authorization must execute before owned profile reads"
  );
  assert.ok(
    authorization < signedUrl && signedUrl < inference,
    "Premium authorization must precede signed URL creation and paid inference"
  );
});

test("body composition photos use private upload while analysis stays behind the backend gate", () => {
  const component = readFileSync(
    resolve(repoRoot, "src/components/progress/BodyCompositionScan.jsx"),
    "utf8"
  );
  const progress = readFileSync(resolve(repoRoot, "src/pages/Progress.jsx"), "utf8");
  const premium = readFileSync(resolve(repoRoot, "src/pages/Premium.jsx"), "utf8");

  assert.match(component, /uploadPrivateAnalysisImage/);
  assert.match(component, /base44\.functions\.invoke\("analyzeBodyComposition"/);
  assert.match(component, /sessionStorage/);
  assert.doesNotMatch(component, /localStorage/);
  assert.doesNotMatch(component, /CreateFileSignedUrl|InvokeLLM|createPrivateAnalysisUrl/);
  assert.match(progress, /\(featureFlags\.bodyCompositionScan\s*\|\|\s*releaseFlags\.bodyCompositionScan\)\s*&&\s*canAccess\(PREMIUM_FEATURES\.VISUAL_PROGRESS\)/);
  assert.match(premium, /AI-assisted body-composition range/i);
});

test("privacy policy discloses the accepted private-file deletion limitation", () => {
  const privacy = readFileSync(resolve(repoRoot, "src/pages/Privacy.jsx"), "utf8");
  assert.match(privacy, /cannot currently request immediate deletion/i);
  assert.match(privacy, /inference provider.*retention/is);
});
