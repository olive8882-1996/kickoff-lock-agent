# Kickoff Lock Agent Submission

## Short Description

An AI agent that seals World Cup predictions before kickoff, reveals them after the final whistle, and turns each call into a Filecoin-style proof capsule.

## Main Mechanic

The user picks a match, lets the prediction agent create a scoreline and reasoning, then locks the prediction. The locked capsule becomes read-only and shows hash, timestamp, CID, PieceCID, provider, dataset, and proof status. After the match, the user imports or manually enters the final score, and the agent explains how well the prediction performed.

## Filecoin Usage

Kickoff Lock uses Filecoin as the trust and memory layer:

- `storage`: prediction capsules are designed to be stored through Synapse/Filecoin.
- `proof`: hash, CID, PieceCID, provider, dataset, and proof status are visible in the UI.
- `retrieval`: real proof JSON can be imported back into the app to update a capsule.
- `memory`: revealed predictions become a tournament memory archive.

Demo mode is clearly labeled. The repo also includes `scripts/seal-with-synapse.mjs` for real Synapse uploads with a funded key.

## Links

- Live demo: https://olive8882-1996.github.io/kickoff-lock-agent/
- Repository: https://github.com/olive8882-1996/kickoff-lock-agent
- Demo video: https://olive8882-1996.github.io/kickoff-lock-agent/kickoff-lock-demo.mov
- Screenshot: https://olive8882-1996.github.io/kickoff-lock-agent/kickoff-lock-screenshot.png
- Public X post: TBD

## Acceptance Checklist

- [ ] User can pick a match.
- [ ] User can generate or edit a prediction.
- [ ] User can lock the prediction before kickoff.
- [ ] Locked prediction cannot be edited.
- [ ] App shows CID/hash/timestamp/proof status.
- [ ] User can reveal with an actual score.
- [ ] App calculates and explains the score.
- [ ] Proof card is clear and shareable.
- [ ] Memory dashboard records revealed predictions.
- [ ] ESPN failure falls back to worldcup26 or seed data.
- [ ] App works without API keys or Filecoin private key in demo mode.
- [ ] Demo mode is clearly labeled.
- [ ] Real Synapse adapter exists and is documented.
- [ ] Desktop and mobile layouts work.
- [ ] Build passes with no blocking console errors.
