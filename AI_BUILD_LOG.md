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

Tournament mode acceptance now requires public evidence, not just local runs. The production radar only marks modes complete when bracket, parlay, Agent vs Human and upset each have a sealed/scored run plus Supabase content-fingerprint read-back, anonymous `?mode=` proof read-back and a production HTTPS mode share card.

The Account area now includes a production acceptance radar. It is intentionally strict: demo/local profile state, seed data, mock Filecoin seals, local leaderboard rows and ungenerated share cards stay visible as partial or blocked until real external evidence is present.

Leaderboard backend validation was tightened so global, friend-code and season rows are fetched and cached separately. A single remote leaderboard response no longer counts as evidence for all scopes.

Leaderboard backend validation now records per-scope query evidence. The app stores global, friend-code and season filter strings, query status, row counts, checked timestamps and sample IDs, shows them in the Memory and Account views, and the production radar uses that evidence before calling the leaderboard backend complete.

Leaderboard production evidence now has to include the current user in each scoped result. Global, friend-code and season queries can have remote rows without satisfying acceptance if those rows belong only to other users, preventing stale or unrelated leaderboard data from turning the radar green.

Cloud account validation now requires read-back proof. After profile/history/mode sync, the app reads the Supabase rows back with the user session, checks anonymous public proof URLs, and checks the public profile page before marking account acceptance as synced.

Public profile validation now checks archive contents, not just page availability. The cloud verification records which prediction, mode proof and share-card IDs appear on `?profile=...`, and Account sync stays pending if the profile page opens but omits synced archives.

Cloud account validation now also exposes a read-back ledger in the Account view. It records verified and missing profile, capsule, mode proof and anonymous proof-link IDs, so real Supabase testing can diagnose partial writes instead of relying on aggregate counts only.

Cloud account validation now checks content fingerprints, not only row IDs. Record capsules, mode proof runs and share card manifests are compared after Supabase read-back, and the Account audit marks stale or mismatched remote rows as pending instead of treating matching IDs as enough.

The production account radar now depends on those content fingerprints too. A Supabase account is not marked verified unless record, mode proof and share-card manifest content all read back with matching fingerprints, so row counts alone cannot satisfy real-account readiness.

Cloud account validation now also checks backend schema health. The Supabase schema publishes `kickoff_backend_health`, and the app requires required tables, views, RLS and policy count to pass before cross-device sync can be considered production-ready.

Production runtime configuration now has its own Account panel. It checks required Supabase, realtime-data, Filecoin seal and deployed HTTPS public-app-url environment gates separately from optional backup feeds, so a green demo build cannot hide missing deployment configuration.

Public sharing URLs now prefer `VITE_PUBLIC_APP_URL` instead of blindly using the current browser location. Localhost and path-only URLs still work for development previews, but they no longer count as production sharing evidence.

The generated Kickoff Lock trophy-lock logo was added as the shared brand asset for the hero lockup, proof pages, social card rendering, favicon, Open Graph/Twitter image, Apple touch icon, and PWA icon set.

Automated-test acceptance was made explicit with a manifest-driven checklist. The Account view now lists every验收用例 with its command, spec file and covered requirement, and the production radar scores the automated-test category from that manifest instead of a vague static claim.

Automated-test acceptance now requires run evidence, not only declared coverage. `bun run verify:acceptance` runs the acceptance command set and writes `public/acceptance-evidence.json`; the Account view loads that packet and keeps the automated-test radar item below verified until every suite has matching passed evidence.

Acceptance run evidence is now bound to the current suite manifest. The evidence packet stores a deterministic manifest hash, and the Account production radar rejects stale `acceptance-evidence.json` files when commands, covered specs or proof text change.

Acceptance run evidence also has a freshness window. The Account production radar rejects otherwise-passing evidence older than 7 days, so final submissions have to include a recent `bun run verify:acceptance` run instead of an old local packet.

