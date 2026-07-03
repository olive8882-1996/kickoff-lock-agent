import { isProductionProofUrl, isProductionShareArtifact, isPublishableShareArtifact } from "./shareCard";
import type { GameModeRun, MemoryRecord, ShareArtifactEvidence } from "./types";

export type SharePublishQueueItem = {
  id: string;
  kind: ShareArtifactEvidence["kind"];
  label: string;
  hasManifest: boolean;
  hasProductionUrl: boolean;
};

export type SharePublishQueue = {
  totalArtifacts: number;
  publishable: number;
  productionReady: number;
  missingProduction: number;
  items: SharePublishQueueItem[];
  summary: string;
  nextAction: string;
};

const artifactFor = (evidence: ShareArtifactEvidence[], id: string, kind: ShareArtifactEvidence["kind"]) =>
  evidence.find((item) => item.id === id && item.kind === kind);

export const buildSharePublishQueue = (
  records: MemoryRecord[],
  modeRuns: GameModeRun[],
  evidence: ShareArtifactEvidence[],
): SharePublishQueue => {
  const rows = [
    ...records.map((record) => ({
      id: record.capsule.id,
      kind: "record" as const,
      label: record.capsule.matchLabel,
      artifact: artifactFor(evidence, record.capsule.id, "record"),
    })),
    ...modeRuns.map((run) => ({
      id: run.id,
      kind: "mode" as const,
      label: run.title,
      artifact: artifactFor(evidence, run.id, "mode"),
    })),
  ];
  const publishable = rows.filter((row) => isPublishableShareArtifact(row.artifact)).length;
  const productionReady = rows.filter((row) => isProductionShareArtifact(row.artifact)).length;
  const items = rows
    .filter((row) => !isProductionShareArtifact(row.artifact))
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      label: row.label,
      hasManifest: isPublishableShareArtifact(row.artifact),
      hasProductionUrl: isProductionProofUrl(row.artifact?.imageUrl),
    }));
  const missingProduction = items.length;
  return {
    totalArtifacts: rows.length,
    publishable,
    productionReady,
    missingProduction,
    items,
    summary: `${productionReady}/${rows.length} production share cards · ${publishable}/${rows.length} PNG manifests`,
    nextAction:
      missingProduction === 0
        ? "All proof cards have production share evidence."
        : `Publish ${missingProduction} missing proof card${missingProduction === 1 ? "" : "s"} and sync Supabase share manifests.`,
  };
};
