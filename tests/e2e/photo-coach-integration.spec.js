import { test, expect } from "@playwright/test";
import { installAuthenticatedBase44, watchPageErrors } from "./support/base44.js";
import { todayStr, addDaysStr } from "../../src/lib/loggingDateUtils.js";
const PAST = addDaysStr(todayStr(), -1);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5WQAAAAASUVORK5CYII=", "base64");
const items = [{ name: "Toast", serving_description: "1 slice", calories: 90, protein_g: 3, carbs_g: 16, fat_g: 1, confidence: "low" }, { name: "Egg", serving_description: "1 egg", calories: 70, protein_g: 6, carbs_g: 0, fat_g: 5, confidence: "moderate" }];

test("photo analysis waits for consent, requests v2 and hands separate estimates to review", async ({ page }) => {
  await installAuthenticatedBase44(page);
  const noErrors=watchPageErrors(page);
  let calls=0;
  await page.route("**/functions/uploadAnalysisPhoto", (route)=>route.fulfill({json:{file_uri:"private/test/food.png"}}));
  await page.route("**/functions/analyzeFoodPhoto", (route)=>{calls++; expect(route.request().postDataJSON().responseVersion).toBe(2); return route.fulfill({json:{version:2,estimate_status:"estimated",items,notes:"Review the bread and egg portions"}});});
  await page.goto("/tests/e2e/fixtures/food-photo.html");
  await page.locator('input[type="file"]').setInputFiles({name:"meal.png",mimeType:"image/png",buffer:png});
  const estimate=page.getByRole("button",{name:"Estimate macros"});
  await expect(estimate).toBeDisabled();
  expect(calls).toBe(0);
  await page.getByRole("checkbox").check();
  await estimate.click();
  await expect(page.getByRole("heading",{name:"Review 2 estimated foods"})).toBeVisible();
  await expect(page.getByText("Toast",{exact:true})).toBeVisible();
  await expect(page.getByText("Egg",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>window.photoResults)).toEqual([]);
  await page.getByRole("button",{name:"Review food",exact:true}).click();
  expect(await page.evaluate(()=>window.photoResults[0].food.items.length)).toBe(2);
  expect(calls).toBe(1);
  noErrors();
});

test("unable-to-estimate photos can fall back to manual without logging", async ({ page }) => {
  await installAuthenticatedBase44(page);
  await page.route("**/functions/uploadAnalysisPhoto", (route)=>route.fulfill({json:{file_uri:"private/test/food.png"}}));
  await page.route("**/functions/analyzeFoodPhoto",(route)=>route.fulfill({json:{version:2,estimate_status:"unable_to_estimate",items:[],notes:"The plate is obscured"}}));
  await page.goto("/tests/e2e/fixtures/food-photo.html");
  await page.locator('input[type="file"]').setInputFiles({name:"meal.png",mimeType:"image/png",buffer:png});
  await page.getByRole("checkbox").check();
  await page.getByRole("button",{name:"Estimate macros"}).click();
  await expect(page.getByRole("alert")).toContainText("The plate is obscured");
  await page.getByRole("button",{name:"Enter food manually"}).click();
  expect(await page.evaluate(()=>window.photoResults)).toEqual([]);
  expect(await page.evaluate(()=>window.manualRequested)).toBe(true);
});

test("Coach facts and requests use the selected historical date without auto-spending a request", async ({ page }) => {
  const {entities}=await installAuthenticatedBase44(page);
  let body;
  await page.route("**/functions/coachReply",route=>{body=route.request().postDataJSON();return route.fulfill({json:{messageId:"dated-coach",actionable:false,reply:{summary:"Selected-day response",actions:["Review portions"]}}});});
  await page.goto(`/more/coach?date=${PAST}&topic=protein`);
  const facts=page.getByLabel("Selected-day nutrition facts");
  await expect(facts).toContainText(`${entities.DailyLog.find(row=>row.date===PAST).protein_g}g protein logged`);
  await expect(page.getByRole("textbox",{name:"Message your coach"})).toHaveValue(/How am I doing on protein/);
  expect(body).toBeUndefined();
  await page.getByRole("button",{name:"Send message"}).click();
  await expect(page.getByText("Selected-day response",{exact:true})).toBeVisible();
  expect(body.referenceDate).toBe(PAST);
});
