import { test, expect } from "@playwright/test";
import { build } from "esbuild";
import { resolve } from "node:path";

let fixture;
test.beforeAll(async () => {
  const result = await build({
    stdin: { contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { PhoneField, useCooldown } from './src/components/MfaParts.jsx';
      function Controls() {
        const [country, setCountry] = useState('+1');
        const [phone, setPhone] = useState('');
        const [seconds, setSeconds] = useCooldown();
        return <><label htmlFor="mfa-phone">Phone number</label>
          <PhoneField countryCode={country} onCountryCodeChange={setCountry}
            phoneNumber={phone} onPhoneNumberChange={setPhone} />
          <button onClick={() => setSeconds(2)}>Start cooldown</button>
          <p role="status">{seconds}s</p></>;
      }
      createRoot(document.getElementById('root')).render(<Controls />);
    `, resolveDir: process.cwd(), loader: "jsx" },
    alias: {
      "@/lib/authMfaFlow": resolve("tests/e2e/fixtures/mfa-auth-stub.js"),
      "@": resolve("src")
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' }
  });
  fixture = result.outputFiles[0].text;
});

for (const width of [390, 1280]) {
  test(`MFA shared phone controls render, select a country and tick the cooldown at ${width}px`, async ({ page }) => {
    const errors = [], requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.route("**/api/**", (route) => { requests.push(route.request().url()); return route.abort(); });
    await page.route("**/mfa-control-test", (route) => route.fulfill({
      contentType: "text/html", body: '<!doctype html><title>MFA controls</title><div id="root"></div>'
    }));
    await page.goto("/mfa-control-test");
    await page.addScriptTag({ content: fixture });
    await page.getByLabel("Phone number", { exact: true }).fill("555-123-4567");
    await expect(page.getByLabel("Phone number", { exact: true })).toHaveValue("5551234567");
    if (width < 768) {
      await page.getByRole("button", { name: "Country code", exact: true }).click();
      const drawer = page.getByRole("dialog", { name: "Country code", exact: true });
      await drawer.getByRole("button", { name: "+44", exact: true }).click();
      await expect(drawer).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Country code", exact: true })).toContainText("+44");
    } else {
      await page.getByRole("combobox", { name: "Country code", exact: true }).click();
      await page.getByRole("option", { name: "+44", exact: true }).click();
      await expect(page.getByRole("combobox", { name: "Country code", exact: true })).toContainText("+44");
    }
    await page.getByRole("button", { name: "Start cooldown", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("2s");
    await expect(page.getByRole("status")).toHaveText("0s", { timeout: 5000 });
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
  });
}
