# Kickoff Lock Agent

Kickoff Lock Agent turns World Cup predictions into verifiable Filecoin-backed memory capsules: sealed before kickoff, revealed after the final whistle.

## What It Does

- Pick a World Cup match.
- Ask the prediction agent to draft a scoreline, key players, confidence, and reasoning.
- Lock the prediction into a read-only capsule with hash, timestamp, CID, PieceCID, and proof status.
- Reveal after the match with an actual score.
- Get an explainable score and a generated 1200x675 social proof image with stadium artwork, CID, hash, proof status, and public verifier URL.
- Keep share-card acceptance evidence for generated proof cards, generated mode cards, public proof URLs, public image URLs that read back, PNG manifest hashes, byte sizes, and opened X/native share channels.
- Keep every revealed call in a tournament memory dashboard.
- Sign in with Supabase Google OAuth or magic links to sync profile, prediction history, public proof links, and global/friend/season leaderboards.
- Verify cloud sync by reading profile, records, mode proof runs, share card manifests, public share image URLs, content fingerprints, public proof links, and public profile archive contents back from Supabase instead of trusting write-only success.
- Verify leaderboard backend health with per-scope query evidence for global, friend-code, and season filters, including current-user presence, instead of trusting stale rows or local fallback rankings.
- Inspect a structured realtime-data evidence packet for every sync: active route, match counts, per-signal live/configured/fallback/missing coverage, sample fixtures, warning state, and production-readiness status.
- Build a 4-pick knockout path in the bracket builder, then seal it as its own proof run.
- Create additional mode proof runs for parlays, Agent vs Human calibration, and upset challenges, each with a public verifier and mode share image.
- Use the Account production acceptance radar to see which competition-grade areas are verified, ready, partial, or blocked in the current environment.

## Links

- Live demo: https://olive8882-1996.github.io/kickoff-lock-agent/
- Repository: https://github.com/olive8882-1996/kickoff-lock-agent
- Screenshot: https://olive8882-1996.github.io/kickoff-lock-agent/kickoff-lock-screenshot.png
- Demo video: https://olive8882-1996.github.io/kickoff-lock-agent/kickoff-lock-demo.mov

## Brand Assets

- Primary icon: `public/assets/kickoff-lock-icon.png`
- Browser favicon: `public/assets/kickoff-lock-icon-32.png`
- PWA icon set: `public/assets/kickoff-lock-icon-192.png` and `public/assets/kickoff-lock-icon-512.png`
- Apple touch icon: `public/assets/kickoff-lock-apple-touch.png`
- The generated trophy-lock logo is used in the hero lockup, public proof masthead, share-card renderer, browser favicon, Open Graph/Twitter preview image, and PWA manifest.

## Data Strategy

The app works without API keys.

1. Primary when configured: API-Football for fixtures, scores, lineups, injuries and odds.
2. Secondary when configured: Football-Data.org for fixtures, live/final scores, stage, venue and team metadata.
3. Default free World Cup feed: TheSportsDB v1 JSON API for season fixtures, live/final scores, venue, status and optional lineup/stat enrichment.
4. Public fallback: ESPN scoreboard API.
5. Fallback: worldcup26.ir.
6. Safety net: bundled seed matches and manual result input.

