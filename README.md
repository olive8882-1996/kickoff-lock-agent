# Kickoff Lock Agent

Kickoff Lock Agent turns World Cup predictions into verifiable Filecoin-backed memory capsules: sealed before kickoff, revealed after the final whistle.

## What It Does

- Pick a World Cup match.
- Ask the prediction agent to draft a scoreline, key players, confidence, and reasoning.
- Lock the prediction into a read-only capsule with hash, timestamp, CID, PieceCID, and proof status.
- Reveal after the match with an actual score.
- Get an explainable score and a shareable proof card.
- Keep every revealed call in a tournament memory dashboard.
- Sign in with Supabase magic links to sync profile, prediction history, public proof links, and global/friend/season leaderboards.
- Build a 4-pick knockout path in the bracket builder, then seal it as its own proof run.
- Create additional mode proof runs for parlays, Agent vs Human calibration, and upset challenges.

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
3. Public fallback: ESPN scoreboard API.
4. Fallback: worldcup26.ir.
5. Safety net: bundled seed matches and manual result input.

The Odds API can also be configured for H2H odds enrichment on non API-Football fixtures. External APIs are used for match/result convenience and data evidence; the core product mechanic is still the prediction capsule and proof flow.
Each match now exposes a data coverage panel for schedule, score, rank signal, lineups, injuries and odds, so missing or fallback intelligence is visible instead of being presented as real live data.

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
SYNAPSE_PRIVATE_KEY=0x... ALLOW_ORIGIN=https://your-site.example bun run seal:api
```

Local smoke test without spending funds:

```bash
FILECOIN_SEAL_MOCK=1 bun run seal:api:mock
```

End-to-end seal workflow test without spending funds:

```bash
bun run test:e2e:seal
```

The API exposes `GET /health`, `POST /seal`, `GET /verify?cid=...`, and `GET /proof/:cid`. The frontend uploads the stable capsule payload, polls CID verification, and updates the proof workflow steps.
The public verifier also includes a CID lookup panel that queries the configured seal API and displays proof status, PieceCID, provider, dataset, and retrieval URL.

Key files:

- `src/proof.ts`: capsule hash, demo proof, real proof import.
- `src/providers.ts`: API-Football, Football-Data.org, ESPN, The Odds API, worldcup26 and seed fallback.
- `src/scoring.ts`: explainable scoring engine.
- `src/cloud.ts`: Supabase auth, profile sync, public proof lookup, and leaderboard queries.
- `src/bracket.ts`: knockout path builder, bracket readiness rules, and bracket proof run sealing.
- `src/modes.ts`: bracket/parlay/agent/upset mode proof runs.
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
VITE_ODDS_API_KEY=...
VITE_ODDS_API_SPORT_KEY=...
```

Public proof pages can load a capsule from Supabase by `?proof=<capsule-id>` when the record has been synced.
After a Supabase magic-link sign-in, the app automatically pulls cloud history, merges it with local records, keeps the richest capsule version, and syncs the merged history back to Supabase.
The `kickoff_leaderboard` view is public-read and supports the app's global, friend-code and season filters. It returns rank, locks, revealed proof count, average score, best score, XP, current winner streak, exact-score hits, verified real Filecoin proofs, and the latest update time. The app can read this view with the anon key, so public leaderboards still render before the viewer signs in.

Simple Supabase leaderboard acceptance query:

```sql
select
  rank,
  display_name,
  locks,
  revealed,
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
8. Proof card is clear and shareable.
9. Memory dashboard records revealed predictions.
10. ESPN failure falls back to worldcup26 or seed data.
11. App works without API keys or Filecoin private key in demo mode.
12. Demo mode is clearly labeled.
13. Real Synapse adapter exists and is documented.
14. Desktop and mobile layouts work.
15. Build passes with no blocking console errors.
16. Supabase magic-link sign-in can sync profile and records across devices.
17. Public profile links can load synced proof history by `?profile=<user-id>`.
18. Global, friend and season leaderboards expose rank, XP, revealed count, exact hits and real proof count.
19. Share images can be generated from locked proof cards.

## Submission Notes

The product avoids official FIFA marks and does not embed copyrighted match footage. It uses public match metadata only, supports manual result entry, and keeps Filecoin proof mechanics as the core experience.
