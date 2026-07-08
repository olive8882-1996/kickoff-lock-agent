import { expect, test } from "@playwright/test";

test("public shortcut URLs open the intended production surfaces", async ({ page }) => {
  await page.goto("?reset=1&e2e=1&view=account");
  await expect(page.getByRole("heading", { name: /Profile sync center/i })).toBeVisible();
  await expect(page.getByLabel("Brand asset packet")).toContainText(/Primary logo/i);
  await expect(page.getByLabel("Supabase setup packet")).toContainText(/Hosted project handoff/i);
  await expect(page.getByLabel("Supabase setup packet")).toContainText(/SUPABASE_DB_URL/i);
  await expect
    .poll(async () => page.getByAltText("Kickoff Lock Agent logo").evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);

  await page.goto("?reset=1&e2e=1&action=lock");
  await expect(page.getByRole("heading", { name: /Lock window/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate prediction/i })).toBeVisible();

  await page.goto("?reset=1&e2e=1&action=verify");
  await expect(page.getByLabel("Filecoin CID")).toBeVisible();
  await expect(page.getByRole("heading", { name: /No proof found/i })).toBeVisible();

  await page.goto("?reset=1&e2e=1&view=leaderboard");
  await expect(page.getByRole("heading", { name: /Verifiable prediction archive/i })).toBeVisible();
  await expect(page.getByLabel("Leaderboard scope")).toContainText(/global/i);
  await expect(page.getByLabel("Leaderboard backend readiness")).toContainText(/global scope/i);
});

