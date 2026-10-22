import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { resolve } from "node:path";

// Real React/browser lifecycle and click activation, with a deterministic speech
// service. This deliberately does not exercise or claim microphone hardware.
let fixture;
test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import MealSpeechInput from './src/components/nutrition/MealSpeechInput.jsx';
      const root = createRoot(document.getElementById('root'));
      window.__transcripts = [];
      window.mountSpeech = (disabled = false) => root.render(React.createElement(MealSpeechInput,
        { disabled, onTranscript: text => window.__transcripts.push(text) }));
      window.unmountSpeech = () => root.unmount();
      window.mountSpeech();
    `, resolveDir: process.cwd(), loader: "jsx" },
    alias: { "@": resolve("src") }, bundle: true, write: false, format: "iife",
    jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }
  });
  fixture = result.outputFiles[0].text;
});

async function mount(page, supported = true) {
  await page.route("**/speech-control", (route) => route.fulfill({
    contentType: "text/html", body: '<!doctype html><title>Meal speech input test</title><div id="root"></div><textarea aria-label="Typed meal"></textarea>'
  }));
  await page.goto("/speech-control");
  await page.evaluate((available) => {
    window.__starts = 0; window.__stops = 0; window.__aborts = 0;
    window.webkitSpeechRecognition = undefined;
    window.SpeechRecognition = available ? class {
      constructor() { window.__recognition = this; }
      start() { window.__starts++; }
      stop() { window.__stops++; }
      abort() { window.__aborts++; }
    } : undefined;
  }, supported);
  await page.addScriptTag({ content: fixture });
}

test("meal voice input requires consent and a click, then Stop delivers a final exactly once", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "Describe by voice" }).click();
  await expect(page.getByText(/may process audio online/)).toBeVisible();
  expect(await page.evaluate(() => window.__starts)).toBe(0);
  await page.getByRole("button", { name: "Record meal" }).click();
  expect(await page.evaluate(() => window.__starts)).toBe(1);
  await page.evaluate(() => {
    const results = [Object.assign([{ transcript: "two eggs" }], { isFinal: true })];
    window.__recognition.onresult({ resultIndex: 0, results });
    window.__recognition.onresult({ resultIndex: 0, results });
  });
  expect(await page.evaluate(() => window.__transcripts)).toEqual([]);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.__stops)).toBe(1);
  await page.evaluate(() => { const end = window.__recognition.onend; end(); end(); });
  await expect(page.getByRole("button", { name: "Describe by voice" })).toBeVisible();
  expect(await page.evaluate(() => window.__transcripts)).toEqual(["two eggs"]);
});

test("Cancel, disabled and unmount abort browser capture without delivering final text", async ({ page }) => {
  await mount(page);
  for (const action of ["cancel", "disabled", "unmount"]) {
    await page.getByRole("button", { name: "Describe by voice" }).click();
    await page.getByRole("button", { name: "Record meal" }).click();
    await page.evaluate(() => {
      window.__recognition.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "discard me" }], { isFinal: true })] });
      window.__lateEnd = window.__recognition.onend;
    });
    if (action === "cancel") await page.getByRole("button", { name: "Cancel voice input", exact: true }).click();
    else if (action === "disabled") {
      await page.evaluate(() => window.mountSpeech(true));
      await expect(page.getByRole("button", { name: "Describe by voice" })).toBeDisabled();
      await page.evaluate(() => window.mountSpeech(false));
    } else await page.evaluate(() => window.unmountSpeech());
    await page.evaluate(() => window.__lateEnd());
    expect(await page.evaluate(() => window.__transcripts)).toEqual([]);
  }
  expect(await page.evaluate(() => window.__aborts)).toBe(3);
});

test("unsupported environments hide voice controls and leave the parent's typed input available", async ({ page }) => {
  await mount(page, false);
  await page.getByRole("textbox", { name: "Typed meal" }).fill("two eggs and toast");
  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Typed meal" })).toHaveValue("two eggs and toast");
});
