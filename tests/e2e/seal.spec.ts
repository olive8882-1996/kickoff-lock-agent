import { expect, test } from "@playwright/test";

test("mock Filecoin seal flow verifies a real proof end to end", async ({ page }) => {
  await page.goto("?reset=1&e2e=seal");
  const upcoming = page.locator(".match-card").filter({ hasText: "upcoming" }).first();
  await expect(upcoming).toBeVisible();
  await upcoming.click();

  await page.getByRole("button", { name: /Generate prediction/i }).click();
  await page.getByRole("button", { name: /Lock prediction/i }).click();

  await page.getByRole("button", { name: /Auto seal to Filecoin/i }).click();
  await expect(page.getByText(/Real Filecoin proof attached/i)).toBeVisible();
  await expect(page.locator(".proof-panel > .panel-head")).toContainText(/real proof/i);
  await expect(page.locator(".proof-lines")).toContainText(/verified/i);
  await expect(page.locator(".seal-checklist")).toContainText(/Backend configured/i);
  await expect(page.locator(".seal-checklist")).toContainText(/Health check/i);
  await expect(page.locator(".seal-checklist")).toContainText(/CID returned/i);
  await expect(page.locator(".seal-checklist")).toContainText(/Payload hash match/i);
  await expect(page.locator(".seal-checklist")).toContainText(/Verifier URL/i);
  await expect(page.locator(".seal-checklist")).toContainText(/Backend mode/i);
  await expect(page.locator(".seal-checklist")).toContainText(/mock seal API/i);
  await expect(page.locator(".seal-checklist")).toContainText(/Proof registry/i);
  await expect(page.locator(".seal-checklist")).toContainText(/memory storage/i);
  await expect(page.locator(".seal-checklist")).toContainText(/Upload auth/i);
  await expect(page.locator(".seal-checklist")).toContainText(/token not required/i);
  await expect(page.locator(".seal-checklist")).toContainText(/Upload limit/i);
  await expect(page.locator(".seal-checklist")).toContainText(/256 KB max/i);
  await expect(page.locator(".seal-links")).toContainText(/Verify CID/i);
  const cid = await page.locator(".proof-lines p").filter({ hasText: /^CID/ }).locator("span").innerText();
  expect(cid).toContain("bafy-mock-");

  await page.getByRole("button", { name: /Open verifier/i }).click();
  await page.getByLabel("Filecoin CID").fill(cid);
  await page.getByRole("button", { name: /Query CID/i }).click();
  await expect(page.locator(".cid-lookup")).toContainText(/CID verified by the seal API/i);
  await expect(page.locator(".cid-result")).toContainText(/mock-synapse-provider/i);

  await page.getByLabel("Filecoin CID").fill("bafy-not-registered");
  await page.getByRole("button", { name: /Query CID/i }).click();
  await expect(page.locator(".cid-lookup")).toContainText(/No proof metadata found/i);
});
