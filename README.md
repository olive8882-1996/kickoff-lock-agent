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

## Data Strategy

The app works without API keys.

1. Primary: ESPN scoreboard API.
2. Fallback: worldcup26.ir.
3. Safety net: bundled seed matches and manual result input.

External APIs are only used for match/result convenience. The core product mechanic is the prediction capsule and proof flow.

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

The API exposes `GET /health`, `POST /seal`, `GET /verify?cid=...`, and `GET /proof/:cid`. The frontend uploads the stable capsule payload, polls CID verification, and updates the proof workflow steps.

Key files:

- `src/proof.ts`: capsule hash, demo proof, real proof import.
- `src/providers.ts`: ESPN/worldcup26/seed fallback.
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
```

Public proof pages can load a capsule from Supabase by `?proof=<capsule-id>` when the record has been synced.

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

## Submission Notes

The product avoids official FIFA marks and does not embed copyrighted match footage. It uses public match metadata only, supports manual result entry, and keeps Filecoin proof mechanics as the core experience.