The Odds API can also be configured for H2H odds enrichment on non API-Football fixtures. External APIs are used for match/result convenience and data evidence; the core product mechanic is still the prediction capsule and proof flow.
Each match now exposes a data coverage panel for schedule, score, rank signal, lineups, injuries and odds, and the match board includes a live data readiness checklist, so missing or fallback intelligence is visible instead of being presented as real live data.
The match board also shows a provider route audit for API-Football, Football-Data.org, TheSportsDB, ESPN, worldcup26 and seed continuity, including active, fallback, skipped, failed and needs-config states.
The match board also includes a realtime data health gate that combines the active provider route, verified provider response audit, provider enrichment read-back, last sync freshness, live/configured signal count, production read-back count, evidence rows, and missing enrichment signals before the production radar treats match data as ready.
API-Football fixture rows only count as schedule/score evidence. Lineups, injuries and odds stay missing until their dedicated enrichment endpoints have been called and read back, so a fixture response alone cannot make realtime-data acceptance look complete. When `VITE_APIFOOTBALL_KEY` is configured, refresh attempts API-Football lineups, injuries and odds read-back for the first `VITE_APIFOOTBALL_ENRICHMENT_LIMIT` fixtures, defaulting to 12 to stay within provider quotas.
TheSportsDB also performs a controlled free enrichment pass by default, reading event lineups and stats for the first `VITE_THESPORTSDB_ENRICHMENT_LIMIT` events, defaulting to 8. That gives the default free route real lineup/stat read-back evidence when TheSportsDB has published those event details, while injury and odds gaps remain visible until separate providers cover them.
Each refresh now also builds a realtime evidence packet. It records the serving provider, route status, provider endpoint/status/row count/sample IDs, checked timestamp, API-Football or TheSportsDB enrichment endpoint read-back, live/final/upcoming match counts, per-signal coverage totals for schedule, scores, rankings, lineups, injuries and odds, plus sample fixture coverage. Seed fallback packets stay marked evidence-only even when they keep the app usable.
Each fixture also gets a 0-100 intelligence score with a lock-risk label and action plan, so users can tell whether a prediction is backed by live providers, configured enrichment, fallback intelligence, or manual reveal risk.
The match board also auto-refreshes provider data on a short interval, shows last sync and next auto-sync timestamps, and keeps manual refresh available for live score checks during a match window.
Rank signal uses a bundled FIFA/Coca-Cola Men's World Ranking snapshot from the 2026-06-11 official update as a baseline for provider feeds that do not return rankings directly. Lineups, injuries and odds may show configured provider keys in the UI, but production acceptance requires live endpoint read-back for each enrichment layer. API-Football can supply fixture lineups, injuries and odds, while The Odds API can enrich H2H market prices for non API-Football fixtures.
TheSportsDB defaults to the free v1 key `123`, World Cup league id `4429`, current UTC year season, and an enrichment limit of 8; override with `VITE_THESPORTSDB_KEY`, `VITE_THESPORTSDB_LEAGUE_ID`, `VITE_THESPORTSDB_SEASON`, and `VITE_THESPORTSDB_ENRICHMENT_LIMIT` if TheSportsDB changes tournament IDs or quota behavior.

## Remaining External Production Acceptance

The application code now contains the main product surfaces, and the public deployment currently publishes passing acceptance evidence. `bun run verify:production` is the source of truth for what is externally proven. The current public evidence verifies the deployed app shell, logo asset, acceptance evidence, redirect URL, share bucket name, and free public schedule continuity. The following checks remain incomplete until they are exercised against real deployed services and synced user artifacts:

1. Supabase account sync must read back the profile, records, mode runs, share manifests, content fingerprints, public proof links, public profile archive rows, and public share images from a real hosted project.
2. Realtime data must show a non-seed active provider with fresh response audit plus live endpoint read-back for lineups, injuries and odds.
3. Filecoin sealing must use a production Synapse backend with token auth and persistent proof storage, then verify one prediction capsule and one mode proof through `/proof/:cid`.
4. Public sharing must use deployed HTTPS proof URLs and Supabase Storage image URLs that pass public read-back, then exercise X/native share once.
5. Leaderboards must load global, friend and season Supabase scopes and confirm the current user appears in every scoped result.
6. The final release pass must rerun `bun run verify:acceptance`, `bun run verify:production`, `bun run build`, and then redeploy `dist/` so public evidence remains fresh.

## Filecoin Strategy

The browser app runs in **demo proof mode** by default. Demo mode is clearly labeled and never pretends to be a real on-chain write.

For real storage, use the Synapse adapter:

```bash
cp .env.example .env
SYNAPSE_PRIVATE_KEY=0x... KICKOFF_CAPSULE_PATH=./proofs/demo-prediction-capsule.json bun run seal:synapse
```

The generated proof JSON can be pasted into the app's "Import real proof JSON" panel.

For one-click browser sealing, run the seal API on a trusted server and point the frontend at `POST /seal`:

```bash
SYNAPSE_PRIVATE_KEY=0x... \
FILECOIN_PROOF_STORE_PATH=./proofs/filecoin-proof-store.json \
FILECOIN_SEAL_TOKEN=change-me \
FILECOIN_MAX_UPLOAD_BYTES=262144 \
ALLOW_ORIGIN=https://your-site.example \
bun run seal:api
```

