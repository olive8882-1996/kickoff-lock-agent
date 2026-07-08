import type { CloudSyncVerification, PublicProfile, ShareArtifactEvidence } from "./types";
import { stableJson } from "./proof";

export type ProfileArchiveEvidenceStatus = "passed" | "pending" | "blocked";

export type ProfileArchiveEvidenceCheck = {
  key: string;
  label: string;
  status: ProfileArchiveEvidenceStatus;
  detail: string;
};

export type ProfileArchiveManifest = {
  profileId: string;
  profileUrl: string;
  records: Array<{
    id: string;
    matchLabel: string;
    proofUrl: string;
    cid: string;
    payloadHash: string;
    proofStatus: string;
    shareCardId?: string;
    shareImageUrl?: string;
    shareImageHash?: string;
  }>;
  modeRuns: Array<{
    id: string;
    modeId: string;
    title: string;
    proofUrl: string;
    cid: string;
    payloadHash: string;
    proofStatus: string;
    shareCardId?: string;
    shareImageUrl?: string;
    shareImageHash?: string;
  }>;
  shareCards: Array<{
    id: string;
    kind: ShareArtifactEvidence["kind"];
    proofUrl: string;
    fileName?: string;
    imageUrl?: string;
    imageHash?: string;
    imageByteLength?: number;
    publishable: boolean;
    publicImage: boolean;
  }>;
};

export type ProfileArchiveEvidencePacket = {
  profileId: string;
  displayName: string;
  source: "local-preview" | "public-page" | "cloud-readback";
  profileUrl: string;
  records: number;
  modeRuns: number;
  shareCards: number;
  publishableShareCards: number;
  publicImageCards: number;
  verifiedArchives: number;
  expectedArchives: number;
  contentFingerprints: number;
  publicProofLinks: number;
  manifest: ProfileArchiveManifest;
  manifestJson: string;
  ready: boolean;
  checks: ProfileArchiveEvidenceCheck[];
  missingIds: string[];
  summary: string;
  nextAction: string;
  copyText: string;
};

type BuildProfileArchiveEvidenceInput = {
  profile: PublicProfile;
  profileUrl: string;
  verification?: CloudSyncVerification;
  source?: ProfileArchiveEvidencePacket["source"];
};

const cloudIdFor = (artifact: ShareArtifactEvidence) => `${artifact.kind}:${artifact.id}`;

const hasPublishableImage = (artifact: ShareArtifactEvidence) =>
  Boolean(artifact.imageGenerated && artifact.imageHash && artifact.imageByteLength && artifact.proofUrl);

const hasPublicImage = (artifact: ShareArtifactEvidence) => Boolean(artifact.imageUrl?.startsWith("https://"));

const statusFor = (blocked: boolean, passed: boolean): ProfileArchiveEvidenceStatus =>
  blocked ? "blocked" : passed ? "passed" : "pending";

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const profileScopedUrl = (profileUrl: string, key: "proof" | "mode", id: string) => {
  try {
    const url = new URL(profileUrl);
    url.search = "";
    url.searchParams.set(key, id);
    url.hash = "";
    return url.toString();
  } catch {
    return `${profileUrl}${profileUrl.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(id)}`;
  }
};

const artifactFor = (artifacts: ShareArtifactEvidence[], id: string, kind: ShareArtifactEvidence["kind"]) =>
  artifacts.find((artifact) => artifact.id === id && artifact.kind === kind);

const buildManifest = (profile: PublicProfile, profileUrl: string): ProfileArchiveManifest => ({
  profileId: profile.id,
  profileUrl,
  records: profile.records.map((record) => {
    const artifact = artifactFor(profile.shareArtifacts, record.capsule.id, "record");
    return {
      id: record.capsule.id,
      matchLabel: record.capsule.matchLabel,
      proofUrl: artifact?.proofUrl || profileScopedUrl(profileUrl, "proof", record.capsule.id),
      cid: record.capsule.filecoinProof.cid,
      payloadHash: record.capsule.payloadHash,
      proofStatus: record.capsule.filecoinProof.proofStatus,
      shareCardId: artifact ? cloudIdFor(artifact) : undefined,
      shareImageUrl: artifact?.imageUrl,
      shareImageHash: artifact?.imageHash,
    };
  }),
  modeRuns: profile.modeRuns.map((run) => {
    const artifact = artifactFor(profile.shareArtifacts, run.id, "mode");
    return {
      id: run.id,
      modeId: run.modeId,
      title: run.title,
      proofUrl: artifact?.proofUrl || profileScopedUrl(profileUrl, "mode", run.id),
      cid: run.filecoinProof.cid,
      payloadHash: run.payloadHash,
      proofStatus: run.filecoinProof.proofStatus,
      shareCardId: artifact ? cloudIdFor(artifact) : undefined,
      shareImageUrl: artifact?.imageUrl,
      shareImageHash: artifact?.imageHash,
    };
  }),
  shareCards: profile.shareArtifacts.map((artifact) => ({
    id: artifact.id,
    kind: artifact.kind,
    proofUrl: artifact.proofUrl,
    fileName: artifact.fileName,
    imageUrl: artifact.imageUrl,
    imageHash: artifact.imageHash,
    imageByteLength: artifact.imageByteLength,
    publishable: hasPublishableImage(artifact),
    publicImage: hasPublicImage(artifact),
  })),
});

