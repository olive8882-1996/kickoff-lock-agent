# Kickoff Lock Agent

Kickoff Lock Agent is a World Cup proof game for fans who want their predictions to survive the group chat. It locks a match call before kickoff, seals the payload with hash/Filecoin-style proof evidence, reveals the result after full time, then turns the prediction into a public proof card, mode run, leaderboard entry, and cross-device account artifact.

The product is built as a submission-ready web app rather than a thin prototype: it includes the stadium-themed prediction surface, data-provider health checks, one-click proof sealing flow, public verifier pages, share-card generation, tournament challenge modes, Supabase account sync, global/friend/season leaderboards, production acceptance radar, and generated evidence packets for judges or operators.

## What It Does

- Pick a World Cup match.
- Ask the prediction agent to draft a scoreline, key players, confidence, and reasoning.
- Lock the prediction into a read-only capsule with hash, timestamp, CID, PieceCID, and proof status.
- Reveal after the match with an actual score.
- Run six tournament proof modes: bracket path, parlay, Agent vs Human, upset, group path, and penalty pressure.
- Inspect a Filecoin seal evidence packet for every one-click seal run: CID, upload hash, byte length, per-attempt polling log, registry hash match, backend production blockers and copyable verification text.
- Get an explainable score and a generated 1200x675 social proof image with stadium artwork, CID, hash, proof status, and public verifier URL.
- Keep share-card acceptance evidence for generated proof cards, generated mode cards, public proof URLs, public image URLs that read back, PNG manifest hashes, byte sizes, and opened X/native share channels.
- Publish all missing prediction and mode proof cards from Account in one pass; each card is generated, uploaded when Supabase is signed in, and written back as share-card manifest evidence.
- Use public proof scorecards on prediction and mode proof pages to show lock timing, payload hash, Filecoin proof state, result/mode state, deployed URL readiness and share-card manifest readiness in one judging view.
- Keep every revealed call in a tournament memory dashboard.
- Sign in with Supabase Google OAuth or magic links to sync profile, prediction history, public proof links, and global/friend/season leaderboards.
- Verify cloud sync by reading profile, records, mode proof runs, share card manifests, public share image URLs, content fingerprints, public proof links, and public profile archive contents back from Supabase instead of trusting write-only success.
- Use the Account handoff packet to copy the current cross-device readiness state, public profile URL, pending sync count, production verification env and next missing account step.
- Use the Production launch packet to copy the remaining real-service workstreams, missing runtime env, target verification env and focused doctor commands.
- Verify leaderboard backend health with per-scope query evidence for global, friend-code, and season filters, including current-user presence, instead of trusting stale rows or local fallback rankings.
- Copy a leaderboard evidence packet that summarizes global/friend/season scope filters, remote row counts, current-user presence, sample IDs and the next missing scope.
- Inspect a structured realtime-data evidence packet for every sync: active route, match counts, per-signal live/configured/fallback/missing coverage, sample fixtures, warning state, and production-readiness status.
- Inspect a match-level data evidence packet for the selected fixture: source, status, kickoff, intelligence score, production signal count, missing/fallback gaps, and the next action before trusting the lock.
- Build a 4-pick knockout path in the bracket builder, then seal it as its own proof run.
- Create additional mode proof runs for parlays, Agent vs Human calibration, and upset challenges, each with a public verifier and mode share image.
- Copy a mode evidence packet that checks bracket, parlay, Agent vs Human and upset readiness across real Filecoin proof, cloud content read-back, anonymous mode proof URL and production share card.
- Use the Account production acceptance radar to see which competition-grade areas are verified, ready, partial, or blocked in the current environment.

## Links

- Live demo: https://olive8882-1996.github.io/kickoff-lock-agent/
- Repository: https://github.com/olive8882-1996/kickoff-lock-agent
- Screenshot: https://olive8882-1996.github.io/kickoff-lock-agent/kickoff-lock-screenshot.png
- Demo video: https://olive8882-1996.github.io/kickoff-lock-agent/kickoff-lock-demo.webm

## Brand Assets

