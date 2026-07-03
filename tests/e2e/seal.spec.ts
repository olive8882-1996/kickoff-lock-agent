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
  await expect(page.locator(".seal-checklist")).toContainText(/Registry read-back/i);
  await expect(page.getByLabel("Auto seal status verification poll log")).toContainText(/Attempt 1/i);
  await expect(page.locator(".seal-checklist")).toContainText(/Upload auth/i);
  await expect(page.locator(".seal-checklist")).toContainText(/token not required/i);
  await expect(page.locator(".seal-checklist")).toContainText(/Upload limit/i);
  await expect(page.locator(".seal-checklist")).toContainText(/256 KB max/i);
  await expect(page.getByLabel("Filecoin seal evidence packet")).toContainText(/Filecoin seal evidence packet/i);
  await expect(page.getByLabel("Filecoin seal evidence packet")).toContainText(/registry hash match/i);
  await expect(page.getByLabel("Filecoin seal evidence packet")).toContainText(/FILECOIN_SEAL_MOCK is enabled/i);
  await expect(page.getByRole("button", { name: /Copy seal evidence/i }).first()).toBeVisible();
  await expect(page.locator(".seal-links")).toContainText(/Verify CID/i);
  const cid = await page.locator(".proof-lines p").filter({ hasText: /^CID/ }).locator("span").innerText();
  expect(cid).toContain("bafy-mock-");

  await page.getByRole("button", { name: /Open verifier/i }).click();
  await page.getByLabel("Filecoin CID").fill(cid);
  await page.getByRole("button", { name: /Query CID/i }).click();
  await expect(page.locator(".cid-lookup")).toContainText(/CID verified by the seal API/i);
  await expect(page.locator(".cid-result")).toContainText(/mock-synapse-provider/i);
  await expect(page.locator(".cid-result")).toContainText(/hash match/i);
  await page.getByRole("button", { name: /Attach to this capsule/i }).click();
  await expect(page.getByText(/CID proof attached after payload hash match/i)).toBeVisible();

  await page.getByLabel("Filecoin CID").fill("bafy-not-registered");
  await page.getByRole("button", { name: /Query CID/i }).click();
  await expect(page.locator(".cid-lookup")).toContainText(/No proof metadata found/i);

  await page.getByLabel("Main views").getByRole("button", { name: /Modes/i }).click();
  await page.getByRole("button", { name: /Seal bracket proof/i }).click();
  await expect(page.locator(".bracket-runs")).toContainText(/Bracket path sealed/i);
  await page.getByRole("button", { name: /Auto seal mode proof/i }).first().click();
  await expect(page.getByText(/Real Filecoin proof attached to mode proof/i)).toBeVisible();
  const modeRun = page.locator(".mode-runs > div").first();
  await expect(modeRun).toContainText(/Mode seal status/i);
  await expect(modeRun).toContainText(/verified/);
  await expect(modeRun).toContainText(/bafy-mock-/);
  await expect(modeRun.locator(".seal-checklist")).toContainText(/Payload hash match/i);
  await expect(modeRun.locator(".seal-checklist")).toContainText(/Registry read-back/i);
  await expect(modeRun.getByLabel("Mode seal status verification poll log")).toContainText(/Attempt 1/i);
  await expect(modeRun.locator(".seal-evidence-packet")).toContainText(/Filecoin seal evidence packet/i);
  await expect(modeRun.locator(".seal-links")).toContainText(/Verify CID/i);
});