export const buildProfileArchiveEvidencePacket = ({
  profile,
  profileUrl,
  verification,
  source = "public-page",
}: BuildProfileArchiveEvidenceInput): ProfileArchiveEvidencePacket => {
  const recordIds = profile.records.map((record) => record.capsule.id);
  const modeRunIds = profile.modeRuns.map((run) => run.id);
  const shareArtifactIds = profile.shareArtifacts.map(cloudIdFor);
  const expectedArchives = recordIds.length + modeRunIds.length + shareArtifactIds.length;
  const verifiedProfileRecords = verification?.publicProfileRecordIds?.length ?? 0;
  const verifiedProfileModeRuns = verification?.publicProfileModeRunIds?.length ?? 0;
  const verifiedProfileShareArtifacts = verification?.publicProfileShareArtifactIds?.length ?? 0;
  const verifiedArchives = verifiedProfileRecords + verifiedProfileModeRuns + verifiedProfileShareArtifacts;
  const verifiedProfileRecordContent = verification?.publicProfileRecordContentIds?.length ?? verifiedProfileRecords;
  const verifiedProfileModeRunContent = verification?.publicProfileModeRunContentIds?.length ?? verifiedProfileModeRuns;
  const verifiedProfileShareArtifactContent =
    verification?.publicProfileShareArtifactContentIds?.length ?? verifiedProfileShareArtifacts;
  const verifiedArchiveFingerprints =
    verifiedProfileRecordContent + verifiedProfileModeRunContent + verifiedProfileShareArtifactContent;
  const publishableShareCards = profile.shareArtifacts.filter(hasPublishableImage).length;
  const publicImageCards = profile.shareArtifacts.filter(hasPublicImage).length;
  const contentFingerprints =
    (verification?.recordContentIds?.length ?? 0) +
    (verification?.modeRunContentIds?.length ?? 0) +
    (verification?.shareArtifactContentIds?.length ?? 0);
  const publicProofLinks = verification?.publicProofs ?? 0;
  const manifest = buildManifest(profile, profileUrl);
  const manifestJson = stableJson(manifest);
  const expectedProofLinks = recordIds.length + modeRunIds.length;
  const hasVerification = Boolean(verification);
  const missingIds = unique([
    ...(verification?.missingPublicProfileRecordIds ?? recordIds),
    ...(verification?.missingPublicProfileModeRunIds ?? modeRunIds),
    ...(verification?.missingPublicProfileShareArtifactIds ?? shareArtifactIds),
    ...(verification?.missingPublicProfileRecordContentIds ?? []),
    ...(verification?.missingPublicProfileModeRunContentIds ?? []),
    ...(verification?.missingPublicProfileShareArtifactContentIds ?? []),
    ...(verification?.missingRecordContentIds ?? []),
    ...(verification?.missingModeRunContentIds ?? []),
    ...(verification?.missingShareArtifactContentIds ?? []),
    ...(verification?.missingPublicShareImageIds ?? []),
  ]);

  const publicArchiveReady =
    hasVerification &&
    Boolean(verification?.publicProfile) &&
    verifiedProfileRecords >= recordIds.length &&
    verifiedProfileModeRuns >= modeRunIds.length &&
    verifiedProfileShareArtifacts >= shareArtifactIds.length;
  const archiveContentReady = hasVerification && verifiedArchiveFingerprints >= expectedArchives;
  const contentReady = hasVerification && contentFingerprints >= expectedArchives && archiveContentReady;
  const shareImagesReady = profile.shareArtifacts.length > 0 && publicImageCards >= profile.shareArtifacts.length;
  const publicProofsReady = hasVerification && publicProofLinks >= expectedProofLinks;
  const ready = publicArchiveReady && contentReady && (profile.shareArtifacts.length === 0 || shareImagesReady) && publicProofsReady;

  const checks: ProfileArchiveEvidenceCheck[] = [
    {
      key: "profile-url",
      label: "Profile URL",
      status: statusFor(false, Boolean(profileUrl)),
      detail: profileUrl || "missing profile URL",
    },
    {
      key: "public-archive",
      label: "Anonymous archive read-back",
      status: statusFor(!hasVerification && source !== "public-page", publicArchiveReady),
      detail: hasVerification
        ? `${verifiedArchives}/${expectedArchives} profile archives read anonymously · ${verifiedArchiveFingerprints}/${expectedArchives} archive fingerprints`
        : source === "public-page"
          ? `${expectedArchives} archive item${expectedArchives === 1 ? "" : "s"} rendered on this profile page`
          : "cloud read-back has not run",
    },
    {
      key: "content-fingerprints",
      label: "Content fingerprints",
      status: statusFor(!hasVerification && source !== "public-page", contentReady),
      detail: hasVerification
        ? `${contentFingerprints}/${expectedArchives} remote fingerprints, ${verifiedArchiveFingerprints}/${expectedArchives} profile archive fingerprints match`
        : "waiting for cloud verification",
    },
    {
      key: "public-proof-links",
      label: "Public proof links",
      status: statusFor(!hasVerification && source !== "public-page", publicProofsReady),
      detail: hasVerification
        ? `${publicProofLinks}/${expectedProofLinks} proof links read anonymously`
        : `${expectedProofLinks} proof link target${expectedProofLinks === 1 ? "" : "s"} available in archive`,
    },
    {
      key: "share-cards",
      label: "Share-card manifests",
      status: statusFor(false, profile.shareArtifacts.length > 0 && publishableShareCards >= profile.shareArtifacts.length),
      detail:
        profile.shareArtifacts.length > 0
          ? `${publishableShareCards}/${profile.shareArtifacts.length} publishable card manifest${profile.shareArtifacts.length === 1 ? "" : "s"}`
          : "no share-card manifests yet",
    },
    {
      key: "public-images",
      label: "Public image URLs",
      status: statusFor(!hasVerification && source !== "public-page", shareImagesReady),
      detail:
        profile.shareArtifacts.length > 0
          ? `${publicImageCards}/${profile.shareArtifacts.length} public HTTPS image URL${profile.shareArtifacts.length === 1 ? "" : "s"}`
          : "generate share cards before public image read-back",
    },
  ];

  const nextAction =
    checks.find((check) => check.status !== "passed")?.detail ??
    "Public profile archive is ready for cross-device judging.";
  const summary = `${profile.displayName} · ${profile.locks} locks · ${profile.modeProofs} modes · ${publishableShareCards}/${profile.shareArtifacts.length} share cards · ${verifiedArchives}/${expectedArchives} cloud archives`;
  const copyText = [
    "Kickoff Lock Agent profile archive evidence",
    `Profile: ${profile.displayName} (${profile.id})`,
    `URL: ${profileUrl}`,
    `Source: ${source}`,
    `Archives: ${verifiedArchives}/${expectedArchives}`,
    `Content fingerprints: ${contentFingerprints}/${expectedArchives}`,
    `Public proof links: ${publicProofLinks}/${expectedProofLinks}`,
    `Share cards: ${publishableShareCards}/${profile.shareArtifacts.length}`,
    `Public images: ${publicImageCards}/${profile.shareArtifacts.length}`,
    `Manifest: ${manifest.records.length} records, ${manifest.modeRuns.length} modes, ${manifest.shareCards.length} share cards`,
    `Ready: ${ready ? "yes" : "no"}`,
    `Next action: ${nextAction}`,
    missingIds.length > 0 ? `Missing: ${missingIds.slice(0, 8).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    profileId: profile.id,
    displayName: profile.displayName,
    source,
    profileUrl,
    records: profile.records.length,
    modeRuns: profile.modeRuns.length,
    shareCards: profile.shareArtifacts.length,
    publishableShareCards,
    publicImageCards,
    verifiedArchives,
    expectedArchives,
    contentFingerprints,
    publicProofLinks,
    manifest,
    manifestJson,
    ready,
    checks,
    missingIds,
    summary,
    nextAction,
    copyText,
  };
};