- Primary icon: `public/assets/kickoff-lock-icon.png`
- Browser favicon: `public/assets/kickoff-lock-icon-32.png`
- PWA icon set: `public/assets/kickoff-lock-icon-192.png` and `public/assets/kickoff-lock-icon-512.png`
- Apple touch icon: `public/assets/kickoff-lock-apple-touch.png`
- Production share image: `public/generated/kickoff-production-share.png`
- The generated trophy-lock logo is used in the hero lockup, public proof masthead, share-card renderer, production share image generator, browser favicon, Open Graph/Twitter preview image, and PWA manifest.

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
API-Football fixture rows only count as schedule/score evidence. Lineups, injuries, odds and standings stay missing until their dedicated enrichment endpoints have been called and read back, so a fixture response alone cannot make realtime-data acceptance look complete. In production, prefer `APIFOOTBALL_KEY` on the Cloudflare Worker/Pages data proxy so the browser never receives the key; `VITE_APIFOOTBALL_KEY` remains supported for direct browser diagnostics. Football-Data.org follows the same server-token route for matches and standings: put `FOOTBALL_DATA_TOKEN` on the Worker/Pages runtime and leave `VITE_FOOTBALL_DATA_TOKEN` empty unless you are doing direct browser diagnostics. The Odds API follows the same pattern: put `ODDS_API_KEY` on the Worker/Pages runtime and expose only `VITE_ODDS_API_SPORT_KEY` to the browser; `VITE_ODDS_API_KEY` is direct-browser diagnostics only. When API-Football is configured, refresh attempts API-Football lineups, injuries, odds and standings read-back for the first `VITE_APIFOOTBALL_ENRICHMENT_LIMIT` fixtures, defaulting to 12 to stay within provider quotas.
TheSportsDB also performs a controlled free enrichment pass by default, reading event lineups and stats for the first `VITE_THESPORTSDB_ENRICHMENT_LIMIT` events, defaulting to 8. That gives the default free route real lineup/stat read-back evidence when TheSportsDB has published those event details, while injury and odds gaps remain visible until separate providers cover them.
For static hosting, deploy the data proxy either as a separate Worker via `VITE_DATA_PROXY_URL`, or as the bundled same-origin Cloudflare Pages function at `/data-proxy/proxy` with `VITE_DATA_PROXY_SAME_ORIGIN=1`. The app can route ESPN, TheSportsDB, worldcup26, openfootball, Football-Data.org, API-Football enrichment and The Odds API H2H reads through that CORS-safe proxy; put `FOOTBALL_DATA_TOKEN`, `APIFOOTBALL_KEY` and `ODDS_API_KEY` on the Worker/Pages runtime so the browser does not receive provider keys. `bun run data:proxy:check` validates the Cloudflare Worker bundle with Wrangler, and `bun run data:proxy:deploy` deploys it after `wrangler login`. The proxy exposes `/health` for a Worker URL and `/data-proxy/health` for the same-origin Pages function; production data verification requires `kickoff-data-proxy`, the ESPN/TheSportsDB/worldcup26/openfootball/Football-Data/API-Football/Odds API host allowlist, the exact public feed and enrichment route allowlist, CORS headers, a response size guard, 60-second fresh caching, stale fallback metadata, and server-key flags for proxied paid providers. Successful upstream responses are cached for short-term fallback, so a temporary free-feed 5xx can return the last good public JSON with `x-kickoff-proxy-cache: stale` instead of breaking the static app. GitHub Pages can publish the browser app and evidence JSON, but it cannot execute the bundled `functions/` directory; use `bun run pages:functions:build` to compile-check Pages Functions locally, `bun run pages:cf:check` to verify `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are present, and `bun run pages:cf:deploy` from the repo root when same-origin `/data-proxy/*`, `/seal/*`, `/health`, `/verify`, `/proof/:cid` and `/jobs/:id` endpoints must be part of the deployed acceptance target. When CI deploys the Pages Functions, set `CLOUDFLARE_STRICT_RUNTIME_SECRETS=1` so missing same-origin runtime secrets fail early: `FOOTBALL_DATA_TOKEN` for proxied Football-Data.org standings, `APIFOOTBALL_KEY` for proxied API-Football enrichment, `ODDS_API_KEY` when `VITE_ODDS_API_SPORT_KEY` is enabled, and `FILECOIN_SEAL_UPSTREAM_URL`, `FILECOIN_SEAL_TOKEN` plus HTTPS `ALLOW_ORIGIN` when `VITE_FILECOIN_SEAL_SAME_ORIGIN=1`. Override the default Pages project with `CLOUDFLARE_PAGES_PROJECT_NAME` and branch with `CLOUDFLARE_PAGES_BRANCH`.
`bun run data:providers:check` validates the realtime-data configuration before spending provider quota: API-Football key, production fixture targets, the target fixture signal matrix, odds provider, HTTPS data proxy, enrichment limit and scout search window. It writes `public/data-provider-readiness.json`, and `bun run collect:production` requires that artifact before realtime targets can be marked collected. It is a preflight only; `bun run scout:data-targets` and `bun run doctor:data` must still prove that live lineups, injuries, odds and standings rows return for every target fixture set.
Each refresh now also builds a realtime evidence packet. It records the serving provider, route status, provider endpoint/status/row count/sample IDs, checked timestamp, API-Football or TheSportsDB enrichment endpoint read-back, live/final/upcoming match counts, per-signal coverage totals for schedule, scores, rankings, lineups, injuries and odds, plus sample fixture coverage. Seed fallback packets stay marked evidence-only even when they keep the app usable.
Each selected fixture also exposes its own match data evidence packet, so schedule, score, rankings, lineups, injuries and odds are counted as production-ready only when they are live or explicitly configured. Missing and fallback signals stay visible with a next-action note before the user locks a prediction.
Realtime data evidence uses the same target-fixture rule everywhere: account evidence packets, intelligence enrichment packets, provider health and the production radar only pass endpoint-backed lineups, injuries, odds and standings when every attempted target fixture is fulfilled, live, and error-free. A single live row is useful diagnostics, but it no longer satisfies production readiness for a multi-fixture target set.
Each fixture also gets a 0-100 intelligence score with a lock-risk label and action plan, so users can tell whether a prediction is backed by live providers, configured enrichment, fallback intelligence, or manual reveal risk.
The match board also auto-refreshes provider data on a short interval, shows last sync and next auto-sync timestamps, and keeps manual refresh available for live score checks during a match window.
Rank signal uses live provider standings when available, with the bundled FIFA/Coca-Cola Men's World Ranking snapshot from the 2026-06-11 official update only as a baseline for provider feeds that do not return table rows directly. Lineups, injuries and odds may show configured provider keys in the UI, but production acceptance requires live endpoint read-back for each enrichment layer. API-Football can supply fixture standings, lineups, injuries and odds, while The Odds API can enrich H2H market prices for non API-Football fixtures.
TheSportsDB defaults to the free v1 key `123`, World Cup league id `4429`, current UTC year season, and an enrichment limit of 8; override with `VITE_THESPORTSDB_KEY`, `VITE_THESPORTSDB_LEAGUE_ID`, `VITE_THESPORTSDB_SEASON`, and `VITE_THESPORTSDB_ENRICHMENT_LIMIT` if TheSportsDB changes tournament IDs or quota behavior.

## Remaining External Production Acceptance

The application code now contains the main product surfaces, and the public deployment currently publishes passing acceptance evidence. `bun run verify:production` is the source of truth for what is externally proven. The current public evidence verifies the deployed app shell, logo asset, acceptance evidence, redirect URL, share bucket name, and free public schedule continuity. The following checks remain incomplete until they are exercised against real deployed services and synced user artifacts:

1. Supabase account sync must read back the profile, records, mode runs, share manifests, content fingerprints, public proof links, public profile archive rows, and public share images from a real hosted project.
2. Realtime data must show a non-seed active provider with fresh response audit plus live endpoint read-back for lineups, injuries, odds and standings.
3. Filecoin sealing must use a production Synapse backend with token auth and persistent proof storage, then verify one prediction capsule plus all six required mode proofs through `/proof/:cid`.
4. Public sharing must use deployed HTTPS proof URLs and Supabase Storage image URLs that pass public read-back, then exercise X/native share for every production record and mode card.
5. Leaderboards must load global, friend and season Supabase scopes and confirm the current user appears in every scoped result.
6. The final release pass must rerun `bun run verify:acceptance`, `bun run runtime:config`, `bun run build`, `bun run verify:production`, `bun run deploy:evidence`, and then redeploy `dist/` so public evidence remains fresh.

## Filecoin Strategy

The browser app runs in **demo proof mode** by default. Demo mode is clearly labeled and never pretends to be a real on-chain write.

For real storage, use the Synapse adapter:

```bash
cp .env.example .env
SYNAPSE_PRIVATE_KEY=0x... KICKOFF_CAPSULE_PATH=./proofs/demo-prediction-capsule.json bun run seal:synapse
```

The generated proof JSON can be pasted into the app's "Import real proof JSON" panel.

For one-click browser sealing, run the seal API on a trusted server and point the frontend at the seal endpoint. The browser and production target script use `POST /seal?async=1` first, then poll `GET /jobs/:id` before CID verification:

```bash
SYNAPSE_PRIVATE_KEY=0x... \
FILECOIN_PROOF_STORE_PATH=./proofs/filecoin-proof-store.json \
FILECOIN_SEAL_TOKEN=change-me \
FILECOIN_MAX_UPLOAD_BYTES=262144 \
ALLOW_ORIGIN=https://your-site.example \
bun run seal:api
```

Set the browser build with `VITE_FILECOIN_SEAL_API` and, for direct browser-to-seal uploads, the matching `VITE_FILECOIN_SEAL_TOKEN`. If the seal API is mounted behind the same deployed app origin at `/seal`, leave `VITE_FILECOIN_SEAL_API` empty and set `VITE_FILECOIN_SEAL_SAME_ORIGIN=1`; the browser and production doctors will derive `https://your-site.example/seal`. The bundled Cloudflare Pages Functions expose `/seal`, `/health`, `/verify`, `/proof/:cid` and `/jobs/:id` as a same-origin proxy, require the server-only `FILECOIN_SEAL_UPSTREAM_URL` to point at the trusted production `/seal` backend, and can inject server-side `FILECOIN_SEAL_TOKEN` so the browser never receives an upload token. The token is optional for local demos, but recommended for production because async seal jobs spend backend resources.

Before deploying the browser against a seal endpoint, run:

```bash
bun run filecoin:api:check
```

The preflight checks that the seal API is configured for production instead of mock mode: `SYNAPSE_PRIVATE_KEY` is a 0x private key, `FILECOIN_SEAL_TOKEN` is strong, `VITE_FILECOIN_SEAL_TOKEN` matches it for direct browser mode or is omitted in same-origin proxy mode, `FILECOIN_PROOF_STORE_PATH` is writable, `FILECOIN_MAX_UPLOAD_BYTES` is bounded, `ALLOW_ORIGIN` is an HTTPS app origin, and either `VITE_FILECOIN_SEAL_API` points at an HTTPS `/seal` endpoint or `VITE_FILECOIN_SEAL_SAME_ORIGIN=1` resolves to the deployed app origin's `/seal`. When using same-origin mode, `FILECOIN_SEAL_UPSTREAM_URL` must also point at the trusted production `/seal` backend that the Pages Function proxy forwards to, and `FILECOIN_SEAL_TOKEN` should be set on the Pages/Worker runtime for server-side upload-token injection. It does not spend Filecoin funds; `bun run doctor:filecoin` and `bun run seal:production-targets` still perform the live `/health`, `/seal?async=1`, `/jobs/:id`, `/verify` and `/proof/:cid` acceptance checks.

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

This runs the acceptance command set, writes `public/acceptance-evidence.json`, and, when `dist/` already exists, mirrors the same packet to `dist/acceptance-evidence.json` so a later deploy cannot publish stale run evidence. The packet includes the current acceptance suite manifest hash, and run evidence older than 7 days is rejected, so stale evidence is rejected after commands, spec coverage, proof text or release timing changes. The generated file is intentionally git-ignored; CI or the release operator should create it before the final deploy.
Because Vite copies files from `public/` during build, the release order is `bun run verify:acceptance`, `bun run runtime:config`, `bun run runtime:config:check`, `bun run build`, deploy `dist/`, run `KICKOFF_VERIFY_ALLOW_FAILURES=1 bun run verify:production` and `bun run deploy:evidence` against the deployed site, then deploy `dist/` again. The evidence scripts mirror their JSON packets into an existing `dist/`, so the second deploy publishes the exact acceptance, production and public-deployment evidence that was just generated.

The API exposes `GET /health`, synchronous `POST /seal`, async `POST /seal?async=1`, `GET /jobs/:id`, `GET /verify?cid=...`, and `GET /proof/:cid`. Each successful seal is registered by CID with payload hash, byte length, provider metadata, checked timestamps, and the completed async job status, so the verifier only reports proof/job metadata for CIDs sealed by that backend instance. Set `FILECOIN_PROOF_STORE_PATH` to persist that registry across server restarts; without it, the server falls back to memory-only mode for local demos. If a running job is loaded after a restart without a proof, it is marked failed and asks the client to resubmit the payload instead of pretending the upload is still active. Set `FILECOIN_SEAL_TOKEN` to require a bearer token for browser upload requests while leaving public proof verification readable. Set `FILECOIN_MAX_UPLOAD_BYTES` to cap browser seal payload size; the API rejects invalid capsule JSON and oversized uploads before invoking Synapse.
`POST /seal` only accepts locked, sealed prediction capsules with a 64-character SHA-256 capsule payload hash and prediction payload, or sealed/scored tournament mode proof runs with a 64-character mode payload hash and linked capsule ids. Draft or unlocked artifacts are rejected before Synapse upload, so production sealing cannot spend backend resources on mutable predictions or incomplete mode proofs.
`GET /health` returns `productionReady` plus a `blockers` array. Production readiness requires real Synapse mode, `SYNAPSE_PRIVATE_KEY`, `FILECOIN_SEAL_TOKEN`, persistent proof storage, and a valid upload limit; mock mode can still pass local E2E but stays blocked in the production radar.
The browser requires the async seal path. A seal upload must return a job id immediately, the app polls `GET /jobs/:id` until provider proof metadata includes a CID, then it continues with `/verify?cid=` and `/proof/:cid`. Seal servers that return proof metadata directly from `POST /seal?async=1` are treated as incomplete because they skip upload status evidence.
The frontend runs a health preflight, uploads the stable capsule or mode proof payload, verifies that the seal API returns the same uploaded payload hash, polls async upload job status, polls CID verification with a per-attempt status log, reads `/proof/:cid` back from the proof registry, checks the registry CID/hash/byte length against the upload, stores proof/verify URLs, and renders a Filecoin acceptance checklist for backend configuration, API health, production backend readiness, upload acceptance, upload job polling, payload hash match, CID return, verification polling, registry read-back, verifier URL readiness, backend mode, proof registry persistence, and upload token enforcement. Tournament mode proof runs expose the same Auto seal workflow from the Modes view, render the same checklist directly inside each mode run card, then sync the returned real proof back to Supabase with the mode run.
Each auto seal panel also renders a Filecoin seal evidence packet. It is intentionally stricter than the visual checklist: mock mode and memory-only proof registries stay listed as blockers, while production-ready evidence requires a real Synapse backend, token-protected upload, file-backed registry, upload job status when applicable, matching payload hash, CID polling and `/proof/:cid` hash read-back.
Production Filecoin readiness requires both surfaces: at least one locked prediction capsule and all six required tournament mode proofs must have real proofs, verified seal jobs, matching uploaded payload hashes, CID verification and `/proof/:cid` registry read-back. A record-only seal or a single mode seal is useful progress, but it does not complete the Filecoin production radar.
The public verifier's CID lookup can also attach a returned real proof back to a local capsule, but only when the seal API returns either no payload hash or a payload hash matching that capsule. Lookup evidence must be self-consistent: `/proof/:cid` and `/verify?cid=` cannot return a different CID, conflicting payload hashes or conflicting byte lengths. A mismatched hash blocks the attach action so an unrelated CID cannot replace the locked prediction proof.
The seal panel deliberately distinguishes mock smoke-test sealing from a production Synapse backend with `SYNAPSE_PRIVATE_KEY`, so demo verification cannot be mistaken for a funded Filecoin upload.
The public verifier also includes a CID lookup panel that queries the configured seal API and displays proof status, PieceCID, provider, dataset, and retrieval URL.

Key files:

- `src/proof.ts`: capsule hash, demo proof, real proof import.
- `src/providers.ts`: API-Football, Football-Data.org, TheSportsDB, ESPN, The Odds API, worldcup26 and seed fallback.
- `src/realtimeDataEvidence.ts`: account-level production evidence packet for schedule, score, rankings, lineups, injuries and odds read-back.
- `src/scoring.ts`: explainable scoring engine.
- `src/cloud.ts`: Supabase auth, profile sync, prediction history sync, mode proof run sync, authenticated and anonymous read-back verification, public proof/profile lookup, and leaderboard queries.
- `src/bracket.ts`: knockout path builder, bracket readiness rules, and bracket proof run sealing.
- `src/modes.ts`: bracket/parlay/Agent vs Human/upset/group-path/penalty-pressure mode proof runs, including parlay tickets, agent calibration reports, group tables, upset bonus tickets and pressure-pick tickets.
- `src/modeEvidence.ts`: six-mode production evidence packets for Filecoin, cloud read-back, public mode links and share cards.
- `src/modeSettlement.ts`: mode settlement packets for parlay hits, Agent vs Human calibration, upset bonus XP and pending bracket path resolution.
- `src/sharePublishing.ts`: batch share-card publish queue for records and mode proofs that still need production public image URLs.
- `src/productionLaunchPacket.ts`: copyable production launch workstreams derived from the operator doctor.
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
bun run env:production
bun run runtime:config
bun run runtime:config:check
bun run supabase:schema:check
bun run supabase:schema:apply
bun run doctor:supabase
bun run doctor:filecoin
bun run filecoin:api:check
bun run doctor:data
bun run data:providers:check
bun run doctor:sharing
bun run data:proxy:check
bun run data:proxy:deploy
bun run scout:data-targets
bun run share:production-image
bun run share:upload-image
bun run seed:production-targets --dry-run
bun run seed:production-targets --dry-run --upload-share-image --upload-mode-share-image
bun run seal:production-targets --dry-run
bun run deploy:pages
bun run pages:rebuild
```

The Account view includes an "Acceptance tests" panel that maps each production requirement to the command and spec file that verifies it. It also reads `public/acceptance-evidence.json`, including its suite manifest hash, so final review can check both the test rule and the latest matching run evidence before trusting the readiness score.
The Account view also includes a "Production environment gates" panel. It checks Supabase auth/redirect env vars, TheSportsDB schedule continuity, API-Football lineup/injury enrichment, odds provider keys, browser Filecoin seal API/token configuration and the deployed HTTPS public app URL before treating a local build as production-ready.
Static deployments also load `runtime-config.js` before the app bundle. Values in `window.__KICKOFF_RUNTIME_CONFIG__` override build-time `VITE_*` env values for Supabase, the public share bucket, data proxy, realtime provider keys, Filecoin seal API/token and public app URL. Use this for GitHub Pages or other static hosting when production service URLs are created after the last build; otherwise public proof pages can render the fixture preview but cannot prove clean-session cloud restore. Run `bun run runtime:config` to generate `public/runtime-config.js` from `.env/.env.local/.env.production/.env.production.local`; it writes only browser-exposed `VITE_*` keys and never exports `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SYNAPSE_PRIVATE_KEY` or other server-only secrets. Run `bun run runtime:config:check` before release to fail if recommended deployed values are still missing. `bun run verify:production` also fetches the deployed `runtime-config.js`, parses `window.__KICKOFF_RUNTIME_CONFIG__`, rejects missing recommended runtime keys, mismatches with the current release env, or leaked server-only keys, then records the `public-runtime-config` evidence check. After deploying the generated runtime config, rerun `bun run doctor:sharing` and confirm the clean-session account restore check says the profile, proof and mode pages rendered cloud-loaded content.
`bun run env:production:plan` writes `public/production-env-plan.json` and prints one grouped `.env.production.local` template covering browser runtime keys, local-only server/service keys and `KICKOFF_VERIFY_*` target keys. It understands the same-origin data proxy and same-origin Filecoin `/seal` alternatives, so run it before the bootstrap commands when you want the shortest path to a strict production run.
`bun run verify:production` loads `.env`, `.env.local`, `.env.production`, and `.env.production.local` before writing `public/production-evidence.json`; pass `--include-example` only when you intentionally want to audit `.env.example` placeholders. The packet records which env files were loaded without exposing values. It checks the deployed public app URL, published acceptance evidence manifest and 7-day freshness, Supabase Auth target user read-back, Supabase backend health, explicit Supabase target rows for profile/prediction/mode/share artifact, leaderboard rows for the current user, free public schedule continuity through TheSportsDB or ESPN, API-Football enrichment routes, the Filecoin seal API health contract, async seal endpoint contract, Filecoin record/mode CID proof read-back, browser-rendered public profile/proof/mode pages, record share-image URL read-back, and mode share-image URL read-back. Set `KICKOFF_VERIFY_MODE_IDS` to the required bracket/parlay/Agent vs Human/upset/group-path/penalty-pressure mode proof run ids; the legacy single `KICKOFF_VERIFY_MODE_ID` remains useful for local links but cannot satisfy full mode production acceptance. Public page checks use Playwright when target ids are present, so a static app-shell HTTP 200 cannot satisfy proof-page acceptance by itself. The clean-session account restore check is stricter than the public preview checks: it only passes when profile, prediction proof and mode proof pages all render Cloud-loaded content in a fresh browser context, so public fixture fallback cannot satisfy the real account-system gate. Filecoin checks require one prediction CID plus six mode proof CIDs to pass both `/verify?cid=` and `/proof/:cid`, with payload hashes and byte lengths read back from the seal API registry. The Account view includes a "Production script env" block that turns the current synced profile, proof, mode proof and public share image into `KICKOFF_VERIFY_*` variables for `.env.production.local`, and the main production radar now scores the loaded production evidence as its own external-evidence gate. Set `KICKOFF_VERIFY_ALLOW_FAILURES=1` when you want a diagnostic packet without failing the command.
`bun run doctor:production` reads the same env files and `production-evidence.json`, then groups the external checks into seven operator-facing acceptance areas: real account/cloud history, realtime match data, Filecoin auto-seal, public share cards/proof pages, leaderboard backend, public deployment assets, and automated test evidence. It exits non-zero until every group is externally proven, and prints the missing runtime env keys plus the next target IDs/CIDs/share image URLs needed for the next verification run.
`bun run env:production -- seed.env seal.env scout.env --out=.env.production.verify` merges multiple `KICKOFF_VERIFY_*` env blocks into one copyable block. It reads real env files by default and ignores `.env.example`; pass `--include-example` only when you intentionally want placeholder diagnostics. Non-empty values win and empty values do not erase earlier real CIDs, fixture ids or share URLs, so it is safe to combine output from `seed:production-targets`, `seal:production-targets` and `scout:data-targets`.
`bun run doctor:supabase` is the focused cloud backend drill-down. It uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to query `kickoff_backend_health`, every public-read table/view, explicit profile/prediction/mode target rows, record and mode share artifact target rows, record and mode X/native share-channel evidence, all three current-user leaderboard scopes, `KICKOFF_VERIFY_SHARE_IMAGE_URL`, and `KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL`. It also uses local-only `SUPABASE_SERVICE_ROLE_KEY` to read back `KICKOFF_VERIFY_USER_ID` through Supabase Auth admin API, so the real-account gate proves an actual Auth user with email/sign-in identity, not just public rows. Leaderboard rows must include the current user plus the matching scoped rank field: `global_rank`, `friend_rank` or `season_rank`. Share artifact manifests must use deployed HTTPS proof/image URLs, a 64-character SHA-256 image hash, and an `image_url` matching the configured public share-card URL for that artifact type. `KICKOFF_VERIFY_MODE_IDS` must include the six required mode proof run ids, and every listed mode proof row plus matching mode share artifact and share-channel row must read back. If `SUPABASE_SERVICE_ROLE_KEY` is set locally, it also checks the Supabase Storage bucket metadata and confirms `kickoff-share-cards` is public; this service role key is intentionally not a `VITE_` variable and must never be shipped to the browser.

`bun run share:upload-image` now writes `public/share-image-upload-record.json`; `bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png` writes `public/share-image-upload-mode.json`. Each artifact records the local PNG, Supabase Storage object path, public URL, byte length, SHA-256 image hash and public read-back result. `collect:production` accepts either those saved upload artifacts or matching `public/supabase-target-seed.json` target URLs; in both cases `KICKOFF_VERIFY_SHARE_IMAGE_URL` and `KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL` must be public HTTPS PNG/JPEG/WebP images and match the seeded share artifact URLs before public share-image targets count as collected.
`bun run sharing:bootstrap` now writes `public/share-channel-evidence.json`. The artifact records the target record proof id, all six mode proof ids, and Supabase doctor read-back for `target-share-channel-row` plus `target-mode-share-channel-row`. `collect:production` requires this saved artifact before public sharing can proceed to final verification, so generated/uploaded cards are not enough unless the X intent or native share channel was opened and synced for the record card and every required mode card.
`bun run leaderboard:bootstrap` now writes `public/leaderboard-backend.json`. The artifact records the target user, friend code, season key, exact global/friend/season REST queries, and the Supabase doctor read-back result for `leaderboard-global-user`, `leaderboard-friend-user` and `leaderboard-season-user`. `collect:production` requires this saved artifact, checks all three current-user scopes passed with positive scoped ranks, and rejects the artifact when its user/friend/season targets do not match the copied `KICKOFF_VERIFY_*` env values.
`bun run doctor:filecoin` is the focused Filecoin drill-down. It checks the configured browser seal endpoint, upload token, `/health` production contract, required endpoint list, record CID `/verify` plus `/proof/:cid` read-back, all six mode CID read-backs, payload hash targets and byte length. `KICKOFF_VERIFY_FILECOIN_MODE_CIDS` and `KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES` must each contain the six required mode proof values in the same order; legacy single `KICKOFF_VERIFY_FILECOIN_MODE_CID` / `KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH` values are useful for older links and diagnostics, but do not satisfy full Filecoin production acceptance. `KICKOFF_FILECOIN_DOCTOR_SEAL_PAYLOAD` is optional and intentionally blank by default; set it only when you want the doctor to spend a real async `POST /seal?async=1` upload, poll `GET /jobs/:id`, and verify the returned CID/hash against a locked capsule or sealed/scored mode proof JSON file.
`bun run doctor:data` is the focused realtime-data drill-down. It checks free schedule continuity through non-empty TheSportsDB, ESPN or worldcup26 match rows, API-Football key and `KICKOFF_VERIFY_FIXTURE_IDS`, valid API-Football standings rows for ranking/table evidence, valid live rows from API-Football lineups, injuries and odds endpoints for every target fixture, odds provider configuration, and optional The Odds API H2H read-back. By default `KICKOFF_VERIFY_FIXTURE_IDS` must contain at least 3 fixture targets, and `KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX` must document the scout row counts for the same fixtures with entries like `123:lineups=1|injuries=2|odds=1|standings=1`. Lower `KICKOFF_DATA_SCOUT_TARGETS` only when you intentionally want a smaller acceptance set. The legacy single `KICKOFF_VERIFY_FIXTURE_ID` remains useful for diagnostics, but it does not satisfy full realtime production acceptance by itself. Empty feed or endpoint responses stay failed, and non-empty API-Football arrays still must carry the expected row shape: standings rows need team identity, positive rank and points; lineup rows need team plus lineup structure, injury rows need player plus team/fixture identity, and odds rows need bookmaker data. Configured keys and empty JSON shells alone cannot satisfy live-data acceptance. The Account realtime-data packet also lists target fixture rows; every target fixture must show schedule, score, ranking, lineup, injury and odds evidence before the realtime-data lane can pass production readiness.
`bun run data:providers:check` uses the same production fixture target rule before any live endpoint calls: `KICKOFF_VERIFY_FIXTURE_IDS` must contain the configured target count, defaulting to 3. A single legacy `KICKOFF_VERIFY_FIXTURE_ID` is reported as diagnostic context only and does not make the provider preflight ready.
`bun run doctor:sharing` is the focused public sharing drill-down. It renders the deployed profile, prediction proof and all six mode proof URLs with Playwright, then checks canonical links, required visible proof content, forbidden fallback states, Open Graph/Twitter metadata, JSON-LD, a public record share-card image URL and a public mode share-card image URL. Public share-card image read-back must return PNG/JPEG/WebP bytes, be at least 10 KB, expose readable dimensions, and meet the production share-card frame of at least 1000x560 with a 16:9-style aspect ratio; a tiny placeholder image or HTML response does not pass. Production evidence also requires `kickoff_share_artifacts` rows to prove the X intent or native-share action was opened and synced through `x_intent_url` plus `x_intent_opened_at` or `native_share_opened_at`. `KICKOFF_VERIFY_MODE_IDS` must include the six required mode proof run ids; `KICKOFF_VERIFY_MODE_ID` alone is not enough for full sharing acceptance. It exits non-zero until `VITE_PUBLIC_APP_URL`, `KICKOFF_VERIFY_PROFILE_ID`, `KICKOFF_VERIFY_PROOF_ID`, all mode target ids, `KICKOFF_VERIFY_SHARE_IMAGE_URL` and `KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL` point at real deployed artifacts.
`doctor:sharing` also writes `public/public-restore-evidence.json`. `collect:production` requires that artifact before the clean-session account restore gate can pass: the saved evidence must show the public profile, prediction proof and every required mode proof rendered from deployed pages with cloud-loaded Supabase content, plus record and mode share images that read back as production-sized images. A static app shell, fixture fallback page, localStorage-only page or mismatched target id keeps the artifact not ready.
`bun run scout:data-targets` uses `APIFOOTBALL_KEY`, `VITE_APIFOOTBALL_KEY`, or the deployed data proxy to scan API-Football World Cup fixtures, check each candidate's lineups, injuries, odds and standings endpoints, write `public/data-target-scout.json`, and print both a `KICKOFF_VERIFY_FIXTURE_IDS` target set and `KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX` for `bun run doctor:data`. The scout is ready only after it finds the configured target count, defaulting to 3 complete fixtures, and `collect:production` now requires the env targets to match the saved scout evidence file. Override the automatic scan with `KICKOFF_DATA_SCOUT_LEAGUE_ID`, `KICKOFF_DATA_SCOUT_SEASON`, `KICKOFF_DATA_SCOUT_NEXT`, `KICKOFF_DATA_SCOUT_LIMIT` and `KICKOFF_DATA_SCOUT_TARGETS` when API-Football changes competition IDs or you need to search deeper. If you already have candidate API-Football fixture ids, set `KICKOFF_DATA_SCOUT_FIXTURE_IDS=123,456,789`; the scout will validate those exact fixtures through lineups, injuries, odds and standings read-back before promoting only complete candidates into `KICKOFF_VERIFY_FIXTURE_IDS`. Use `--no-write` for diagnostics when you do not want to update the evidence file, or `--out=path/to/file.json` for a custom artifact path.
`bun run share:production-image` renders a 1200x675 record proof PNG at `public/generated/kickoff-production-share.png` with the project trophy-lock logo, match pick, score, CID/hash snippets and public verifier URL. Add `-- --kind=mode` to render the distinct mode proof PNG at `public/generated/kickoff-production-mode-share.png` with mode-specific copy and proof-set labels. After `bun run deploy:pages`, the printed `KICKOFF_SEED_SHARE_IMAGE_URL` / `KICKOFF_VERIFY_SHARE_IMAGE_URL` values are valid production share-image targets when the deployed HTTPS PNG reads back with production dimensions. Final sharing acceptance still requires Supabase share artifact/channel rows to reference those public image URLs.
`bun run share:upload-image` uploads that PNG to the configured Supabase Storage bucket with `SUPABASE_SERVICE_ROLE_KEY`, verifies the public image URL reads back as a production-sized share-card image, computes the byte length and SHA-256 hash, then prints the exact `KICKOFF_SEED_SHARE_IMAGE_URL` and `KICKOFF_VERIFY_SHARE_IMAGE_URL` to copy into `.env.production.local`. Add `--kind=mode` when the uploaded PNG is for mode proof cards; the command will print `KICKOFF_SEED_MODE_SHARE_IMAGE_URL` and `KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL`, and when `KICKOFF_VERIFY_MODE_IDS` is present it uses the first listed mode id for the Storage path while the seed command attaches that same public image URL to every listed mode share artifact. Use this before `seed:production-targets` when you want Supabase Storage to host the cards; otherwise any deployed HTTPS PNG/JPEG/WebP that passes public read-back can be used as the seed image URL.
`bun run seed:production-targets --dry-run` builds the Supabase production acceptance target rows without writing them: one public profile, one prediction proof row, the six required mode proof rows (bracket, parlay, Agent vs Human, upset, group-path and penalty-pressure), record/mode share artifact manifests and a ready-to-copy `KICKOFF_VERIFY_*` block with both legacy `KICKOFF_VERIFY_MODE_ID` and full-set `KICKOFF_VERIFY_MODE_IDS`. Add `--upload-share-image` to upload `public/generated/kickoff-production-share.png` to Supabase Storage first and use that public URL for the record seed in the same run; add `--upload-mode-share-image` or `--mode-share-image=path/to/mode-card.png` to give the mode share artifacts their own public image URL/hash. Production seeding requires both `KICKOFF_SEED_SHARE_IMAGE_URL`/`KICKOFF_VERIFY_SHARE_IMAGE_URL` and `KICKOFF_SEED_MODE_SHARE_IMAGE_URL`/`KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL`, so mode cards cannot silently reuse the record card during acceptance. Remove `--dry-run` only after `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `KICKOFF_SEED_USER_ID`/`KICKOFF_VERIFY_USER_ID`, the record share image URL and the mode share image URL point at real public artifacts; before writing business rows, the script reads that user through Supabase Auth admin and refuses to upsert orphan profile/proof/mode rows if the Auth user is missing or mismatched.
`bun run seal:production-targets --dry-run` builds the exact record and required mode proof JSON payloads that the seal API accepts, computes their upload payload hashes, writes `public/filecoin-target-seal.json`, and prints the Filecoin `KICKOFF_VERIFY_*` values. The mode set covers bracket, parlay, Agent vs Human, upset, group-path and penalty-pressure, while legacy `KICKOFF_VERIFY_FILECOIN_MODE_CID` still points at the first mode for older scripts. Remove `--dry-run` only after a production seal API is reachable either at `VITE_FILECOIN_SEAL_API` with `VITE_FILECOIN_SEAL_TOKEN`, or through `VITE_FILECOIN_SEAL_SAME_ORIGIN=1` with server-side `FILECOIN_SEAL_TOKEN` injection and `FILECOIN_SEAL_UPSTREAM_URL`. The script first requires `/health` to report real Synapse mode, token auth, private key, file-backed proof storage and upload limits, then posts the record payload plus every required mode payload to `POST /seal?async=1`, polls `GET /jobs/:id` until each job returns a CID, reads `/verify?cid=` and `/proof/:cid` back, and records the resulting CIDs, payload hashes, upload-status poll log, verify poll log and proof read-back in the saved artifact. `collect:production` requires the copied env CIDs/hashes to match that saved artifact before Filecoin targets count as collected. If `/health` reports mock mode or memory-only proof storage, the script stops before POSTing any seal payload. Use `--no-write` for diagnostics when you do not want to update the evidence file, or `--out=path/to/file.json` for a custom artifact path.
`docs/deploy-pages.workflow.yml` is a ready-to-install GitHub Actions workflow for the same evidence pipeline. It generates and checks `runtime-config.js`, publishes once after `bun run verify:acceptance`, waits for Pages propagation, runs `KICKOFF_VERIFY_ALLOW_FAILURES=1 bun run verify:production`, then publishes again so the deployed app includes both fresh acceptance evidence and the latest production evidence packet. The file is kept under `docs/` because pushing a live `.github/workflows` file requires a GitHub token with `workflow` scope. Locally, `bun run deploy:pages` uses the same `scripts/deploy-gh-pages.mjs` sync path.
If GitHub Pages stays in a stale `building` state after pushing `gh-pages`, run `bun run pages:rebuild` to request a fresh Pages build through the GitHub API.

## Cloud Backend

Create the tables and views in `supabase.schema.sql`, then set:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SUPABASE_REDIRECT_URL=https://your-site.example/kickoff-lock-agent/
VITE_SUPABASE_SHARE_BUCKET=kickoff-share-cards
SUPABASE_DB_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres # local-only schema apply; never expose as VITE_
SUPABASE_SERVICE_ROLE_KEY=... # optional local-only doctor:supabase bucket metadata check; never expose as VITE_
VITE_PUBLIC_APP_URL=https://your-site.example/kickoff-lock-agent/
APIFOOTBALL_KEY=... # preferred for Cloudflare data proxy; never expose as VITE_
VITE_APIFOOTBALL_KEY= # optional direct browser diagnostics only
VITE_APIFOOTBALL_ENRICHMENT_LIMIT=12
FOOTBALL_DATA_TOKEN=... # preferred for Cloudflare data proxy; never expose as VITE_
VITE_FOOTBALL_DATA_TOKEN= # optional direct browser diagnostics only
VITE_FOOTBALL_DATA_COMPETITION=WC
VITE_THESPORTSDB_KEY=123
VITE_THESPORTSDB_LEAGUE_ID=4429
VITE_THESPORTSDB_SEASON=2026
VITE_THESPORTSDB_ENRICHMENT_LIMIT=8
VITE_DATA_PROXY_URL=https://your-data-proxy.example/proxy
VITE_DATA_PROXY_SAME_ORIGIN=0 # set to 1 when deploying the bundled /data-proxy/proxy Pages function
ODDS_API_KEY=... # preferred for Cloudflare data proxy; never expose as VITE_
VITE_ODDS_API_KEY= # optional direct browser diagnostics only
VITE_ODDS_API_SPORT_KEY=...
VITE_FILECOIN_SEAL_API=https://your-seal-api.example/seal
VITE_FILECOIN_SEAL_SAME_ORIGIN=0 # set to 1 when the production seal API is mounted at https://your-site.example/seal
VITE_FILECOIN_SEAL_TOKEN= # direct browser mode only; omit when same-origin proxy injects FILECOIN_SEAL_TOKEN
FILECOIN_SEAL_UPSTREAM_URL=https://your-seal-api.example/seal # server-only; required only for the bundled same-origin /seal proxy
KICKOFF_VERIFY_USER_ID=...
KICKOFF_VERIFY_PROFILE_ID=...
KICKOFF_VERIFY_PROOF_ID=...
KICKOFF_VERIFY_MODE_ID=...
KICKOFF_VERIFY_MODE_IDS=... # comma-separated bracket/parlay/agent-vs-human/upset/group-path/penalty-pressure mode proof run ids
KICKOFF_VERIFY_FILECOIN_RECORD_CID=...
KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH=...
KICKOFF_VERIFY_FILECOIN_MODE_CID=...
KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH=...
KICKOFF_VERIFY_FILECOIN_MODE_CIDS=... # comma-separated mode CIDs for bracket/parlay/agent-vs-human/upset/group-path/penalty-pressure
KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES=... # comma-separated mode payload hashes in the same order
KICKOFF_VERIFY_FRIEND_CODE=chengdu
KICKOFF_VERIFY_SEASON_KEY=world-cup-run
KICKOFF_VERIFY_FIXTURE_ID=... # optional legacy single fixture target
KICKOFF_VERIFY_FIXTURE_IDS=... # comma-separated production target fixtures
KICKOFF_VERIFY_FIXTURE_SIGNAL_MATRIX=... # fixture:lineups=n|injuries=n|odds=n|standings=n entries from scout:data-targets
KICKOFF_VERIFY_SHARE_IMAGE_URL=https://...
KICKOFF_SEED_SHARE_IMAGE_URL=https://... # public generated PNG used by seed:production-targets
KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL=https://... # required public PNG for mode proof cards
KICKOFF_SEED_MODE_SHARE_IMAGE_URL=https://... # mode PNG used by seed:production-targets
KICKOFF_SEED_USER_ID=... # real Supabase Auth user id; may reuse KICKOFF_VERIFY_USER_ID
KICKOFF_SEED_EMAIL=... # optional
KICKOFF_SEED_DISPLAY_NAME=... # optional
KICKOFF_SEED_LOCATION=Chengdu # optional
```

To apply the schema from the command line, set `SUPABASE_DB_URL` to the Supabase project Postgres connection string and run:

```bash
bun run supabase:schema:check
bun run supabase:schema:apply
bun run doctor:supabase
```

`supabase:schema:check` is a dry run that verifies the checked-in schema file, prints a password-masked `psql` command and fails clearly when `SUPABASE_DB_URL` or the local PostgreSQL client is missing. `supabase:schema:apply` runs the same `psql --set ON_ERROR_STOP=1 --file supabase.schema.sql` command against the real Supabase database, then `doctor:supabase` must prove the public REST tables, health view, leaderboard scopes, target rows and public share images read back.
`supabase:schema:apply` now writes `public/supabase-schema-apply.json`. `collect:production` requires that artifact and rejects dry-run evidence, unreadable schema files, incomplete schema contracts, unavailable `psql`, or an apply command that did not execute successfully, so the account-system lane cannot be marked collected from local SQL inspection alone.

The schema also creates `kickoff_backend_health`, a public-read health view that reports schema version, required tables, required views, RLS status and policy count. Account readiness requires that view to pass before row read-back can count as production cloud sync. Production target rows must also match the verified account scope: the profile row must carry the expected friend code, and prediction/mode rows must read back with the configured current user, friend code and season key. A row with the right id but the wrong owner or scope stays failed. It also creates a public Supabase Storage bucket named `kickoff-share-cards` plus read/upload/update policies for generated proof-card PNGs; set `VITE_SUPABASE_SHARE_BUCKET` to the same bucket so share manifests can store deployed HTTPS `imageUrl` values that the app can read back before marking sharing production-ready. `bun run seed:production-targets` now writes `public/supabase-target-seed.json`; after a real non-dry-run upsert it records the account/profile target ids, the Auth admin preflight result, prediction proof id, all six mode proof ids, six share artifact targets, whether rows were upserted, and whether `doctor:supabase` read-back passed. `collect:production` requires the copied account env targets to match that saved artifact and the Auth preflight to pass before the real account-system target collection is considered complete.
Public proof pages can load a capsule from Supabase by `?proof=<capsule-id>` when the record has been synced. Tournament mode proofs can also be opened by `?mode=<mode-run-id>`, including bracket paths, parlays, calibration reports and upset tickets. Share URLs are built from `VITE_PUBLIC_APP_URL` when it is configured; local `window.location` links remain available for development but do not pass production sharing readiness.
Public proof and mode proof pages also read the matching `kickoff_share_artifacts` manifest when it exists. The verifier shows whether the social proof card evidence came from a local generation or cloud read-back, and displays the PNG file name, byte size, MIME type, SHA-256 hash, proof URL and share-channel status alongside the locked payload.
Public proof and mode proof pages also render a production scorecard. It keeps attractive public pages honest by separating preview-ready proof pages from production-ready proof pages: deployed HTTPS URLs, real Filecoin proof state and production share-image manifests must all pass before the scorecard reports a complete public proof package.
Public profile pages include the same share-card evidence. Each prediction and mode proof row marks whether a publishable share card is synced, and the profile stats include the total number of share cards available for that profile.
Public proof, mode proof and profile pages also publish canonical links, Open Graph tags, Twitter card tags and JSON-LD, with a visible Social metadata card that shows the active preview title, URL, image source and manifest hash when a generated share-card artifact exists.
After a Supabase Google OAuth or magic-link sign-in, the app stores the Supabase session, refreshes expired access tokens when a refresh token is available, automatically pulls cloud history, merges it with local prediction records, local mode proof runs and share card manifests, keeps the richest version, and syncs the merged history back to Supabase. The Account view includes a cloud acceptance checklist for env configuration, auth session, refresh token, cloud records, mode proof runs, share manifests, content fingerprints, pending sync coverage and public profile archive readiness.
The Account view also includes a cross-device cloud sync audit plus a read-back ledger for profile, prediction history, mode proof history, share card manifests, public share image URLs, content fingerprints, public proof links, public profile archives and leaderboard backend evidence. The ledger lists verified and missing capsule/mode/proof/share IDs, image URL IDs, public profile archive IDs and content fingerprint IDs, so local-only fallback state, partial Supabase writes, and stale remote rows are visible before claiming cloud readiness.
The Account view also generates an account handoff packet. It summarizes private profile read-back, prediction/mode/share artifact counts, content fingerprint matches, public profile archive readiness, missing runtime env and the exact production verification env block, then offers one copy action for cross-device release checks.
The production account radar now requires matching content fingerprints for records, mode proof runs and share card manifests. Matching row counts alone are not enough; stale remote JSON keeps the account item below verified until the exact locked payloads read back from Supabase.
The Account view also includes a production acceptance radar. It deliberately keeps demo/local states visible by scoring real account sync, realtime data enrichment, production Filecoin sealing, public share cards, leaderboard backend rows, sealed mode runs, automated test evidence and external deployment evidence separately. Public sharing acceptance now uses Supabase-backed card manifests in `kickoff_share_artifacts` with PNG filename, byte size, SHA-256 image hash, deployed HTTPS proof URL, deployed HTTPS image URL, cloud manifest read-back, public image URL read-back, public-link read-back, and X/native share-channel exercise instead of a transient "image generated this session" flag. Localhost or path-only card URLs can still be previewed during development, but they remain non-production evidence. Mode acceptance is also public-evidence based: bracket, parlay, Agent vs Human and upset all need a sealed/scored mode run, matching Supabase content fingerprint, anonymous `?mode=` proof read-back and a production HTTPS mode share card before the radar marks modes complete. The Account view also exposes a share artifact ledger so each record and mode proof shows whether its publishable card evidence is complete.
Tournament mode proof runs are stored in `kickoff_mode_runs`, so bracket paths, parlay tickets, Agent vs Human calibration reports and upset challenges can appear on the public profile across devices instead of staying in localStorage.
The `kickoff_leaderboard` view is public-read and supports the app's global, friend-code and season filters. It returns global, friend-code and season scoped ranks, locks, revealed proof count, mode proof count, average score, best score, XP, current winner streak, exact-score hits, verified real Filecoin proofs, and the latest update time. It aggregates both `kickoff_records` and `kickoff_mode_runs`, so bracket paths, parlays, Agent vs Human reports and upset challenges contribute to ranking instead of only appearing on the public profile. The app can read this view with the anon key, so public leaderboards still render before the viewer signs in. Account now exposes an editable friend leaderboard code and a copyable `?friend=` invite link; synced profile, prediction, mode and share rows use that explicit code before falling back to location/email-derived grouping. Each scope loads the visible top page and then runs a targeted current-user query with the same scope filter, so acceptance can still prove the current user exists in the backend even when they are outside the first 20 rows. The Memory dashboard now caches global, friend and season leaderboard responses separately, records query evidence for each scope including filter, target query, status, row count, sample IDs and whether the current user appears in that scoped result. Both the Memory readiness checklist and Account production radar require successful rows that include the current user for all three scope queries before leaderboard backend acceptance is considered complete.
The Memory dashboard also renders a leaderboard evidence packet. It is a copyable review artifact for judges or production operators, showing the three scope filters, remote row counts, current-user scope coverage, sample row IDs and the next scope that must be fixed before leaderboard backend acceptance can pass.

Simple Supabase leaderboard acceptance query:

```sql
select
  global_rank,
  friend_rank,
  season_rank,
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