Set the browser build with the matching `VITE_FILECOIN_SEAL_API` and `VITE_FILECOIN_SEAL_TOKEN`. The token is optional for local demos, but recommended for production because `POST /seal` spends backend resources.

Local smoke test without spending funds:

```bash
FILECOIN_SEAL_MOCK=1 bun run seal:api:mock
```

End-to-end seal workflow test without spending funds:

```bash
bun run test:e2e:seal
```

Generate production acceptance run evidence before a final submission build:

```bash
bun run verify:acceptance
```

This runs the acceptance command set, writes `public/acceptance-evidence.json`, and lets the Account production radar prove that the listed suites were actually run. The packet includes the current acceptance suite manifest hash, and run evidence older than 7 days is rejected, so stale evidence is rejected after commands, spec coverage, proof text or release timing changes. The generated file is intentionally git-ignored; CI or the release operator should create it before `bun run build`.
Because Vite copies files from `public/` during build, the final release order is `bun run verify:acceptance` first, then `bun run build`, then deploy `dist/`.

The API exposes `GET /health`, `POST /seal`, `GET /verify?cid=...`, and `GET /proof/:cid`. Each successful seal is registered by CID with payload hash, byte length, provider metadata, and checked timestamps, so the verifier only reports proof metadata for CIDs sealed by that backend instance. Set `FILECOIN_PROOF_STORE_PATH` to persist that registry across server restarts; without it, the server falls back to memory-only mode for local demos. Set `FILECOIN_SEAL_TOKEN` to require a bearer token for browser upload requests while leaving public proof verification readable. Set `FILECOIN_MAX_UPLOAD_BYTES` to cap browser seal payload size; the API rejects invalid capsule JSON and oversized uploads before invoking Synapse.
`POST /seal` only accepts locked, sealed prediction capsules with a 64-character SHA-256 capsule payload hash and prediction payload, or sealed/scored tournament mode proof runs with a 64-character mode payload hash and linked capsule ids. Draft or unlocked artifacts are rejected before Synapse upload, so production sealing cannot spend backend resources on mutable predictions or incomplete mode proofs.
`GET /health` returns `productionReady` plus a `blockers` array. Production readiness requires real Synapse mode, `SYNAPSE_PRIVATE_KEY`, `FILECOIN_SEAL_TOKEN`, persistent proof storage, and a valid upload limit; mock mode can still pass local E2E but stays blocked in the production radar.
The frontend runs a health preflight, uploads the stable capsule or mode proof payload, verifies that the seal API returns the same uploaded payload hash, polls CID verification, reads `/proof/:cid` back from the proof registry, checks the registry CID/hash/byte length against the upload, stores proof/verify URLs, and renders a Filecoin acceptance checklist for backend configuration, API health, production backend readiness, upload acceptance, payload hash match, CID return, verification polling, registry read-back, verifier URL readiness, backend mode, proof registry persistence, and upload token enforcement. Tournament mode proof runs expose the same Auto seal workflow from the Modes view, render the same checklist directly inside each mode run card, then sync the returned real proof back to Supabase with the mode run.
Production Filecoin readiness requires both surfaces: at least one locked prediction capsule and at least one tournament mode proof must have a real proof, verified seal job, matching uploaded payload hash, CID verification and `/proof/:cid` registry read-back. A record-only seal is useful progress, but it does not complete the Filecoin production radar.
The public verifier's CID lookup can also attach a returned real proof back to a local capsule, but only when the seal API returns either no payload hash or a payload hash matching that capsule. A mismatched hash blocks the attach action so an unrelated CID cannot replace the locked prediction proof.
The seal panel deliberately distinguishes mock smoke-test sealing from a production Synapse backend with `SYNAPSE_PRIVATE_KEY`, so demo verification cannot be mistaken for a funded Filecoin upload.
The public verifier also includes a CID lookup panel that queries the configured seal API and displays proof status, PieceCID, provider, dataset, and retrieval URL.

Key files:

