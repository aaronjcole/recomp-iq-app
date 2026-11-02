import test from "node:test";
import assert from "node:assert/strict";
import { deliverExportFile, ExportDeliveryUnavailable } from "../../src/lib/dataExport.js";
const file = { name: "records.json", text: "{}", type: "application/json" };
function environment(native = false) {
  const events = [];
  const target = { File, Blob, ...(native ? { wixMobileNativeBridge: {} } : {}),
    navigator: { userAgent: "test browser", canShare: () => true, share: async () => { events.push("share"); } },
    URL: { createObjectURL: () => "blob:test", revokeObjectURL: () => events.push("revoke") },
    document: { body: { appendChild: () => events.push("append") }, createElement: () => ({ click: () => events.push("download"), remove: () => events.push("remove") }) },
    setTimeout: (callback) => { callback(); return 0; } };
  return { target, events };
}
test("a normal browser downloads exports even when Web Share is advertised", async () => {
  const { target, events } = environment();
  assert.equal(await deliverExportFile(file, target), "downloaded");
  assert.ok(events.includes("download"));
  assert.equal(events.includes("share"), false);
});
test("native shells share files and never silently attempt a WebView download", async () => {
  const { target, events } = environment(true);
  assert.equal(await deliverExportFile(file, target), "shared");
  assert.deepEqual(events, ["share"]);
  target.navigator.canShare = () => false;
  await assert.rejects(() => deliverExportFile(file, target), ExportDeliveryUnavailable);
  assert.equal(events.includes("download"), false);
});
