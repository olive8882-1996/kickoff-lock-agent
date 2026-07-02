# Kickoff Lock Agent

Kickoff Lock Agent turns World Cup predictions into verifiable Filecoin-backed memory capsules: sealed before kickoff, revealed after the final whistle.

## What It Does

- Pick a World Cup match.
- Ask the prediction agent to draft a scoreline, key players, confidence, and reasoning.
- Lock the prediction into a read-only capsule with hash, timestamp, CID, PieceCID, and proof status.
- Reveal after the match with an actual score.
- Get an explainable score and a generated 1200x675 social proof image with stadium artwork, CID, hash, proof status, and public verifier URL.
- Keep every revealed call in a tournament memory dashboard.
- Sign in with Supabase Google OAuth or magic links to sync profile, prediction history, public proof links, and global/friend/season leaderboards.
- Build a 4-pick knockout path in the bracket builder, then seal it as its own proof run.
- Create additional mode proof runs for parlays, Agent vs Human calibration, and upset challenges, each with a public verifier and mode share image.

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
The match board also auto-refreshes provider data on a short interval, shows last sync and next auto-sync timestamps, and keeps manual refresh available for live score checks during a match window.
Rank signal uses a bundled FIFA/Coca-Cola Men's World Ranking snapshot from the 2026-06-11 official update as a baseline for provider feeds that do not return rankings directly. Lineups, injuries and odds remain live/configured enrichment: API-Football can supply fixture lineups, injuries and odds, while The Odds API can enrich H2H market prices for non API-Football fixtures.
TheSportsDB defaults to the free v1 key `123`, World Cup league id `4429`, and current UTC year season; override with `VITE_THESPORTSDB_KEY`, `VITE_THESPORTSDB_LEAGUE_ID`, and `VITE_THESPORTSDB_SEASON` if TheSportsDB changes tournament IDs.

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

The API exposes `GET /health`, `POST /seal`, `GET /verify?cid=...`, and `GET /proof/:cid`. Each successful seal is registered by CID with payload hash, byte length, provider metadata, and checked timestamps, so the verifier only reports proof metadata for CIDs sealed by that backend instance. Set `FILECOIN_PROOF_STORE_PATH` to persist that registry across server restarts; without it, the server falls back to memory-only mode for local demos. Set `FILECOIN_SEAL_TOKEN` to require a bearer token for browser upload requests while leaving public proof verification readable.
The frontend runs a health preflight, uploads the stable capsule payload, polls CID verification, stores proof/verify URLs, and renders a Filecoin acceptance checklist for backend configuration, API health, upload acceptance, CID return, verification polling, and verifier URL readiness.
The public verifier also includes a CID lookup panel that queries the configured seal API and displays proof status, PieceCID, provider, dataset, and retrieval URL.

Key files:

- `src/proof.ts`: capsule hash, demo proof, real proof import.
- `src/providers.ts`: API-Football, Football-Data.org, TheSportsDB, ESPN, The Odds API, worldcup26 and seed fallback.
- `src/scoring.ts`: explainable scoring engine.
- `src/cloud.ts`: Supabase auth, profile sync, prediction history sync, mode proof run sync, public proof/profile lookup, and leaderboard queries.
- `src/bracket.ts`: knockout path builder, bracket readiness rules, and bracket proof run sealing.
- `src/modes.ts`: bracket/parlay/agent/upset mode proof runs, including parlay tickets, agent calibration reports and upset bonus tickets.
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
```

## Cloud Backend

Create the tables and views in `supabase.schema.sql`, then set:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SUPABASE_REDIRECT_URL=https://your-site.example/kickoff-lock-agent/
VITE_APIFOOTBALL_KEY=...
VITE_FOOTBALL_DATA_TOKEN=...
VITE_FOOTBALL_DATA_COMPETITION=WC
VITE_THESPORTSDB_KEY=123
VITE_THESPORTSDB_LEAGUE_ID=4429
VITE_THESPORTSDB_SEASON=2026
VITE_ODDS_API_KEY=...
VITE_ODDS_API_SPORT_KEY=...
```

Public proof pages can load a capsule from Supabase by `?proof=<capsule-id>` when the record has been synced. Tournament mode proofs can also be opened by `?mode=<mode-run-id>`, including bracket paths, parlays, calibration reports and upset tickets.
After a Supabase Google OAuth or magic-link sign-in, the app stores the Supabase session, refreshes expired access tokens when a refresh token is available, automatically pulls cloud history, merges it with local prediction records and local mode proof runs, keeps the richest version, and syncs the merged history back to Supabase. The Account view includes a cloud acceptance checklist for env configuration, auth session, refresh token, cloud records, mode proof runs, pending sync coverage and public profile readiness.
Tournament mode proof runs are stored in `kickoff_mode_runs`, so bracket paths, parlay tickets, Agent vs Human calibration reports and upset challenges can appear on the public profile across devices instead of staying in localStorage.
The `kickoff_leaderboard` view is public-read and supports the app's global, friend-code and season filters. It returns rank, locks, revealed proof count, mode proof count, average score, best score, XP, current winner streak, exact-score hits, verified real Filecoin proofs, and the latest update time. It aggregates both `kickoff_records` and `kickoff_mode_runs`, so bracket paths, parlays, Agent vs Human reports and upset challenges contribute to ranking instead of only appearing on the public profile. The app can read this view with the anon key, so public leaderboards still render before the viewer signs in. The Memory dashboard also shows a leaderboard backend readiness checklist so Supabase rows are not confused with the local fallback row.

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
16. Supabase Google OAuth or magic-link sign-in can sync profile, prediction records and mode proof runs across devices, with pending local items visible until cloud acknowledgement.
17. Public profile links can load synced proof history and tournament mode proof runs by `?profile=<user-id>`, and each mode run has a verifier page by `?mode=<mode-run-id>`.
18. Global, friend and season leaderboards expose rank, XP, revealed count, mode proof count, exact hits and real proof count, with backend readiness shown separately from local fallback.
19. Share images can be generated from locked proof cards and tournament mode proofs, including score/status, proof pattern, CID and public verifier URL.
20. Share actions produce a public proof URL or mode proof URL, CID-aware post text, X/Twitter intent fallback, and native image sharing when the browser supports file shares.

## Submission Notes

The product avoids official FIFA marks and does not embed copyrighted match footage. It uses public match metadata only, supports manual result entry, and keeps Filecoin proof mechanics as the core experience.
