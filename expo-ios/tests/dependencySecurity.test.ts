import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const xcode = require("xcode");
const fromXcode = createRequire(require.resolve("xcode"));
const uuid = fromXcode("uuid");

// xcode 3 uses only CommonJS uuid.v4() with no arguments. Keep its API and
// project-file format intact while replacing the unsupported uuid 7 line.
test("xcode resolves the narrowly scoped, CommonJS-compatible UUID security fix", () => {
  const manifest = require("../package.json");
  assert.equal(manifest.overrides["xcode@3.0.1"].uuid, "11.1.1");
  assert.equal(fromXcode("uuid/package.json").version, "11.1.1");
  assert.equal(typeof uuid.v4, "function");
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

test("xcode can create, serialize and parse project groups with the override", () => {
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

test("UUID v3/v5/v6 reject undersized caller-provided buffers (GHSA-w5hq-g745-h8pq)", () => {
  for (const algorithm of [uuid.v3, uuid.v5]) {
    assert.throws(() => algorithm("x", uuid.v5.DNS, new Uint8Array(8), 4), RangeError);
  }
  assert.throws(() => uuid.v6({}, new Uint8Array(8), 4), RangeError);
});