- `src/proof.ts`: capsule hash, demo proof, real proof import.
- `src/providers.ts`: API-Football, Football-Data.org, TheSportsDB, ESPN, The Odds API, worldcup26 and seed fallback.
- `src/scoring.ts`: explainable scoring engine.
- `src/cloud.ts`: Supabase auth, profile sync, prediction history sync, mode proof run sync, authenticated and anonymous read-back verification, public proof/profile lookup, and leaderboard queries.
- `src/bracket.ts`: knockout path builder, bracket readiness rules, and bracket proof run sealing.
- `src/modes.ts`: bracket/parlay/agent/upset mode proof runs, including parlay tickets, agent calibration reports and upset bonus tickets.
- `src/readiness.ts`: production acceptance radar for real account sync, live data, Filecoin sealing, sharing, leaderboards, modes, and automated tests.
- `src/acceptance.ts`: explicit acceptance test manifest and run-evidence summary covering scoring, proof hashes, cloud read-back, providers, share cards, Filecoin API, modes, browser E2E and seal E2E.
- `scripts/seal-with-synapse.mjs`: real Synapse/Filecoin adapter.
- `server/filecoin-seal-api.mjs`: one-click seal API and CID verification endpoints.

## Run Locally

```bash
bun install
bun run dev
```

Build:

```bash
bun run build
```

Test:

```bash
bun run test
bun run test:e2e
bun run test:e2e:seal
bun run verify:acceptance
bun run verify:production
bun run doctor:production
bun run doctor:supabase
bun run doctor:filecoin
bun run doctor:data
bun run doctor:sharing
bun run seed:production-targets --dry-run
bun run deploy:pages
bun run pages:rebuild
```

