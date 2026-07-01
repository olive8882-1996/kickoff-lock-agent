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

## Debugging Plan

The final app should be checked through:

- `bun run build`
- desktop browser flow
- mobile browser flow
- forced fallback mode
- demo proof mode
- real proof JSON import
