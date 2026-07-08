import type { GameModeRun, MemoryRecord, PublicProfile, ShareArtifactEvidence } from "./types";

export type ProductionPublicFixtures = {
  generatedAt: string;
  source: "production-target-seed";
  profile: PublicProfile;
  record: MemoryRecord;
  modeRun: GameModeRun;
  modeRuns: GameModeRun[];
  shareArtifacts: ShareArtifactEvidence[];
};

type FetchLike = typeof fetch;

export const productionPublicFixturesUrl = (baseUrl: string, href = globalThis.location?.href ?? "http://localhost/") => {
  const normalized = baseUrl || "/";
  return new URL(`${normalized.endsWith("/") ? normalized : `${normalized}/`}production-public-fixtures.json`, href).toString();
};

export const isProductionPublicFixtures = (value: unknown): value is ProductionPublicFixtures => {
  const packet = value as Partial<ProductionPublicFixtures> | undefined;
  return Boolean(
    packet &&
      packet.source === "production-target-seed" &&
      packet.profile?.id &&
      packet.record?.capsule?.id &&
      Array.isArray(packet.modeRuns) &&
      Array.isArray(packet.shareArtifacts),
  );
};

export const loadProductionPublicFixtures = async (
  baseUrl: string,
  fetcher: FetchLike = fetch,
): Promise<ProductionPublicFixtures | undefined> => {
  const response = await fetcher(productionPublicFixturesUrl(baseUrl), { cache: "no-store" });
  if (!response.ok) return undefined;
  const body = await response.json();
  return isProductionPublicFixtures(body) ? body : undefined;
};

export const fixturePublicRecord = (fixtures: ProductionPublicFixtures | undefined, capsuleId: string) =>
  fixtures?.record.capsule.id === capsuleId ? fixtures.record : undefined;

export const fixturePublicModeRun = (fixtures: ProductionPublicFixtures | undefined, runId: string) =>
  fixtures?.modeRuns.find((run) => run.id === runId);

export const fixturePublicProfile = (fixtures: ProductionPublicFixtures | undefined, profileId: string) =>
  fixtures?.profile.id === profileId ? fixtures.profile : undefined;

export const fixturePublicShareArtifact = (
  fixtures: ProductionPublicFixtures | undefined,
  id: string,
  kind: ShareArtifactEvidence["kind"],
) => fixtures?.shareArtifacts.find((artifact) => artifact.id === id && artifact.kind === kind);