The Account view includes an "Acceptance tests" panel that maps each production requirement to the command and spec file that verifies it. It also reads `public/acceptance-evidence.json`, including its suite manifest hash, so final review can check both the test rule and the latest matching run evidence before trusting the readiness score.
The Account view also includes a "Production environment gates" panel. It checks Supabase auth/redirect env vars, TheSportsDB schedule continuity, API-Football lineup/injury enrichment, odds provider keys, browser Filecoin seal API/token configuration and the deployed HTTPS public app URL before treating a local build as production-ready.
`bun run verify:production` loads `.env.example` as low-priority non-secret defaults, then overlays `.env`, `.env.local`, `.env.production`, and `.env.production.local`, before writing `public/production-evidence.json`. The packet records which env files were loaded without exposing values. It checks the deployed public app URL, published acceptance evidence manifest and 7-day freshness, Supabase backend health, explicit Supabase target rows for profile/prediction/mode/share artifact, leaderboard rows for the current user, free public schedule continuity through TheSportsDB or ESPN, API-Football enrichment routes, the Filecoin seal API health contract, Filecoin record/mode CID proof read-back, browser-rendered public profile/proof/mode pages, and a public share-image URL. Public page checks use Playwright when `KICKOFF_VERIFY_PROFILE_ID`, `KICKOFF_VERIFY_PROOF_ID`, or `KICKOFF_VERIFY_MODE_ID` are present, so a static app-shell HTTP 200 cannot satisfy proof-page acceptance by itself. Filecoin checks require one prediction CID and one mode proof CID to pass both `/verify?cid=` and `/proof/:cid`, with payload hash and byte length read back from the seal API registry. The Account view includes a "Production script env" block that turns the current synced profile, proof, mode proof and public share image into `KICKOFF_VERIFY_*` variables for `.env.production.local`, and the main production radar now scores the loaded production evidence as its own external-evidence gate. Set `KICKOFF_VERIFY_ALLOW_FAILURES=1` when you want a diagnostic packet without failing the command.
`bun run doctor:production` reads the same env files and `production-evidence.json`, then groups the external checks into seven operator-facing acceptance areas: real account/cloud history, realtime match data, Filecoin auto-seal, public share cards/proof pages, leaderboard backend, public deployment assets, and automated test evidence. It exits non-zero until every group is externally proven, and prints the missing runtime env keys plus the next target IDs/CIDs/share image URLs needed for the next verification run.
`bun run doctor:supabase` is the focused cloud backend drill-down. It uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to query `kickoff_backend_health`, every public-read table/view, explicit profile/prediction/mode/share target rows, all three current-user leaderboard scopes, and `KICKOFF_VERIFY_SHARE_IMAGE_URL`. If `SUPABASE_SERVICE_ROLE_KEY` is set locally, it also checks the Supabase Storage bucket metadata and confirms `kickoff-share-cards` is public; this service role key is intentionally not a `VITE_` variable and must never be shipped to the browser.
`bun run doctor:filecoin` is the focused Filecoin drill-down. It checks the configured browser seal endpoint, upload token, `/health` production contract, required endpoint list, record CID `/verify` plus `/proof/:cid` read-back, mode CID read-back, payload hash targets and byte length. `KICKOFF_FILECOIN_DOCTOR_SEAL_PAYLOAD` is optional and intentionally blank by default; set it only when you want the doctor to spend a real POST `/seal` upload against a locked capsule or sealed/scored mode proof JSON file.
`bun run doctor:data` is the focused realtime-data drill-down. It checks free schedule continuity through TheSportsDB or ESPN, API-Football key and `KICKOFF_VERIFY_FIXTURE_ID`, live rows from API-Football lineups, injuries and odds endpoints, odds provider configuration, and optional The Odds API H2H read-back. Empty endpoint responses stay failed, so configured keys alone cannot satisfy live-data acceptance.
`bun run doctor:sharing` is the focused public sharing drill-down. It renders the deployed profile, prediction proof and mode proof URLs with Playwright, then checks canonical links, required visible proof content, forbidden fallback states, Open Graph/Twitter metadata, JSON-LD and a public share-card image URL. It exits non-zero until `VITE_PUBLIC_APP_URL`, `KICKOFF_VERIFY_PROFILE_ID`, `KICKOFF_VERIFY_PROOF_ID`, `KICKOFF_VERIFY_MODE_ID` and `KICKOFF_VERIFY_SHARE_IMAGE_URL` point at real deployed artifacts.
`bun run seed:production-targets --dry-run` builds the Supabase production acceptance target rows without writing them: one public profile, one prediction proof row, one mode proof row, record/mode share artifact manifests and a ready-to-copy `KICKOFF_VERIFY_*` block. Remove `--dry-run` only after `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `KICKOFF_SEED_SHARE_IMAGE_URL` point at a real project and public generated share-card image; the script then upserts those rows with the service role key and runs the Supabase doctor read-back.
`docs/deploy-pages.workflow.yml` is a ready-to-install GitHub Actions workflow for the same evidence pipeline. It publishes once after `bun run verify:acceptance`, waits for Pages propagation, runs `KICKOFF_VERIFY_ALLOW_FAILURES=1 bun run verify:production`, then publishes again so the deployed app includes both fresh acceptance evidence and the latest production evidence packet. The file is kept under `docs/` because pushing a live `.github/workflows` file requires a GitHub token with `workflow` scope. Locally, `bun run deploy:pages` uses the same `scripts/deploy-gh-pages.mjs` sync path.
If GitHub Pages stays in a stale `building` state after pushing `gh-pages`, run `bun run pages:rebuild` to request a fresh Pages build through the GitHub API.

## Cloud Backend

Create the tables and views in `supabase.schema.sql`, then set:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SUPABASE_REDIRECT_URL=https://your-site.example/kickoff-lock-agent/
VITE_SUPABASE_SHARE_BUCKET=kickoff-share-cards
SUPABASE_SERVICE_ROLE_KEY=... # optional local-only doctor:supabase bucket metadata check; never expose as VITE_
VITE_PUBLIC_APP_URL=https://your-site.example/kickoff-lock-agent/
VITE_APIFOOTBALL_KEY=...
VITE_APIFOOTBALL_ENRICHMENT_LIMIT=12
VITE_FOOTBALL_DATA_TOKEN=...
VITE_FOOTBALL_DATA_COMPETITION=WC
VITE_THESPORTSDB_KEY=123
VITE_THESPORTSDB_LEAGUE_ID=4429
VITE_THESPORTSDB_SEASON=2026
VITE_THESPORTSDB_ENRICHMENT_LIMIT=8
VITE_ODDS_API_KEY=...
VITE_ODDS_API_SPORT_KEY=...
KICKOFF_VERIFY_USER_ID=...
KICKOFF_VERIFY_PROFILE_ID=...
KICKOFF_VERIFY_PROOF_ID=...
KICKOFF_VERIFY_MODE_ID=...
KICKOFF_VERIFY_FILECOIN_RECORD_CID=...
KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH=...
KICKOFF_VERIFY_FILECOIN_MODE_CID=...
KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH=...
KICKOFF_VERIFY_FRIEND_CODE=chengdu
KICKOFF_VERIFY_SEASON_KEY=world-cup-run
KICKOFF_VERIFY_FIXTURE_ID=...
KICKOFF_VERIFY_SHARE_IMAGE_URL=https://...
KICKOFF_SEED_SHARE_IMAGE_URL=https://... # public generated PNG used by seed:production-targets
KICKOFF_SEED_USER_ID=... # optional; defaults to KICKOFF_VERIFY_USER_ID or kickoff-production-seed
KICKOFF_SEED_EMAIL=... # optional
KICKOFF_SEED_DISPLAY_NAME=... # optional
KICKOFF_SEED_LOCATION=Chengdu # optional
```

