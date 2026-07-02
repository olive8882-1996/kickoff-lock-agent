import { expect, test } from "@playwright/test";

test("expanded product workflow is usable", async ({ page }) => {
  await page.goto("?reset=1&e2e=1");
  await expect(page.getByRole("heading", { name: /matches/i })).toBeVisible();
  await expect(page.getByText(/matches loaded/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Account/i }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: /Modes/i }).last()).toBeVisible();

  await page.getByRole("button", { name: /Account/i }).last().click();
  await expect(page.getByRole("heading", { name: /Profile sync center/i })).toBeVisible();
  await expect(page.locator(".cloud-status-grid")).toContainText(/Auto reconcile/i);
  await expect(page.locator(".cloud-checklist")).toContainText(/Supabase env/i);
  await expect(page.locator(".cloud-checklist")).toContainText(/Refresh token/i);
  await expect(page.locator(".cloud-checklist")).toContainText(/Public profile/i);
  await expect(page.getByText(/Pull cloud history/i)).toBeVisible();

  await page.getByRole("button", { name: /Modes/i }).last().click();
  await expect(page.getByRole("heading", { name: /Beyond single-match locks/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Seal a bracket path/i })).toBeVisible();
  await expect(page.locator(".bracket-grid article")).toHaveCount(4);
  await page.getByRole("button", { name: /Seal bracket proof/i }).click();
  await expect(page.locator(".bracket-runs")).toContainText(/Bracket path sealed/i);
  await expect(page.getByText(/Agent vs Human/i)).toBeVisible();

  const upcoming = page.locator(".match-card").filter({ hasText: "upcoming" }).first();
  await expect(upcoming).toBeVisible();
  await upcoming.click();
  await expect(page.locator(".coverage-grid")).toContainText(/Schedule/i);
  await expect(page.locator(".coverage-grid")).toContainText(/Rank signal/i);
  await expect(page.locator(".intel-notes")).toContainText(/Ranking/i);
  await expect(page.locator(".intel-notes")).toContainText(/2026-06-11/i);
  await expect(page.locator(".coverage-grid")).toContainText(/Lineups/i);
  await page.getByRole("button", { name: /Generate prediction/i }).click();
  const lockButton = page.getByRole("button", { name: /Lock prediction/i });
  await expect(lockButton).toBeEnabled();
  await lockButton.click();

  await page.getByRole("button", { name: /Memory/i }).last().click();
  await expect(page.locator(".leaderboard-summary")).toContainText(/Proof source/i);
  await expect(page.locator(".leaderboard article")).toContainText(/locks/i);
  await expect(page.locator(".leaderboard article")).toContainText(/real proofs/i);

  await page.getByRole("button", { name: /Account/i }).last().click();
  await page.getByRole("button", { name: /Open public profile/i }).click();
  await expect(page.getByRole("heading", { name: /Kickoff Analyst/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Latest proof capsules/i })).toBeVisible();
  await expect(page.locator(".profile-records")).toContainText(/Prediction/i);

  await page.getByRole("button", { name: /Auto seal to Filecoin/i }).click();
  await expect(page.getByText(/Auto seal status/i)).toBeVisible();
  await expect(page.getByText(/needs-config/i).first()).toBeVisible();

  await page.getByRole("button", { name: /Generate share image/i }).click();
  await expect(page.getByRole("heading", { name: /Social image/i })).toBeVisible();
  await expect(page.locator(".share-preview img")).toHaveAttribute("src", /data:image\/png;base64,/);

  await page.getByRole("button", { name: /Open verifier/i }).click();
  await expect(page.getByRole("heading", { name: /Proof verification/i })).toBeVisible();
  await expect(page.locator(".public-proof-hero")).toContainText(/Kickoff Lock Agent/i);
  await expect(page.locator(".public-proof-hero")).toContainText(/Prediction/i);
  await expect(page.locator(".proof-facts")).toContainText(/Proof facts/i);
  await page.getByLabel("Filecoin CID").fill("bafy-kickoff-test");
  await page.getByRole("button", { name: /Query CID/i }).click();
  await expect(page.locator(".cid-lookup")).toContainText(/VITE_FILECOIN_SEAL_API/i);
  await page.getByRole("button", { name: /Generate public share image/i }).click();
  await expect(page.getByRole("heading", { name: /Share image/i })).toBeVisible();
  await expect(page.locator(".public-share-card img")).toHaveAttribute("src", /data:image\/png;base64,/);
});
