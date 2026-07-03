import { expect, test } from "@playwright/test";

test("expanded product workflow is usable", async ({ page }) => {
  await page.goto("?reset=1&e2e=1");
  await expect(page.getByRole("heading", { name: /matches/i })).toBeVisible();
  await expect(page.getByText(/matches loaded/i)).toBeVisible();
  await expect(page.locator(".provider-readiness")).toContainText(/Live data readiness/i);
  await expect(page.locator(".provider-readiness")).toContainText(/Schedule/i);
  await expect(page.locator(".provider-readiness")).toContainText(/Lineups/i);
  await expect(page.locator(".provider-readiness")).toContainText(/Odds/i);
  await expect(page.getByLabel("Provider route audit")).toContainText(/Provider route audit/i);
  await expect(page.getByLabel("Provider route audit")).toContainText(/API-Football/i);
  await expect(page.getByLabel("Provider route audit")).toContainText(/Seed continuity/i);
  await expect(page.locator(".match-card").first()).toContainText(/Intel/i);
  await expect(page.getByLabel("Live data sync status")).toContainText(/Last sync/i);
  await expect(page.getByLabel("Live data sync status")).toContainText(/Next auto/i);
  const mainNav = page.getByRole("navigation", { name: "Main views" });
  await expect(mainNav.getByRole("button", { name: "Account" })).toBeVisible();
  await expect(mainNav.getByRole("button", { name: "Modes" })).toBeVisible();
  await expect(page.locator(".brand-lockup img")).toHaveJSProperty("complete", true);
  await expect
    .poll(async () => page.locator(".brand-lockup img").evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);

  await mainNav.getByRole("button", { name: "Account" }).click();
  await expect(page.getByRole("heading", { name: /Profile sync center/i })).toBeVisible();
  await expect(page.locator(".cloud-status-grid")).toContainText(/Auto reconcile/i);
  await expect(page.locator(".cloud-status-grid")).toContainText(/Share cards/i);
  await expect(page.locator(".cloud-status-grid")).toContainText(/Share channel/i);
  await expect(page.locator(".cloud-checklist")).toContainText(/Supabase env/i);
  await expect(page.locator(".cloud-checklist")).toContainText(/Refresh token/i);
  await expect(page.locator(".cloud-checklist")).toContainText(/Public profile/i);
  await expect(page.locator(".cloud-checklist")).toContainText(/Mode proofs/i);
  await expect(page.locator(".cloud-checklist")).toContainText(/Sync coverage/i);
  await expect(page.getByLabel("Cloud sync audit")).toContainText(/Cloud sync coverage/i);
  await expect(page.getByLabel("Cloud sync audit")).toContainText(/Prediction history/i);
  await expect(page.getByLabel("Cloud sync audit")).toContainText(/Public proof links/i);
  await expect(page.getByLabel("Cloud sync audit")).toContainText(/Leaderboard backend/i);
  await expect(page.getByLabel("Production acceptance")).toContainText(/真实成品验收雷达/i);
  await expect(page.getByLabel("Production acceptance")).toContainText(/真实账号系统/i);
  await expect(page.getByLabel("Production acceptance")).toContainText(/真实 Filecoin 自动封存/i);
  await expect(page.getByLabel("Production acceptance")).toContainText(/排行榜后端/i);
  await expect(page.getByLabel("Acceptance test cases")).toContainText(/验收用例与测试规则/i);
  await expect(page.getByLabel("Acceptance test cases")).toContainText(/bun run test:e2e:seal/i);
  await expect(page.getByLabel("Acceptance test cases")).toContainText(/Cloud account and read-back/i);
  await expect(page.locator(".cloud-status-grid")).toContainText(/Pending sync/i);
  await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
  await expect(page.getByText(/Pull cloud history/i)).toBeVisible();

  await mainNav.getByRole("button", { name: "Modes" }).click();
  await expect(page.getByRole("heading", { name: /Beyond single-match locks/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Seal a bracket path/i })).toBeVisible();
  await expect(page.locator(".bracket-grid article")).toHaveCount(4);
  await page.getByRole("button", { name: /Seal bracket proof/i }).click();
  await expect(page.locator(".bracket-runs")).toContainText(/Bracket path sealed/i);
  await expect(page.getByText(/Agent vs Human/i)).toBeVisible();
  await expect(page.locator(".mode-grid article").filter({ hasText: "Upset challenge" })).toContainText(/playable/i);

  const upcoming = page.locator(".match-card").filter({ hasText: "upcoming" }).first();
  await expect(upcoming).toBeVisible();
  await upcoming.click();
  await expect(page.locator(".coverage-grid")).toContainText(/Schedule/i);
  await expect(page.locator(".coverage-grid")).toContainText(/Rank signal/i);
  await expect(page.getByLabel("Match intelligence score")).toContainText(/Intelligence score/i);
  await expect(page.getByLabel("Intelligence action plan")).toContainText(/Action plan/i);
  await expect(page.locator(".intel-notes")).toContainText(/Ranking/i);
  await expect(page.locator(".intel-notes")).toContainText(/2026-06-11/i);
  await expect(page.locator(".coverage-grid")).toContainText(/Lineups/i);
  await page.getByRole("button", { name: /Generate prediction/i }).click();
  const lockButton = page.getByRole("button", { name: /Lock prediction/i });
  await expect(lockButton).toBeEnabled();
  await lockButton.click();

  await mainNav.getByRole("button", { name: "Memory" }).click();
  await expect(page.locator(".leaderboard-summary")).toContainText(/Proof source/i);
  await expect(page.locator(".leaderboard-readiness")).toContainText(/Supabase view/i);
  await expect(page.locator(".leaderboard-readiness")).toContainText(/Remote rows/i);
  await expect(page.locator(".leaderboard-readiness")).toContainText(/local fallback/i);
  await expect(page.locator(".leaderboard article")).toContainText(/locks/i);
  await expect(page.locator(".leaderboard article")).toContainText(/real proofs/i);
  await expect(page.locator(".leaderboard article")).toContainText(/mode proofs/i);

  await mainNav.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: /Open public profile/i }).click();
  await expect(page.getByRole("heading", { name: /Kickoff Analyst/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Latest proof capsules/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Tournament mode runs/i })).toBeVisible();
  await expect(page.getByText(/Bracket path sealed/i)).toBeVisible();
  await expect(page.getByText(/Prediction 0-1/i)).toBeVisible();
  await page.locator(".profile-records").filter({ hasText: "Tournament mode runs" }).getByRole("button", { name: /Verify/i }).first().click();
  await expect(page.getByRole("heading", { name: /Mode proof verification/i })).toBeVisible();
  await expect(page.locator(".proof-facts")).toContainText(/Mode proof facts/i);
  await expect(page.locator(".locked-payload")).toContainText(/modeRun/i);
  await page.getByRole("button", { name: /Generate mode share image/i }).click();
  await expect(page.getByRole("heading", { name: /Mode share image/i })).toBeVisible();
  await expect(page.locator(".public-share-card img")).toHaveAttribute("src", /data:image\/png;base64,/);

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
  await expect(page.locator(".public-proof-rail")).toContainText(/Public URL/i);
  await expect(page.locator(".proof-facts")).toContainText(/Proof facts/i);
  await page.getByLabel("Filecoin CID").fill("bafy-kickoff-test");
  await page.getByRole("button", { name: /Query CID/i }).click();
  await expect(page.locator(".cid-lookup")).toContainText(/VITE_FILECOIN_SEAL_API|Failed to fetch/i);
  await page.getByRole("button", { name: /Generate public share image/i }).click();
  await expect(page.getByRole("heading", { name: /Share image/i })).toBeVisible();
  await expect(page.locator(".public-share-card img")).toHaveAttribute("src", /data:image\/png;base64,/);
});
