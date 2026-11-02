import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const xcode = require("xcode");
const fromXcode = createRequire(require.resolve("xcode"));
const xcodeManifest = fromXcode("./package.json");
const pbxProjectSource = readFileSync(fromXcode.resolve("./lib/pbxProject.js"), "utf8");

// The invariant is "xcode's UUID source is patched", not a specific version.
// xcode 4 (pulled in by Expo patch releases from @expo/config-plugins 57.0.11)
// uses crypto.randomUUID() and has no uuid dependency. xcode 3 called CommonJS
// uuid.v4() and pinned the unsupported uuid 7 line; package.json carried a
// scoped override for it until xcode 4 replaced it. If an xcode that depends on
// uuid ever returns, this test fails until that override is restored.
test("the UUID source xcode uses is patched (GHSA-w5hq-g745-h8pq)", () => {
  if (xcodeManifest.dependencies?.uuid) {
    const uuid = fromXcode("uuid");
    const { version } = fromXcode("uuid/package.json");
    const manifest = require("../package.json");
    assert.equal(
      manifest.overrides?.[`xcode@${xcodeManifest.version}`]?.uuid,
      version,
      `xcode ${xcodeManifest.version} must resolve uuid through the scoped override`
    );
    assert.ok(Number(version.split(".")[0]) >= 11, `uuid ${version} predates the fix`);
    assert.equal(typeof uuid.v4, "function");
    for (const algorithm of [uuid.v3, uuid.v5]) {
      assert.throws(() => algorithm("x", uuid.v5.DNS, new Uint8Array(8), 4), RangeError);
    }
    assert.throws(() => uuid.v6({}, new Uint8Array(8), 4), RangeError);
  } else {
    assert.match(pbxProjectSource, /crypto\.randomUUID\(\)/);
    assert.doesNotMatch(pbxProjectSource, /require\(\s*["']uuid["']\s*\)/);
  }
});

// glob <= 14.0.1 (GHSA-3g3m-2fjr-6pw4) and minimatch < 11.0.1
// (GHSA-g3hv-75wg-m249) have no patched release on the lines Expo's tooling
// asks for: every SDK 57 and 58 @expo package below pins glob ^13 and
// minimatch ^10, so package.json overrides both. As with uuid above, this
// checks what the tooling actually resolves, not the override, so it keeps
// passing once @expo allows the patched lines and the override is deleted.
const fromExpo = createRequire(require.resolve("expo/package.json"));
const atLeast = (version: string, minimum: string) => {
  const have = version.split(".").map((part) => parseInt(part, 10));
  const need = minimum.split(".").map((part) => parseInt(part, 10));
  for (let i = 0; i < need.length; i++) {
    const [h, n] = [have[i] ?? 0, need[i] ?? 0];
    if (h !== n) return h > n;
  }
  return true;
};

test("Expo's CLI tooling resolves patched glob and minimatch", () => {
  for (const tool of ["@expo/cli", "@expo/config", "@expo/config-plugins", "@expo/fingerprint", "@expo/metro-config"]) {
    const fromTool = createRequire(fromExpo.resolve(`${tool}/package.json`));
    const glob = fromTool("glob/package.json");
    assert.ok(atLeast(glob.version, "14.0.2"), `${tool} resolves glob ${glob.version} (GHSA-3g3m-2fjr-6pw4)`);
    const minimatch = createRequire(fromTool.resolve("glob/package.json"))("minimatch/package.json");
    assert.ok(atLeast(minimatch.version, "11.0.1"), `${tool}'s glob resolves minimatch ${minimatch.version} (GHSA-g3hv-75wg-m249)`);
  }
  const fromFingerprint = createRequire(fromExpo.resolve("@expo/fingerprint/package.json"));
  const { version } = fromFingerprint("minimatch/package.json");
  assert.ok(atLeast(version, "11.0.1"), `@expo/fingerprint resolves minimatch ${version} (GHSA-g3hv-75wg-m249)`);
});

test("xcode still generates unique 24-character uppercase UUIDs", () => {
  const project = xcode.project("RecompOne.xcodeproj/project.pbxproj");
  project.hash = { project: { objects: {} } };
  const ids = new Set<string>();
  for (let index = 0; index < 1000; index++) {
    const id = project.generateUuid();
    assert.match(id, /^[0-9A-F]{12}4[0-9A-F]{3}[89AB][0-9A-F]{7}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 1000);
});

test("xcode can create, serialize and parse project groups", () => {
  const project = xcode.project("RecompOne.xcodeproj/project.pbxproj");
  project.hash = {
    project: {
      archiveVersion: 1, classes: {}, objectVersion: 56,
      objects: { PBXGroup: {}, PBXFileReference: {} }
    }
  };
  const group = project.addPbxGroup([], "RecompOne", "RecompOne");
  const parser = fromXcode("./lib/parser/pbxproj");
  const parsed = parser.parse(project.writeSync());
  assert.equal(parsed.project.objects.PBXGroup[group.uuid].name, "RecompOne");
});