The schema also creates `kickoff_backend_health`, a public-read health view that reports schema version, required tables, required views, RLS status and policy count. Account readiness requires that view to pass before row read-back can count as production cloud sync. It also creates a public Supabase Storage bucket named `kickoff-share-cards` plus read/upload/update policies for generated proof-card PNGs; set `VITE_SUPABASE_SHARE_BUCKET` to the same bucket so share manifests can store deployed HTTPS `imageUrl` values that the app can read back before marking sharing production-ready.
Public proof pages can load a capsule from Supabase by `?proof=<capsule-id>` when the record has been synced. Tournament mode proofs can also be opened by `?mode=<mode-run-id>`, including bracket paths, parlays, calibration reports and upset tickets. Share URLs are built from `VITE_PUBLIC_APP_URL` when it is configured; local `window.location` links remain available for development but do not pass production sharing readiness.
Public proof and mode proof pages also read the matching `kickoff_share_artifacts` manifest when it exists. The verifier shows whether the social proof card evidence came from a local generation or cloud read-back, and displays the PNG file name, byte size, MIME type, SHA-256 hash, proof URL and share-channel status alongside the locked payload.
Public profile pages include the same share-card evidence. Each prediction and mode proof row marks whether a publishable share card is synced, and the profile stats include the total number of share cards available for that profile.
Public proof, mode proof and profile pages also publish canonical links, Open Graph tags, Twitter card tags and JSON-LD, with a visible Social metadata card that shows the active preview title, URL, image source and manifest hash when a generated share-card artifact exists.
After a Supabase Google OAuth or magic-link sign-in, the app stores the Supabase session, refreshes expired access tokens when a refresh token is available, automatically pulls cloud history, merges it with local prediction records, local mode proof runs and share card manifests, keeps the richest version, and syncs the merged history back to Supabase. The Account view includes a cloud acceptance checklist for env configuration, auth session, refresh token, cloud records, mode proof runs, share manifests, content fingerprints, pending sync coverage and public profile archive readiness.
The Account view also includes a cross-device cloud sync audit plus a read-back ledger for profile, prediction history, mode proof history, share card manifests, public share image URLs, content fingerprints, public proof links, public profile archives and leaderboard backend evidence. The ledger lists verified and missing capsule/mode/proof/share IDs, image URL IDs, public profile archive IDs and content fingerprint IDs, so local-only fallback state, partial Supabase writes, and stale remote rows are visible before claiming cloud readiness.
The production account radar now requires matching content fingerprints for records, mode proof runs and share card manifests. Matching row counts alone are not enough; stale remote JSON keeps the account item below verified until the exact locked payloads read back from Supabase.
The Account view also includes a production acceptance radar. It deliberately keeps demo/local states visible by scoring real account sync, realtime data enrichment, production Filecoin sealing, public share cards, leaderboard backend rows, sealed mode runs, automated test evidence and external deployment evidence separately. Public sharing acceptance now uses Supabase-backed card manifests in `kickoff_share_artifacts` with PNG filename, byte size, SHA-256 image hash, deployed HTTPS proof URL, deployed HTTPS image URL, cloud manifest read-back, public image URL read-back, public-link read-back, and X/native share-channel exercise instead of a transient "image generated this session" flag. Localhost or path-only card URLs can still be previewed during development, but they remain non-production evidence. Mode acceptance is also public-evidence based: bracket, parlay, Agent vs Human and upset all need a sealed/scored mode run, matching Supabase content fingerprint, anonymous `?mode=` proof read-back and a production HTTPS mode share card before the radar marks modes complete. The Account view also exposes a share artifact ledger so each record and mode proof shows whether its publishable card evidence is complete.
Tournament mode proof runs are stored in `kickoff_mode_runs`, so bracket paths, parlay tickets, Agent vs Human calibration reports and upset challenges can appear on the public profile across devices instead of staying in localStorage.
The `kickoff_leaderboard` view is public-read and supports the app's global, friend-code and season filters. It returns rank, locks, revealed proof count, mode proof count, average score, best score, XP, current winner streak, exact-score hits, verified real Filecoin proofs, and the latest update time. It aggregates both `kickoff_records` and `kickoff_mode_runs`, so bracket paths, parlays, Agent vs Human reports and upset challenges contribute to ranking instead of only appearing on the public profile. The app can read this view with the anon key, so public leaderboards still render before the viewer signs in. The Memory dashboard now caches global, friend and season leaderboard responses separately, records query evidence for each scope including filter, status, row count, sample IDs and whether the current user appears in that scoped result. Both the Memory readiness checklist and Account production radar require successful rows that include the current user for all three scope queries before leaderboard backend acceptance is considered complete.

