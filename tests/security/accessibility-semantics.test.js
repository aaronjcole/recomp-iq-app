import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

function relativeLuminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

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

test("the light gold text token meets normal-text contrast on its app surfaces", () => {
  const source = read("src/index.css");
  const lightTokens = source.match(/:root\s*{([\s\S]*?)\n\s*}/)?.[1];
  assert.ok(lightTokens, "the light theme token block should exist");

  const token = (name) => {
    const value = lightTokens.match(new RegExp(`--${name}:\\s*(#[a-f\\d]{6})`, "i"))?.[1];
    assert.ok(value, `--${name} should be a six-digit hex color`);
    return value;
  };

  const gold = token("gold");
  for (const surface of ["background", "card", "panel2", "questCompleteBg"]) {
    assert.ok(
      contrastRatio(gold, token(surface)) >= 4.5,
      `--gold should have at least 4.5:1 contrast against --${surface}`
    );
  }
});
