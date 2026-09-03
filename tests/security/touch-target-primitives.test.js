import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

test("shared form controls provide a 44px minimum touch target", () => {
  const button = read("src/components/ui/button.jsx");
  assert.match(button, /default:\s*"[^"]*min-h-11[^"]*"/);
  assert.match(button, /sm:\s*"[^"]*min-h-11[^"]*"/);
  assert.match(button, /lg:\s*"[^"]*min-h-11[^"]*"/);
  assert.match(button, /icon:\s*"[^"]*min-h-11[^"]*min-w-11[^"]*"/);

  const input = read("src/components/ui/input.jsx");
  assert.match(input, /"flex[^\"]*min-h-11[^\"]*w-full/);
  assert.match(input, /"flex[^\"]*w-full[^\"]*min-w-0/);
});

test("dialog and sheet close controls expand the hit area around the icon", () => {
  for (const path of ["src/components/ui/dialog.jsx", "src/components/ui/sheet.jsx"]) {
    const source = read(path);
    assert.match(source, /className="[^"]*-m-2[^"]*min-h-11[^"]*min-w-11[^"]*p-2[^"]*"/);
    assert.match(source, /<X className="h-4 w-4" \/>/);
  }
});

test("custom card and row actions preserve a 44px minimum touch target", () => {
  const expectations = new Map([
    ["src/components/today/QuickMealsCard.jsx", /to="\/nutrition" className="[^"]*min-h-11[^"]*min-w-11/],
    ["src/components/today/TodayProgressCard.jsx", /to="\/progress" className="[^"]*min-h-11[^"]*min-w-11/],
    ["src/pages/More.jsx", /<button type="button"[^>]*className="[^"]*min-h-11/],
    ["src/components/training/ActiveBlockCard.jsx", /<button[\s\S]{0,300}className="[^"]*min-h-11[\s\S]{0,300}aria-label=\{`Start/],
    ["src/components/training/SessionHistory.jsx", /<button[\s\S]{0,300}className="[^"]*min-h-11[^"]*min-w-11[\s\S]{0,300}aria-label=\{`Edit/],
    ["src/components/nutrition/AddRecipeCard.jsx", /aria-label=\{`Remove ingredient[^>]*className="[^"]*min-h-11[^"]*min-w-11/],
  ]);

  for (const [path, pattern] of expectations) {
    assert.match(read(path), pattern, `${path} should keep its custom actions touch-safe`);
  }
});