External production evidence now has its own script and Account panel. `bun run verify:production` writes `public/production-evidence.json` after checking deployed app URLs, Supabase backend health, current-user leaderboard scopes, realtime provider routes, Filecoin seal API health, public proof/profile/mode links and share-image URL read-back.

The production evidence script now loads local env files before checking deployed services and validates the published acceptance evidence JSON with the same manifest hash and 7-day freshness rules used by the app.

Production evidence loading now starts from `.env.example` as low-priority non-secret defaults before overlaying local production env files. The generated packet records the env file names used, so public URL, redirect, default TheSportsDB and share-bucket checks can run without committing secrets while still showing whether real Supabase/Filecoin keys are absent.

Free public data verification now checks continuity across TheSportsDB and ESPN instead of depending on one flaky endpoint. A production evidence packet keeps both feed details, but the required free-schedule gate passes when either source returns a valid FIFA World Cup payload; lineup, injury and odds enrichment still require API-Football or odds-provider read-back.

GitHub Pages publishing is now evidence-aware. The reusable deploy script syncs `dist` to `gh-pages`, and `docs/deploy-pages.workflow.yml` provides the two-phase workflow: generate acceptance evidence, build and publish it, wait for the public URL to refresh, generate production evidence against that public deployment, then build and publish again so `production-evidence.json` reflects the deployed `acceptance-evidence.json` instead of a stale manifest.

The Account view now generates a copyable production verification env block from the current synced profile, first locked proof, first mode proof, friend/season filters and public share image URL, reducing the manual handoff needed before running `bun run verify:production`.

The production evidence script now also checks explicit Supabase target rows for the copied profile, prediction, mode proof and share artifact IDs. A public app URL returning 200 is no longer enough; the backing public tables must contain the synced artifacts and the record share artifact must include a public image URL plus image hash.

External deployment evidence is now part of the main production radar. `production-evidence.json` no longer lives only in a separate Account panel; its required pass count contributes a dedicated external-evidence gate, so missing public app, Supabase, data, Filecoin or share-image proof remains visible in the top-level readiness score.

Filecoin auto-seal validation now includes proof registry read-back. After upload and CID verification polling, the browser reads `/proof/:cid`, checks CID, payload hash and byte length against the uploaded stable capsule JSON, records registry status/hash/timestamp on the seal job, and the production radar requires this evidence before Filecoin can be considered verified.

Filecoin production readiness now covers both proof surfaces. A single match capsule and at least one tournament mode proof must each have a real proof, verified seal job, matching uploaded payload hash and proof-registry read-back before the Filecoin radar turns verified.

The seal API now rejects mutable draft payloads before upload. `POST /seal` requires a locked capsule, `sealedAt`, a 64-character SHA-256 capsule payload hash and prediction payload, preventing direct API calls from spending Synapse/Filecoin work on unsealed predictions.

Tournament mode proofs now reuse the same Filecoin seal workflow. `POST /seal` also accepts sealed/scored mode proof runs with linked capsule IDs, and the Modes view can auto seal a mode proof, poll CID verification, read the proof registry, attach the returned real proof and sync the updated mode run.

Mode proof sealing now shows the same acceptance evidence as single prediction sealing. Each sealed mode run renders backend health, production blockers, upload acceptance, payload hash matching, CID polling, registry read-back, verifier links, token enforcement and upload-limit checks inside the mode card.

The seal API health contract now reports `productionReady` and concrete blockers. Mock mode, missing `SYNAPSE_PRIVATE_KEY`, missing upload token, memory-only proof storage, or an invalid upload limit can still support local smoke tests, but the Account radar will not count them as a production Filecoin backend.

Public sharing acceptance was tightened with persisted evidence. Generating a record or mode proof card now records a publishable PNG manifest with file name, byte size, SHA-256 image hash, proof URL and timestamp; opening native share or X intent records channel evidence; and the Account radar requires full card manifests plus anonymous public-link read-back before the sharing category can be verified. The Account view now includes a share artifact ledger for per-record and per-mode proof card evidence.

