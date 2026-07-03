# AI Build Log

## Product Direction

The project started from the contest theme: build an agent, workflow, or tool that uses Filecoin for memory, logs, datasets, proofs, or storage. The selected concept was Kickoff Lock Agent, a World Cup prediction agent that seals claims before kickoff and verifies them after the match.

## AI-Assisted Planning

AI was used to compare contest-winning patterns from the previous FilecoinTLDR cycle. The strongest pattern was clear: Filecoin should be part of the product mechanic, not hidden storage. That led to the "seal before kickoff, prove after the whistle" mechanic.

## Data Design

AI helped evaluate free match data sources. The chosen architecture is ESPN as primary, worldcup26 as fallback, seed data as the safety net, and manual result entry for resilience.

## Implementation Notes

The app was structured around simple verifiable states:

- match selected
- prediction drafted
- capsule locked
- result revealed
- proof card shared
- memory archived

Demo mode is intentionally explicit so judges can distinguish product simulation from a real Synapse upload. A real Synapse adapter is included for funded-key operation.

The tournament modes were expanded beyond status cards with a knockout path builder. The builder creates four editable advancement picks from live/upcoming matches, saves the draft locally, and seals the full bracket path into a standalone mode proof run with hash and CID.

The Account area now includes a production acceptance radar. It is intentionally strict: demo/local profile state, seed data, mock Filecoin seals, local leaderboard rows and ungenerated share cards stay visible as partial or blocked until real external evidence is present.

Leaderboard backend validation was tightened so global, friend-code and season rows are fetched and cached separately. A single remote leaderboard response no longer counts as evidence for all scopes.

Cloud account validation now requires read-back proof. After profile/history/mode sync, the app reads the Supabase rows back with the user session, checks anonymous public proof URLs, and checks the public profile page before marking account acceptance as synced.

The generated Kickoff Lock trophy-lock logo was added as the shared brand asset for the hero lockup, proof pages, social card rendering, favicon, Open Graph/Twitter image, Apple touch icon, and PWA icon set.

Automated-test acceptance was made explicit with a manifest-driven checklist. The Account view now lists every验收用例 with its command, spec file and covered requirement, and the production radar scores the automated-test category from that manifest instead of a vague static claim.

Public sharing acceptance was tightened with persisted evidence. Generating a record or mode proof card now records the proof URL and timestamp, opening native share or X intent records channel evidence, and the Account radar requires share-card evidence plus anonymous public-link read-back before the sharing category can be verified.

Realtime data acceptance now has a health snapshot. The app combines active provider route, last sync freshness, live/configured signal count, evidence rows and missing enrichment layers into a Match board panel, and the production radar uses that health gate instead of only checking that provider rows exist.

## Debugging Plan

The final app should be checked through:

- `bun run build`
- `bun run test`
- `bun run test:e2e`
- `bun run test:e2e:seal`
- desktop browser flow
- mobile browser flow
- forced fallback mode
- demo proof mode
- real proof JSON import
