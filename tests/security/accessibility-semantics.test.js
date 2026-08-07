import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

test("primary fitness screens expose navigable section headings", () => {
  const expectedHeadings = new Map([
    ["src/components/today/RecompSignalHero.jsx", ["Recomp Signal"]],
    ["src/components/today/HabitsCard.jsx", ["Habits"]],
    ["src/components/training/SessionBuilder.jsx", ["Log a session"]],
    ["src/components/training/SessionHistory.jsx", ["Training history"]],
    ["src/components/training/StrengthProgressionCard.jsx", ["Strength progression"]],
    ["src/components/progress/ProgressPhotos.jsx", ["Progress photos"]],
    ["src/pages/Progress.jsx", ["Weight trend", "Latest read", "12-week projection"]],
    ["src/pages/Nutrition.jsx", ["Quick add food", "Food library"]]
  ]);

  for (const [path, headings] of expectedHeadings) {
    const source = read(path);
    for (const heading of headings) {
      assert.match(
        source,
        new RegExp(`<h[23][^>]*>${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h[23]>`),
        `${path} should expose “${heading}” as a section heading`
      );
    }
  }
});

test("habit controls and visual progress rings have descriptive accessible names", () => {
  const habits = read("src/components/today/HabitsCard.jsx");
  assert.match(habits, /aria-label=\{`Decrease \$\{h\.name\}`\}/);
  assert.match(habits, /aria-label=\{`Increase \$\{h\.name\}`\}/);
  assert.match(habits, /Mark \$\{h\.name\} (?:incomplete|complete)/);
  assert.match(habits, /ariaLabel=\{`\$\{h\.name\}: \$\{value\} of \$\{target\}/);

  for (const path of [
    "src/components/common/ConfidenceRing.jsx",
    "src/components/common/ProgressRing.jsx"
  ]) {
    const source = read(path);
    assert.match(source, /role="img"/);
    assert.match(source, /aria-label=/);
  }
});

test("training history starts with a bounded day window and offers more results", () => {
  const source = read("src/components/training/SessionHistory.jsx");
  assert.match(source, /INITIAL_DAY_LIMIT\s*=\s*20/);
  assert.match(source, /days\.slice\(0, visibleDayCount\)/);
  assert.match(source, /Show \$\{Math\.min\(INITIAL_DAY_LIMIT, remainingDays\)\} more days/);
  assert.match(source, /aria-expanded=/);
  assert.match(source, /aria-controls="training-history-days"/);
});