Share artifact evidence was promoted from local-only state to cloud-backed account data. The app now syncs generated record/mode proof card manifests into `kickoff_share_artifacts`, pulls and merges them after sign-in, reads them back during cloud verification, and keeps the production sharing radar partial until publishable manifests are confirmed from Supabase.

The public verifier now surfaces share card manifest evidence. Proof and mode proof links can load the matching `kickoff_share_artifacts` row, and the page shows whether the social card metadata came from local generation or cloud read-back, including PNG filename, byte size, MIME type, image hash, proof URL and share channel state.

Production sharing evidence now requires deployed HTTPS proof URLs in addition to PNG/hash manifests. Localhost and path-only share cards can still support development previews, but the Account production radar keeps sharing incomplete until the proof or mode URL is publicly reachable.

Share card manifests now distinguish local PNG generation from public social-card hosting. A production share artifact can carry a deployed HTTPS image URL, and public proof metadata uses that URL for Open Graph, Twitter cards and JSON-LD instead of falling back to the default logo.

Generated share cards now have a Supabase Storage publishing path. When a signed-in user generates or shares a proof card, the app uploads the PNG to the configured public `kickoff-share-cards` bucket, stores the returned public image URL in the manifest, and keeps local-only generation visibly incomplete when that upload cannot happen.

Public share image acceptance now requires URL read-back. Cloud verification checks each synced share artifact's deployed HTTPS image URL with a public HEAD/GET request, the Account ledger lists missing image IDs, and the production sharing radar stays incomplete if a manifest exists but the PNG cannot be fetched.

Cloud sync completion now uses one strict read-back predicate across Account state, cloud coverage and production readiness. Backend health, profile rows, prediction rows, mode rows, share manifests, content fingerprints, public proof links, public profile archive rows and public share images must all match before a sync is treated as complete.

The public profile page now carries the same evidence into the user-facing archive. Profile stats include share-card count, and each prediction or mode proof row marks whether a publishable share card manifest is available, so a public profile is no longer just a history list; it also exposes social proof-card readiness.

Public proof surfaces now publish machine-readable social metadata. Proof, mode proof and profile pages set canonical URLs, Open Graph/Twitter card tags and JSON-LD from the active locked artifact, and each page shows a Social metadata card with preview title, URL, image source and manifest hash evidence.

Realtime data acceptance now has a health snapshot. The app combines active provider route, provider response audit, last sync freshness, live/configured signal count, evidence rows and missing enrichment layers into a Match board panel, and the production radar uses that health gate instead of only checking that provider rows exist.

Realtime data evidence is now structured instead of text-only. Every match refresh builds an audit packet with the serving route, provider endpoint/status/row count/sample IDs, checked timestamp, match counts, per-signal coverage totals, sample fixture coverage and missing signals; seed fallback remains useful but explicitly evidence-only rather than production-ready.

API-Football fixture rows no longer promote enrichment by themselves. Base fixtures count for schedule and score, while lineups, injuries and odds remain missing until the dedicated enrichment endpoints are actually called and read back.

API-Football enrichment is now part of the automatic refresh path. When configured, the provider loader attempts lineups, injuries and odds endpoint read-back for a quota-limited fixture window, merges live rows into match intelligence, and exposes an enrichment audit inside the realtime evidence packet.

The default free TheSportsDB route now also performs controlled enrichment read-back. It attempts event lineup and stats endpoints for a limited fixture window, records attempted/fulfilled/live counts in the realtime audit packet, and keeps injuries and odds visibly incomplete unless separate providers cover them.

Realtime data production readiness now distinguishes configured keys from verified enrichment. Lineups, injuries and odds only satisfy the provider health snapshot and Account production radar when their dedicated endpoint audit has live read-back, so API keys alone cannot make realtime data appear complete.

Filecoin CID lookup can now feed back into the product workflow. A verifier lookup result may be attached to the local capsule as a real proof, but the app blocks the attach when `/proof/:cid` returns a payload hash that does not match the locked capsule hash.

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
