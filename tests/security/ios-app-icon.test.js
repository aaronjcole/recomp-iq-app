import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const iconPath = resolve(repoRoot, "public/brand/recompone-app-icon-ios.png");

test("iOS app icon is an opaque full-size PNG without the listing artwork canvas", () => {
  const appConfig = readFileSync(resolve(repoRoot, "expo-ios/app.json"), "utf8");
  const icon = readFileSync(iconPath);

  assert.match(appConfig, /"icon": "\.\.\/public\/brand\/recompone-app-icon-ios\.png"/);
  assert.deepEqual(
    icon.subarray(0, 8),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    "iOS app icon must be a PNG",
  );
  assert.equal(icon.readUInt32BE(8), 13, "PNG must contain an IHDR chunk");
  assert.equal(icon.subarray(12, 16).toString("ascii"), "IHDR");
  assert.deepEqual([icon.readUInt32BE(16), icon.readUInt32BE(20)], [1024, 1024]);
  assert.equal(icon[25], 2, "iOS app icons must be opaque RGB PNGs");
});