test("runtime config public app URL drives generated public links", async ({ page }) => {
  await page.route("**/runtime-config.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `window.__KICKOFF_RUNTIME_CONFIG__ = Object.freeze({
        VITE_PUBLIC_APP_URL: "https://runtime.example/kickoff-lock-agent/",
        VITE_SUPABASE_URL: "https://runtime.supabase.co",
        VITE_SUPABASE_ANON_KEY: "runtime-anon",
        VITE_SUPABASE_REDIRECT_URL: "https://runtime.example/kickoff-lock-agent/"
      });`,
    });
  });

  await page.goto("?reset=1&e2e=1");
  const mainNav = page.getByRole("navigation", { name: "Main views" });
  await mainNav.getByRole("button", { name: "Account" }).click();
  await expect(page.getByLabel("Friend leaderboard invite")).toContainText(
    "https://runtime.example/kickoff-lock-agent/?friend=chengdu",
  );
  await expect(page.getByLabel("Production account bootstrap")).toContainText("https://runtime.supabase.co");

  await mainNav.getByRole("button", { name: "Match board" }).click();
  const upcoming = page.locator(".match-card").filter({ hasText: "upcoming" }).first();
  await expect(upcoming).toBeVisible();
  await upcoming.click();
  await page.getByRole("button", { name: /Generate prediction/i }).click();
  const lockButton = page.getByRole("button", { name: /Lock prediction/i });
  await expect(lockButton).toBeEnabled();
  await lockButton.click();

  await expect(page.getByText(/https:\/\/runtime\.example\/kickoff-lock-agent\/\?proof=/).first()).toBeVisible();
});

test("expanded product workflow is usable", async ({ page }) => {
  const jsonLdText = () =>
    page.locator('script[data-kickoff-public-proof="jsonld"]').evaluate((node) => node.textContent ?? "");

  await page.addInitScript(() => {
    window.open = ((url?: string | URL) => {
      if (url) {
        const key = "__kickoffOpenedUrls";
        const current = JSON.parse(window.localStorage.getItem(key) ?? "[]") as string[];
        window.localStorage.setItem(key, JSON.stringify([...current, String(url)]));
      }
      return null;
    }) as typeof window.open;
  });

  await page.goto("?reset=1&e2e=1");
  await expect(page.getByRole("heading", { name: /matches/i })).toBeVisible();
  await expect(page.getByText(/matches loaded/i)).toBeVisible();
  await expect(page.locator(".provider-readiness")).toContainText(/Live data readiness/i);
  await expect(page.locator(".provider-readiness")).toContainText(/Schedule/i);
  await expect(page.locator(".provider-readiness")).toContainText(/Lineups/i);
  await expect(page.locator(".provider-readiness")).toContainText(/Odds/i);
  await expect(page.getByLabel("Realtime data health")).toContainText(/Realtime data health/i);
  await expect(page.getByLabel("Realtime data health")).toContainText(/signals/i);
  await expect(page.getByLabel("Free data continuity evidence")).toContainText(/Free data continuity/i);
  await expect(page.getByLabel("Free data continuity evidence")).toContainText(/Schedule and score fallback chain/i);
  await expect(page.getByRole("button", { name: /Copy continuity/i })).toBeVisible();
  await expect(page.getByLabel("Realtime data evidence")).toContainText(/Realtime evidence packet/i);
  await expect(page.getByLabel("Realtime data evidence")).toContainText(/matches/i);
  await expect(page.getByLabel("Realtime data evidence")).toContainText(/Schedule/i);
  await expect(page.getByLabel("Public free feed read-back")).toContainText(/Public feed read-back/i);
  await expect(page.getByLabel("Public free feed read-back")).toContainText(/openfootball/i);
  await expect(page.getByLabel("Public free feed read-back")).toContainText(/TheSportsDB/i);
  await expect(page.getByLabel("Intelligence enrichment packet")).toContainText(/Enrichment evidence packet/i);
  await expect(page.getByLabel("Intelligence enrichment packet")).toContainText(/Lineups/i);
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

  await mainNav.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Settings panel")).toContainText(/Control room/i);
  await expect(page.getByLabel("Settings panel")).toContainText(/Leaderboard scope/i);
  await page.getByRole("button", { name: "Close panel" }).click();
  await mainNav.getByRole("button", { name: "Help" }).click();
  await expect(page.getByLabel("Help panel")).toContainText(/Launch checks/i);
  await expect(page.getByLabel("Help panel")).toContainText(/Test suites/i);
  await page.getByRole("button", { name: "Close panel" }).click();

  await mainNav.getByRole("button", { name: "Account" }).click();
  await expect(page.getByRole("heading", { name: /Profile sync center/i })).toBeVisible();
  await expect(page.locator(".cloud-status-grid")).toContainText(/Auto reconcile/i);
  await expect(page.locator(".cloud-status-grid")).toContainText(/Share cards/i);
  await expect(page.locator(".cloud-status-grid")).toContainText(/Share channel/i);
  await expect(page.getByLabel("Friend leaderboard code")).toHaveValue(/chengdu/i);
  await expect(page.getByLabel("Friend leaderboard invite")).toContainText(/chengdu/i);
  await expect(page.getByLabel("Friend leaderboard invite").getByRole("button", { name: /Copy friend invite/i })).toBeVisible();
  await expect(page.locator(".cloud-checklist")).toContainText(/Supabase env/i);
  await expect(page.locator(".cloud-checklist")).toContainText(/Refresh token/i);
  await expect(page.locator(".cloud-checklist")).toContainText(/Public profile/i);
  await expect(page.locator(".cloud-checklist")).toContainText(/Mode proofs/i);
  await expect(page.locator(".cloud-checklist")).toContainText(/Sync coverage/i);
  await expect(page.getByLabel("Cloud sync audit")).toContainText(/Cloud sync coverage/i);
  await expect(page.getByLabel("Cloud sync audit")).toContainText(/Prediction history/i);
  await expect(page.getByLabel("Cloud sync audit")).toContainText(/Content fingerprints/i);
  await expect(page.getByLabel("Cloud sync audit")).toContainText(/Public proof links/i);
  await expect(page.getByLabel("Cloud sync audit")).toContainText(/Leaderboard backend/i);
  await expect(page.getByLabel("Profile autosync status")).toContainText(/Local profile only|Sign-in required|Auto cloud save/i);
  await expect(page.getByLabel("Production runtime config")).toContainText(/Production environment gates/i);
  await expect(page.getByLabel("Production runtime config")).toContainText(/Supabase auth/i);
  await expect(page.getByLabel("Production runtime config")).toContainText(/Browser seal endpoint/i);
  await expect(page.getByLabel("Production env plan", { exact: true })).toContainText(/Production setup map/i);
  await expect(page.getByLabel("Production env plan summary")).toContainText(/Missing/i);
  await expect(page.getByLabel("Production env plan summary")).toContainText(/Invalid/i);
  await expect(page.getByLabel("Production env plan groups")).toContainText(/Browser runtime/i);
  await expect(page.getByLabel("Production env plan missing rows")).toContainText(
    /VITE_SUPABASE_URL|Run bun run env:production:plan/i,
  );
  await expect(page.getByRole("button", { name: /Copy plan/i })).toBeVisible();
  await expect(page.getByLabel("Production access preflight", { exact: true })).toContainText(/Production account access/i);
  await expect(page.getByLabel("Production access preflight summary")).toContainText(/Cloudflare/i);
  await expect(page.getByLabel("Production access preflight summary")).toContainText(/Supabase/i);
  await expect(page.getByLabel("Production access preflight stages")).toContainText(/Cloudflare deploy access|Preflight artifact/i);
  await expect(page.getByLabel("Production access preflight stages")).toContainText(/Account cloud sync targets/i);
  await expect(page.getByLabel("Production access preflight stages")).toContainText(/sharing:bootstrap/i);
  await expect(page.getByRole("button", { name: /Copy preflight/i })).toBeVisible();
  await expect(page.getByLabel("Production verification target env")).toContainText(/Production script env/i);
  await expect(page.getByLabel("Production env ledger summary")).toContainText(/Required keys/i);
  await expect(page.getByLabel("Production env groups")).toContainText(/Filecoin seals/i);
  await expect(page.getByLabel("Production env ledger", { exact: true })).toContainText(/KICKOFF_VERIFY_FILECOIN_RECORD_CID/i);
  await expect(page.getByLabel("Production env ledger", { exact: true })).toContainText(/seal:production-targets/i);
  await expect(page.getByRole("button", { name: /Copy ledger/i })).toBeVisible();
  await expect(page.getByLabel("Production acceptance collector")).toContainText(/Production acceptance collector/i);
  await expect(page.getByLabel("Production collector stages")).toContainText(/Verify production account access/i);
  await expect(page.getByLabel("Production collector stages")).toContainText(/public\/production-access-preflight\.json/i);
  await expect(page.getByLabel("Production collector stages")).toContainText(/Generate and upload public share images/i);
  await expect(page.getByLabel("Production collector stages")).toContainText(/public\/supabase-schema-apply\.json/i);
  await expect(page.getByLabel("Production collector stages")).toContainText(/Verify public proof pages and share images/i);
  await expect(page.getByLabel("Production collector stages")).toContainText(/Scout realtime fixture targets/i);
  await expect(page.getByLabel("Production collector stages")).toContainText(/public\/data-provider-readiness\.json/i);
  await expect(page.getByLabel("Production collector stages")).toContainText(/Seal Filecoin proof targets/i);
  await expect(page.getByRole("button", { name: /Copy collector/i })).toBeVisible();
  await expect(page.getByLabel("Production goal audit")).toContainText(/Original objective acceptance/i);
  await expect(page.getByLabel("Production goal requirements")).toContainText(/真实账号系统/i);
  await expect(page.getByLabel("Production goal requirements")).toContainText(/真实实时比赛数据/i);
  await expect(page.getByLabel("Production goal requirements")).toContainText(/真实 Filecoin 自动封存流程/i);
  await expect(page.getByLabel("Production goal requirements")).toContainText(/bun run goal:audit|bun run supabase:bootstrap/i);
  await expect(page.getByLabel("Production account bootstrap")).toContainText(/Supabase acceptance packet/i);
  await expect(page.getByLabel("Production account bootstrap")).toContainText(/seed:production-targets/i);
  await expect(page.getByLabel("Production account bootstrap")).toContainText(/Global leaderboard/i);
  await expect(page.getByLabel("Production account bootstrap")).toContainText(/Friend leaderboard/i);
  await expect(page.getByLabel("Production account bootstrap")).toContainText(/Season leaderboard/i);
  await expect(page.getByLabel("Supabase bootstrap stages")).toContainText(/Account setup stages/i);
  await expect(page.getByLabel("Supabase bootstrap stages")).toContainText(/Apply Supabase schema/i);
  await expect(page.getByLabel("Supabase bootstrap stages")).toContainText(/Verify account auth redirect/i);
  await expect(page.getByLabel("Supabase bootstrap stages")).toContainText(/seed:production-targets/i);
  await expect(page.getByLabel("Supabase bootstrap stages").getByRole("button", { name: /Copy stages/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Copy packet/i })).toBeVisible();
  await expect(page.getByLabel("Cloud read-back ledger")).toContainText(/Remote proof evidence/i);
  await expect(page.getByLabel("Cloud read-back ledger")).toContainText(/Private profile row/i);
  await expect(page.getByLabel("Cloud read-back ledger")).toContainText(/Share manifest rows/i);
  await expect(page.getByLabel("Cloud read-back ledger")).toContainText(/Content fingerprints/i);
  await expect(page.getByLabel("Cloud read-back ledger")).toContainText(/Anonymous proof links/i);
  await expect(page.getByLabel("Account handoff packet")).toContainText(/Cross-device handoff/i);
  await expect(page.getByLabel("Account handoff packet")).toContainText(/Cloud read-back/i);
  await expect(page.getByLabel("Account handoff packet")).toContainText(/Next action/i);
  await expect(page.getByRole("button", { name: /Copy handoff/i })).toBeVisible();
  await expect(page.getByLabel("Account cloud sync evidence")).toContainText(/Browser runtime sync packet/i);
  await expect(page.getByLabel("Account cloud sync evidence")).toContainText(/History hash/i);
  await expect(page.getByLabel("Account cloud sync evidence")).toContainText(/Public proofs/i);
  await expect(page.getByLabel("Account cloud sync evidence")).toContainText(/Leaderboard/i);
  await expect(page.getByLabel("Account cloud sync evidence").getByRole("button", { name: /Copy JSON/i })).toBeVisible();
  await expect(page.getByLabel("Cross-device recovery evidence")).toContainText(/Recovery rehearsal/i);
  await expect(page.getByLabel("Cross-device recovery evidence")).toContainText(/Cloud artifacts/i);
  await expect(page.getByLabel("Cross-device recovery evidence")).toContainText(/Clean-session restore/i);
  await expect(page.getByLabel("Cross-device recovery evidence")).toContainText(/Leaderboard scopes/i);
  await expect(page.getByRole("button", { name: /Copy recovery/i })).toBeVisible();
  await expect(page.getByLabel("Profile archive evidence packet")).toContainText(/Profile archive packet/i);
  await expect(page.getByLabel("Profile archive evidence packet")).toContainText(/Next action/i);
  await expect(page.getByRole("button", { name: /Copy archive packet/i })).toBeVisible();
  await expect(page.getByLabel("Production launch packet")).toContainText(/Production launch packet/i);
  await expect(page.getByLabel("Production launch packet")).toContainText(/Next action/i);
  await expect(page.getByRole("button", { name: /Copy launch packet/i })).toBeVisible();
  await expect(page.getByLabel("Production launch packet")).toContainText(/doctor:production/i);
  await expect(page.getByLabel("Production launch command queue")).toContainText(/Generate runtime config/i);
  await expect(page.getByLabel("Production launch command queue")).toContainText(/runtime:config:check/i);
  await expect(page.getByLabel("Production launch command queue")).toContainText(/Check live provider credentials/i);
  await expect(page.getByLabel("Production launch command queue")).toContainText(/seal:production-targets/i);
  await expect(page.getByLabel("Production launch env queue")).toContainText(/Target env keys/i);
  await expect(page.getByLabel("Filecoin automation evidence")).toContainText(/One-click seal evidence/i);
  await expect(page.getByLabel("Filecoin automation evidence")).toContainText(/Prediction seal lane/i);
  await expect(page.getByLabel("Filecoin automation evidence")).toContainText(/Required mode seal lanes/i);
  await expect(page.getByLabel("Filecoin automation evidence")).toContainText(/bracket proof seal/i);
  await expect(page.getByLabel("Filecoin automation evidence")).toContainText(/upset proof seal/i);
  await expect(page.getByRole("button", { name: /Seal queued lanes/i })).toBeVisible();
  await expect(page.getByLabel("Filecoin batch seal queue")).toContainText(/Prediction lane/i);
  await expect(page.getByLabel("Filecoin batch seal queue")).toContainText(/queued|missing/i);
  await expect(page.getByRole("button", { name: /Copy automation/i })).toBeVisible();
  await expect(page.getByLabel("Filecoin bootstrap stages")).toContainText(/Seal API setup stages/i);
  await expect(page.getByLabel("Filecoin bootstrap stages")).toContainText(/Preflight production seal API/i);
  await expect(page.getByLabel("Filecoin bootstrap stages")).toContainText(/Build seal target payloads/i);
  await expect(page.getByLabel("Filecoin bootstrap stages")).toContainText(/Seal production proof targets/i);
  await expect(page.getByLabel("Filecoin bootstrap stages").getByRole("button", { name: /Copy stages/i })).toBeVisible();
  await expect(page.getByLabel("Realtime data bootstrap stages")).toContainText(/Data provider setup stages/i);
  await expect(page.getByLabel("Realtime data bootstrap stages")).toContainText(/Deploy free feed CORS proxy/i);
  await expect(page.getByLabel("Realtime data bootstrap stages")).toContainText(/Preflight realtime data providers/i);
  await expect(page.getByLabel("Realtime data bootstrap stages")).toContainText(/Scout realtime fixture targets/i);
  await expect(page.getByLabel("Realtime data bootstrap stages").getByRole("button", { name: /Copy stages/i })).toBeVisible();
  await expect(page.getByLabel("Realtime production data packet")).toContainText(/Production data packet/i);
  await expect(page.getByLabel("Realtime production data packet")).toContainText(/Signals/i);
  await expect(page.getByRole("button", { name: /Copy data packet/i })).toBeVisible();
  await expect(page.getByLabel("Free data continuity evidence")).toContainText(/Cloud artifacts|External/i);
  await expect(page.getByLabel("Intelligence enrichment packet")).toContainText(/Enrichment evidence packet/i);
  await expect(page.getByRole("button", { name: /Copy enrichment/i })).toBeVisible();
  await expect(page.getByLabel("Leaderboard backend artifact")).toContainText(/Backend setup stages/i);
  await expect(page.getByLabel("Leaderboard backend artifact")).toContainText(/Seed leaderboard target rows/i);
  await expect(page.getByLabel("Leaderboard backend artifact")).toContainText(/Verify leaderboard backend scopes/i);
  await expect(page.getByLabel("Leaderboard backend scope queries")).toContainText(/Global scope/i);
  await expect(page.getByLabel("Leaderboard backend scope queries")).toContainText(/Friend scope/i);
  await expect(page.getByLabel("Leaderboard backend scope queries")).toContainText(/Season scope/i);
  await expect(page.getByLabel("Leaderboard backend artifact").getByRole("button", { name: /Copy backend/i })).toBeVisible();
  await expect(page.getByLabel("Leaderboard query evidence")).toContainText(/Leaderboard scope read-back/i);
  await expect(page.getByLabel("Public sharing bootstrap artifact")).toContainText(/Share card setup stages/i);
  await expect(page.getByLabel("Public sharing bootstrap artifact")).toContainText(/Generate record share image/i);
  await expect(page.getByLabel("Public sharing bootstrap artifact")).toContainText(/Upload mode share image/i);
  await expect(page.getByLabel("Public sharing bootstrap artifact")).toContainText(/Verify public sharing surfaces/i);
  await expect(page.getByLabel("Public sharing target channels")).toContainText(/Record share channel/i);
  await expect(page.getByLabel("Public sharing target channels")).toContainText(/Mode share channel 1/i);
  await expect(page.getByLabel("Public sharing bootstrap artifact").getByRole("button", { name: /Copy sharing/i })).toBeVisible();
  await expect(page.getByLabel("Share channel evidence packet")).toContainText(/X\/native share evidence/i);
  await expect(page.getByLabel("Share channel evidence packet")).toContainText(/share channels opened/i);
  await expect(page.getByRole("button", { name: /Copy share evidence/i })).toBeVisible();
  await expect(page.getByLabel("Share artifact ledger")).toContainText(/Publishable proof cards/i);
  await expect(page.getByRole("button", { name: /Publish missing cards/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open missing X channels/i })).toBeVisible();
  await expect(page.getByLabel("Share artifact ledger")).toContainText(/share channels/i);
  await expect(page.getByLabel("Production acceptance", { exact: true })).toContainText(/真实成品验收雷达/i);
  await expect(page.getByLabel("Production acceptance", { exact: true })).toContainText(/真实账号系统/i);
  await expect(page.getByLabel("Production acceptance", { exact: true })).toContainText(/真实 Filecoin 自动封存/i);
  await expect(page.getByLabel("Production acceptance", { exact: true })).toContainText(/排行榜后端/i);
  await expect(page.getByLabel("Production acceptance", { exact: true })).toContainText(/Supabase env configured/i);
  await expect(page.getByLabel("Production acceptance", { exact: true })).toContainText(/bun run doctor:supabase/i);
  await expect(page.getByLabel("Production acceptance", { exact: true })).toContainText(/bun run doctor:data/i);
  await expect(page.getByLabel("Acceptance test cases")).toContainText(/验收用例与测试规则/i);
  await expect(page.getByLabel("Acceptance test cases")).toContainText(/bun run test:e2e:seal/i);
  await expect(page.getByLabel("Acceptance test cases")).toContainText(/Cloud account and read-back/i);
  await expect(page.locator(".cloud-status-grid")).toContainText(/Pending sync/i);
  await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Pull cloud history/i })).toBeVisible();

  await mainNav.getByRole("button", { name: "Modes" }).click();
  await expect(page.getByRole("heading", { name: /Beyond single-match locks/i })).toBeVisible();
  await expect(page.getByLabel("Mode playbook packet")).toContainText(/Tournament mode lanes/i);
  await expect(page.getByLabel("Mode playbook packet")).toContainText(/Bracket path/i);
  await expect(page.getByLabel("Mode playbook packet")).toContainText(/Multi-match parlay/i);
  await expect(page.getByLabel("Mode playbook packet")).toContainText(/Agent vs Human/i);
  await expect(page.getByLabel("Mode playbook packet")).toContainText(/Upset challenge/i);
  await expect(page.getByRole("button", { name: /Create ready modes/i })).toBeVisible();
  await expect(page.getByLabel("Mode creation queue")).toContainText(/Bracket path/i);
  await expect(page.getByLabel("Mode creation queue")).toContainText(/queued|needs-input/i);
  await expect(page.getByRole("button", { name: /Copy playbook/i })).toBeVisible();
  await expect(page.getByLabel("Mode evidence packet")).toContainText(/Mode evidence packet/i);
  await expect(page.getByLabel("Mode evidence packet")).toContainText(/Next action/i);
  await expect(page.getByRole("button", { name: /Copy mode packet/i })).toBeVisible();
  await expect(page.getByLabel("Mode settlement packet")).toContainText(/Mode settlement packet/i);
  await expect(page.getByLabel("Mode settlement packet")).toContainText(/Next action/i);
  await expect(page.getByRole("button", { name: /Copy settlement/i })).toBeVisible();
  await expect(page.getByLabel("Agent calibration evidence")).toContainText(/Calibration evidence packet/i);
  await expect(page.getByLabel("Agent calibration evidence")).toContainText(/Reveal one locked prediction/i);
  await expect(page.getByRole("button", { name: /Copy calibration/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Seal a bracket path/i })).toBeVisible();
  await expect(page.locator(".bracket-grid article")).toHaveCount(4);
  await page.getByRole("button", { name: /Seal bracket proof/i }).click();
  await expect(page.locator(".bracket-runs")).toContainText(/Bracket path sealed/i);
  await expect(page.locator(".mode-grid article").filter({ hasText: "Agent vs Human" })).toBeVisible();
  const emptyUpsetCard = page.locator(".mode-grid article").filter({ hasText: "Upset challenge" });
  await expect(emptyUpsetCard).toContainText(/needs input/i);
  await expect(emptyUpsetCard.getByRole("button", { name: /Create mode proof/i })).toBeDisabled();

  await mainNav.getByRole("button", { name: "Match board" }).click();
  const upcoming = page.locator(".match-card").filter({ hasText: "upcoming" }).first();
  await expect(upcoming).toBeVisible();
  await upcoming.click();
  await expect(page.locator(".coverage-grid")).toContainText(/Schedule/i);
  await expect(page.locator(".coverage-grid")).toContainText(/Rank signal/i);
  await expect(page.getByLabel("Match intelligence score")).toContainText(/Intelligence score/i);
  await expect(page.getByLabel("Match data evidence")).toContainText(/Match data evidence/i);
  await expect(page.getByLabel("Match data evidence")).toContainText(/production signals/i);
  await expect(page.getByLabel("Match data evidence")).toContainText(/Next action/i);
  await expect(page.getByLabel("Match intelligence provenance")).toContainText(/Endpoint provenance/i);
  await expect(page.getByLabel("Match intelligence provenance")).toContainText(/auditable signals/i);
  await expect(page.getByLabel("Match intelligence provenance")).toContainText(/live endpoints/i);
  await expect(page.getByRole("button", { name: /Copy provenance/i })).toBeVisible();
  await expect(page.getByLabel("Intelligence action plan")).toContainText(/Action plan/i);
  await expect(page.locator(".intel-notes")).toContainText(/Ranking/i);
  await expect(page.locator(".intel-notes")).toContainText(/2026-06-11/i);
  await expect(page.locator(".coverage-grid")).toContainText(/Lineups/i);
  await page.getByRole("button", { name: /Generate prediction/i }).click();
  await page.locator(".score-inputs").getByLabel("Confidence").evaluate((input: HTMLInputElement) => {
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, "70");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator(".score-tile")).toContainText(/70% confidence/i);
  const lockButton = page.getByRole("button", { name: /Lock prediction/i });
  await expect(lockButton).toBeEnabled();
  await lockButton.click();

  await mainNav.getByRole("button", { name: "Memory" }).click();
  await expect(page.locator(".leaderboard-summary")).toContainText(/Proof source/i);
  await expect(page.locator(".leaderboard-readiness")).toContainText(/Supabase view/i);
  await expect(page.locator(".leaderboard-readiness")).toContainText(/Remote rows/i);
  await expect(page.locator(".leaderboard-readiness")).toContainText(/local fallback/i);
  await expect(page.getByLabel("Leaderboard evidence packet")).toContainText(/Leaderboard evidence packet/i);
  await expect(page.getByLabel("Leaderboard evidence packet")).toContainText(/Next action/i);
  await expect(page.getByRole("button", { name: /Copy leaderboard packet/i })).toBeVisible();
  await expect(page.getByLabel("Leaderboard season evidence packet")).toContainText(/Leaderboard season evidence/i);
  await expect(page.getByLabel("Leaderboard season evidence packet")).toContainText(/Season XP/i);
  await expect(page.getByLabel("Leaderboard season evidence packet")).toContainText(/Friend code/i);
  await expect(page.getByLabel("Leaderboard season evidence packet")).toContainText(/Season key/i);
  await expect(page.getByRole("button", { name: /Copy season packet/i })).toBeVisible();
  await expect(page.getByLabel("Leaderboard query evidence")).toContainText(/Leaderboard scope read-back/i);
  await expect(page.getByLabel("Leaderboard query evidence")).toContainText(/global/i);
  await expect(page.getByLabel("Leaderboard query evidence")).toContainText(/friend_code/i);
  await expect(page.getByLabel("Leaderboard query evidence")).toContainText(/season_key/i);
  await expect(page.locator(".leaderboard > article")).toContainText(/locks/i);
  await expect(page.locator(".leaderboard > article")).toContainText(/real proofs/i);
  await expect(page.locator(".leaderboard > article")).toContainText(/mode proofs/i);

  await mainNav.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: /Open public profile/i }).click();
  await expect(page.getByRole("heading", { name: /Kickoff Analyst/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Latest proof capsules/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Tournament mode runs/i })).toBeVisible();
  await expect(page.getByText(/Bracket path sealed/i)).toBeVisible();
  const publicPredictionRows = page.locator(".profile-records").filter({ hasText: "Latest proof capsules" });
  await expect(publicPredictionRows.locator("article")).toHaveCount(1);
  await expect(publicPredictionRows).toContainText(/Prediction \d+-\d+/i);
  await expect(page.getByLabel("Social metadata")).toContainText(/Public profile/i);
  await expect(page.getByLabel("Verifier packet")).toContainText(/Profile: Kickoff Analyst/i);
  await expect(page.getByLabel("Profile archive evidence packet")).toContainText(/Profile archive packet/i);
  await expect(page.getByLabel("Profile archive evidence packet")).toContainText(/Share-card manifests/i);
  await expect(page.getByLabel("Profile archive evidence packet")).toContainText(/Archive manifest/i);
  await expect(page.getByRole("button", { name: /Copy archive packet/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Copy manifest JSON/i })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /[?&]profile=/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Kickoff Analyst/i);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await expect.poll(jsonLdText).toMatch(/Person/i);
  await page.locator(".profile-records").filter({ hasText: "Tournament mode runs" }).getByRole("button", { name: /Verify/i }).first().click();
  await expect(page.getByRole("heading", { name: /Mode proof verification/i })).toBeVisible();
  await expect(page.getByLabel("Public mode proof visual evidence")).toContainText(/Logo fallback|Generated preview|Cloud mode card/i);
  await expect(page.getByLabel("Public mode proof visual evidence")).toContainText(/share manifest pending|share manifest resolved/i);
  await expect(page.locator(".proof-facts")).toContainText(/Mode proof facts/i);
  await expect(page.getByLabel("Proof timeline")).toContainText(/Mode proof created/i);
  await expect(page.getByLabel("Proof timeline")).toContainText(/Mode share image manifest/i);
  await expect(page.getByLabel("Public proof scorecard")).toContainText(/Public proof scorecard/i);
  await expect(page.getByLabel("Public proof scorecard")).toContainText(/Linked locks/i);
  await expect(page.getByLabel("Public proof scorecard")).toContainText(/Deployed public URL/i);
  await expect(page.getByLabel("Public proof share kit")).toContainText(/Share kit/i);
  await expect(page.getByLabel("Public proof share kit")).toContainText(/Generate share image before publishing/i);
  await expect(page.getByLabel("Public proof share kit")).toContainText(/Post to Xpending/i);
  await expect(page.getByLabel("Public proof share kit")).toContainText(/Share channel evidencepending/i);
  await expect(page.getByRole("button", { name: /Open X intent/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Copy share text/i })).toBeVisible();
  await expect(page.getByLabel("Verifier packet")).toContainText(/Mode proof: Bracket path/i);
  await expect(page.locator(".locked-payload")).toContainText(/modeRun/i);
  await expect(page.getByLabel("Social metadata")).toContainText(/Mode proof/i);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /[?&]mode=/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Mode proof/i);
  await expect.poll(jsonLdText).toMatch(/CreativeWork/i);
  await page.getByRole("button", { name: /Generate mode share image/i }).click();
  await expect(page.getByRole("heading", { name: /Mode share image/i })).toBeVisible();
  await expect(page.locator(".public-share-card img")).toHaveAttribute("src", /data:image\/png;base64,/);
  await expect(page.getByLabel("Public proof share kit")).toContainText(/local PNG manifest/i);
  await page.getByLabel("Public proof share kit").getByRole("button", { name: /Open X intent/i }).click();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("__kickoffOpenedUrls") ?? "")).toContain(
    "twitter.com/intent/tweet",
  );
  await expect(page.getByLabel("Public proof share kit")).toContainText(/Share channel evidencepending/i);
  await expect(page.getByLabel("Public proof share kit")).toContainText(/Publish matching HTTPS proof\/image URLs/i);

  await mainNav.getByRole("button", { name: "Match board" }).click();
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
  await expect(page.getByLabel("Public proof visual evidence")).toContainText(/Logo fallback|Generated preview|Cloud share card/i);
  await expect(page.getByLabel("Public proof visual evidence")).toContainText(/share manifest pending|share manifest resolved/i);
  await expect(page.locator(".public-proof-rail")).toContainText(/Public URL/i);
  await expect(page.getByLabel("Public proof judge summary")).toContainText(/Judge summary/i);
  await expect(page.getByLabel("Public proof judge summary")).toContainText(/Checks/i);
  await expect(page.getByLabel("Public proof judge summary")).toContainText(/CID/i);
  await expect(page.getByRole("button", { name: /Copy judge summary/i })).toBeVisible();
  await expect(page.getByLabel("Public proof share kit")).toContainText(/Share kit/i);
  await expect(page.getByLabel("Public proof share kit")).toContainText(
    /Generate share image before publishing|Generated locally, needs deployed URLs/i,
  );
  await expect(page.getByLabel("Public proof share kit")).toContainText(/Post to Xpending/i);
  await expect(page.getByLabel("Public proof share kit")).toContainText(/Share channel evidencepending/i);
  await expect(page.getByRole("button", { name: /Open X intent/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Copy share text/i })).toBeVisible();
  await expect(page.locator(".proof-facts")).toContainText(/Proof facts/i);
  await expect(page.getByLabel("Proof timeline")).toContainText(/Prediction locked/i);
  await expect(page.getByLabel("Proof timeline")).toContainText(/Filecoin proof attached/i);
  await expect(page.getByLabel("Public proof scorecard")).toContainText(/Public proof scorecard/i);
  await expect(page.getByLabel("Public proof scorecard")).toContainText(/Lock timing/i);
  await expect(page.getByLabel("Public proof scorecard")).toContainText(/Share image manifest/i);
  await expect(page.getByLabel("Verifier packet")).toContainText(/Kickoff Lock Agent verifier packet/i);
  await expect(page.getByLabel("Verifier packet")).toContainText(/Verify:/i);
  await expect(page.getByLabel("Social metadata")).toContainText(/Prediction/i);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /[?&]proof=/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Prediction/i);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /kickoff-lock-icon\.png|data:image\/png/i);
  await expect.poll(jsonLdText).toMatch(/CreativeWork/i);
  await page.getByLabel("Filecoin CID").fill("bafy-kickoff-test");
  await page.getByRole("button", { name: /Query CID/i }).click();
  await expect(page.locator(".cid-lookup")).toContainText(
    /VITE_FILECOIN_SEAL_API|Failed to fetch|No proof metadata found/i,
  );
  await page.getByRole("button", { name: /Generate public share image/i }).click();
  await expect(page.getByRole("heading", { name: /Share image/i })).toBeVisible();
  await expect(page.locator(".public-share-card img")).toHaveAttribute("src", /data:image\/png;base64,/);
  await expect(page.getByLabel("Public proof share kit")).toContainText(/local PNG manifest/i);
  await page.getByLabel("Public proof share kit").getByRole("button", { name: /Open X intent/i }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const opened = JSON.parse(window.localStorage.getItem("__kickoffOpenedUrls") ?? "[]") as string[];
        return opened.filter((url) => url.includes("twitter.com/intent/tweet")).length;
      }),
    )
    .toBeGreaterThanOrEqual(2);
  await expect(page.getByLabel("Public proof share kit")).toContainText(/Share channel evidencepending/i);
  await expect(page.getByLabel("Public proof share kit")).toContainText(/Publish matching HTTPS proof\/image URLs/i);
  await expect(page.getByLabel("Share card manifest")).toContainText(/Share card manifest/i);
  await expect(page.getByLabel("Share card manifest")).toContainText(/Hash/i);
  await expect(page.getByLabel("Share card manifest")).toContainText(/not publicly hosted yet/i);

  await mainNav.getByRole("button", { name: "Account" }).click();
  await expect(page.getByLabel("Share artifact ledger")).toContainText(/Publishable proof cards/i);
  await expect(page.getByRole("button", { name: /Publish missing cards/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open missing X channels/i })).toBeVisible();
  await expect(page.getByLabel("Share artifact ledger")).toContainText(/KB/i);
  await expect(page.getByLabel("Share artifact ledger")).toContainText(/Hash:/i);
  await expect(page.getByLabel("Share artifact ledger")).toContainText(/not publicly hosted/i);
  await expect(page.getByLabel("Share channel evidence packet")).toContainText(/Open X|X intent not ready/i);
  await expect(page.getByLabel("Share channel evidence packet")).toContainText(/open 'https:\/\/twitter\.com\/intent\/tweet/i);
  await expect(page.getByLabel("Share channel evidence packet")).toContainText(/kickoff_share_artifacts/i);
  await expect(page.getByLabel("Share channel evidence packet")).toContainText(/Authorization: Bearer \$VITE_SUPABASE_ANON_KEY/i);
  await page.getByRole("button", { name: /Open public profile/i }).click();
  await expect(page.locator(".public-profile-stats")).toContainText(/share cards/i);
  await expect(page.getByLabel("Profile share card evidence")).toHaveCount(2);
  const readyProfileShareBadges = page.locator(".profile-share-badge.ready");
  await expect(readyProfileShareBadges).toHaveCount(2);
  await expect(readyProfileShareBadges.first()).toContainText(/share card synced/i);
  await expect(readyProfileShareBadges.nth(1)).toContainText(/share card synced/i);

  await mainNav.getByRole("button", { name: "Modes" }).click();
  const upsetCard = page.locator(".mode-grid article").filter({ hasText: "Upset challenge" });
  await expect(upsetCard).toContainText(/ready/i);
  await upsetCard.getByRole("button", { name: /Create mode proof/i }).click();
  await expect(upsetCard.getByLabel("Upset ticket artifact")).toContainText(/Upset ticket/i);
  await expect(upsetCard.getByLabel("Upset ticket artifact")).toContainText(/bonus XP/i);
  await expect(upsetCard.locator("code")).toContainText(/bafy-kickoff/i);
  await expect(upsetCard.getByRole("button", { name: /Auto seal mode proof/i })).toBeVisible();
});
