import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44 } from "./support/base44.js";

test.use({ viewport: { width: 390, height: 520 }, hasTouch: true, isMobile: true });

test("height selectors accept repeated touch changes without changing the other unit", async ({ page }) => {
  await installAuthenticatedBase44(page, {
    user: { id: "touch-user", email: "touch@example.com", role: "user" },
    entities: {}, foreignEntities: {}
  });
  await page.goto("/onboarding?step=1");
  const feet = page.getByRole("button", { name: "Height in feet", exact: true });
  const inches = page.getByRole("button", { name: "Additional inches", exact: true });
  await expect(feet).toContainText("5 ft");
  await expect(inches).toContainText("8 in");
  for (const value of [7, 4, 6, 5]) {
    await feet.tap();
    const dialog = page.getByRole("dialog", { name: "Height in feet", exact: true });
    await expect(dialog).not.toHaveAttribute("data-vaul-drawer");
    await expect(dialog).toHaveCSS("animation-name", "none");
    await dialog.getByRole("button", { name: `${value} ft`, exact: true }).tap();
    await expect(dialog).toHaveCount(0);
    await expect(feet).toContainText(`${value} ft`);
    await expect(inches).toContainText("8 in");
  }
  for (const value of [11, 0, 8, 2]) {
    await inches.tap();
    const dialog = page.getByRole("dialog", { name: "Additional inches", exact: true });
    await expect(dialog.locator("[data-selector-options]")).toHaveCSS("overscroll-behavior-y", "contain");
    const option = dialog.getByRole("button", { name: `${value} in`, exact: true });
    await option.scrollIntoViewIfNeeded();
    await option.tap();
    await expect(dialog).toHaveCount(0);
    await expect(inches).toContainText(`${value} in`);
    await expect(feet).toContainText("5 ft");
  }
  await feet.tap();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).tap();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(feet).toContainText("5 ft");
});