Simple Supabase leaderboard acceptance query:

```sql
select
  rank,
  display_name,
  locks,
  revealed,
  mode_proofs,
  average_score,
  best_score,
  xp,
  streak,
  exact_hits,
  verified_proofs
from public.kickoff_leaderboard
order by xp desc
limit 10;
```

## Simple Acceptance Checklist

1. User can pick a match.
2. User can generate or edit a prediction.
3. User can lock the prediction before kickoff.
4. Locked prediction cannot be edited.
5. App shows CID/hash/timestamp/proof status.
6. User can reveal with an actual score.
7. App calculates and explains the score.
8. Proof card is clear and shareable with a public URL.
9. Memory dashboard records revealed predictions.
10. Missing paid API keys fall back to TheSportsDB, then ESPN, worldcup26 or seed data.
11. App works without API keys or Filecoin private key in demo mode.
12. Demo mode is clearly labeled.
13. Real Synapse adapter exists and is documented.
14. Desktop and mobile layouts work.
15. Build passes with no blocking console errors.
16. Supabase Google OAuth or magic-link sign-in can sync profile, prediction records, mode proof runs and share card manifests across devices, with pending local items visible until backend schema health, cloud acknowledgement and matching content fingerprints are read back.
17. Public profile links can load synced proof history and tournament mode proof runs by `?profile=<user-id>`, and each mode run has a verifier page by `?mode=<mode-run-id>`.
18. Global, friend and season leaderboards expose rank, XP, revealed count, mode proof count, exact hits and real proof count, with backend readiness shown separately from local fallback, checked per scope, and requiring the current user to appear in each remote scoped result.
19. Share images can be generated from locked proof cards and tournament mode proofs, including score/status, proof pattern, CID and public verifier URL, with a persisted PNG manifest hash, byte size, and public image URL.
20. Share actions produce a deployed HTTPS public proof URL or mode proof URL, deployed HTTPS image URL, CID-aware post text, X/Twitter intent fallback, and native image sharing when the browser supports file shares.
21. Every selected match shows a 0-100 intelligence score, lock-risk label, and action plan derived from schedule, score, rankings, lineups, injuries, and odds coverage.
22. Account view shows a cross-device cloud sync audit covering Supabase backend schema health, profile, prediction history, mode proofs, share manifests, content fingerprints, public proof links, public profile archive rows, and leaderboard backend rows.
23. Match board shows a provider route audit and response audit proving which live/fallback data source is active, which endpoint returned rows, and which routes need configuration.
24. Auto seal verifies that the seal API proof metadata payload hash matches the exact uploaded stable capsule and a mode proof JSON, polls CID verification, and reads `/proof/:cid` back before attaching each real proof.
25. Account view shows a production acceptance radar that exposes incomplete real-environment evidence instead of treating local/demo state as final, including local-only mode runs that have not yet read back as public mode proofs.
26. Public proof, mode proof and profile pages expose canonical, Open Graph, Twitter card and JSON-LD metadata, and the page itself shows the social-preview metadata being published.

## Submission Notes

The product avoids official FIFA marks and does not embed copyrighted match footage. It uses public match metadata only, supports manual result entry, and keeps Filecoin proof mechanics as the core experience.
