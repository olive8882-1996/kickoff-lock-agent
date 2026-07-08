import { expect, test } from "@playwright/test";

test("mock Filecoin seal flow is blocked from attaching fake production proof", async ({ page }) => {
  await page.goto("?reset=1&e2e=seal");
  const upcoming = page.locator(".match-card").filter({ hasText: "upcoming" }).first();
  await expect(upcoming).toBeVisible();
  await upcoming.click();

  await page.getByRole("button", { name: /Generate prediction/i }).click();
  await page.getByRole("button", { name: /Lock prediction/i }).click();

  await page.getByRole("button", { name: /Auto seal to Filecoin/i }).click();
  await expect(page.getByText(/Proof registry metadata is not production-ready/i).first()).toBeVisible();
  await expect(page.locator(".proof-panel > .panel-head")).toContainText(/demo proof/i);
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
  await expect(page.getByLabel("Auto seal status upload status poll log")).toContainText(/Job poll 1/i);
  await expect(page.getByLabel("Auto seal status verification poll log")).toContainText(/Attempt 1/i);
  await expect(page.locator(".seal-checklist")).toContainText(/Upload auth/i);
  await expect(page.locator(".seal-checklist")).toContainText(/token not required/i);
  await expect(page.locator(".seal-checklist")).toContainText(/Upload limit/i);
  await expect(page.locator(".seal-checklist")).toContainText(/256 KB max/i);
  await expect(page.getByLabel("Filecoin seal evidence packet")).toContainText(/Filecoin seal evidence packet/i);
  await expect(page.getByLabel("Filecoin seal evidence packet")).toContainText(/failed/i);
  await expect(page.getByLabel("Filecoin seal evidence packet")).toContainText(/registry pending/i);
  await expect(page.getByLabel("Filecoin seal evidence packet")).toContainText(/FILECOIN_SEAL_MOCK is enabled/i);
  await expect(page.getByRole("button", { name: /Copy seal evidence/i }).first()).toBeVisible();
  await expect(page.locator(".seal-links")).toContainText(/Verify CID/i);
  const proofMetadataHref = await page.locator(".seal-links a", { hasText: /Proof metadata/i }).getAttribute("href");
  const cid = proofMetadataHref?.split("/proof/").at(1) ?? "";
  expect(cid).toContain("bafy-mock-");

  await page.getByRole("button", { name: /Open verifier/i }).click();
  await page.getByLabel("Filecoin CID").fill(cid);
  await page.getByRole("button", { name: /Query CID/i }).click();
  await expect(page.locator(".cid-lookup")).toContainText(/CID proof metadata is not production-ready/i);
  await expect(page.getByRole("button", { name: /Attach to this capsule/i })).toHaveCount(0);

  await page.getByLabel("Filecoin CID").fill("bafy-not-registered");
  await page.getByRole("button", { name: /Query CID/i }).click();
  await expect(page.locator(".cid-lookup")).toContainText(/No proof metadata found/i);

  await page.getByLabel("Main views").getByRole("button", { name: /Modes/i }).click();
  await page.getByRole("button", { name: /Seal bracket proof/i }).click();
  await expect(page.locator(".bracket-runs")).toContainText(/Bracket path sealed/i);
  await page.getByRole("button", { name: /Auto seal mode proof/i }).first().click();
  await expect(page.getByText(/Proof registry metadata is not production-ready/i).first()).toBeVisible();
  const modeRun = page.locator(".mode-runs > div").first();
  await expect(modeRun).toContainText(/Mode seal status/i);
  await expect(modeRun).toContainText(/failed/);
  await expect(modeRun).toContainText(/bafy-mock-/);
  await expect(modeRun.locator(".seal-checklist")).toContainText(/Payload hash match/i);
  await expect(modeRun.locator(".seal-checklist")).toContainText(/Registry read-back/i);
  await expect(modeRun.getByLabel("Mode seal status upload status poll log")).toContainText(/Job poll 1/i);
  await expect(modeRun.getByLabel("Mode seal status verification poll log")).toContainText(/Attempt 1/i);
  await expect(modeRun.locator(".seal-evidence-packet")).toContainText(/Filecoin seal evidence packet/i);
  await expect(modeRun.locator(".seal-evidence-packet")).toContainText(/FILECOIN_SEAL_MOCK is enabled/i);
  await expect(modeRun.locator(".seal-links")).toContainText(/Verify CID/i);

  await page.getByLabel("Main views").getByRole("button", { name: /Account/i }).click();
  await expect(page.getByRole("heading", { name: /Profile sync center/i })).toBeVisible();
  const readBackCommands = page.getByLabel("Filecoin CID read-back commands");
  await expect(readBackCommands).toContainText(/Prediction upload status/i);
  await expect(readBackCommands).toContainText(/Prediction CID verification/i);
  await expect(readBackCommands).toContainText(/Prediction CID metadata/i);
  await expect(readBackCommands).toContainText(/bracket upload status/i);
  await expect(readBackCommands).toContainText(/bracket CID verification/i);
  await expect(readBackCommands).toContainText(/bracket CID metadata/i);
  await expect(readBackCommands).toContainText(/\/jobs\//i);
  await expect(readBackCommands).toContainText(/\/verify\?cid=bafy-mock-/i);
  await expect(readBackCommands).toContainText(/\/proof\/bafy-mock-/i);
});
