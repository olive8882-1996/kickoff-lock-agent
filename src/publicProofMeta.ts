import type { GameModeRun, MemoryRecord, PublicProfile, ShareArtifactEvidence } from "./types";

export type PublicProofMeta = {
  kind: "record" | "mode" | "profile";
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  imageAlt: string;
  twitterCard: "summary_large_image";
  jsonLd: Record<string, unknown>;
  imageManifest?: {
    fileName?: string;
    imageUrl?: string;
    imageHash?: string;
    imageByteLength?: number;
    imageMime?: string;
  };
};

const absoluteUrl = (url: string, baseUrl: string) => new URL(url, baseUrl).toString();

const urlsMatch = (left?: string, right?: string) => {
  if (!left || !right) return false;
  try {
    return new URL(left, right).toString() === new URL(right).toString();
  } catch {
    return false;
  }
};

const artifactForProofUrl = (
  kind: ShareArtifactEvidence["kind"],
  id: string,
  canonicalUrl: string,
  artifact?: ShareArtifactEvidence,
) =>
  artifact?.kind === kind && artifact.id === id && urlsMatch(artifact.proofUrl, canonicalUrl)
    ? artifact
    : undefined;

const manifestFor = (artifact?: ShareArtifactEvidence) =>
  artifact
    ? {
        fileName: artifact.fileName,
        imageUrl: artifact.imageUrl,
        imageHash: artifact.imageHash,
        imageByteLength: artifact.imageByteLength,
        imageMime: artifact.imageMime,
      }
    : undefined;

const socialImageUrl = (fallbackImageUrl: string, canonicalUrl: string, artifact?: ShareArtifactEvidence) =>
  absoluteUrl(artifact?.imageUrl ?? fallbackImageUrl, canonicalUrl);

const compactObject = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));

const imageObjectFor = (imageUrl: string, artifact?: ShareArtifactEvidence) =>
  artifact
    ? compactObject({
        "@type": "ImageObject",
        name: artifact.fileName,
        url: imageUrl,
        contentUrl: imageUrl,
        encodingFormat: artifact.imageMime,
        contentSize: artifact.imageByteLength,
        sha256: artifact.imageHash,
        dateCreated: artifact.generatedAt,
      })
    : undefined;

export const buildRecordProofMeta = (
  record: MemoryRecord,
  canonicalUrl: string,
  fallbackImageUrl: string,
  artifact?: ShareArtifactEvidence,
): PublicProofMeta => {
  const { capsule, result } = record;
  const resultText = result
    ? `Actual ${result.homeScore}-${result.awayScore}, score ${result.totalScore}/100`
    : "Reveal pending";
  const title = `${capsule.matchLabel} locked prediction proof`;
  const description = `Prediction ${capsule.prediction.homeScore}-${capsule.prediction.awayScore}. ${resultText}. CID ${capsule.filecoinProof.cid}.`;
  const matchingArtifact = artifactForProofUrl("record", capsule.id, canonicalUrl, artifact);
  const imageUrl = socialImageUrl(fallbackImageUrl, canonicalUrl, matchingArtifact);
  const associatedMedia = imageObjectFor(imageUrl, matchingArtifact);
  return {
    kind: "record",
    title,
    description,
    canonicalUrl,
    imageUrl,
    imageAlt: `${capsule.matchLabel} Kickoff Lock proof card`,
    twitterCard: "summary_large_image",
    imageManifest: manifestFor(matchingArtifact),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: title,
      description,
      url: canonicalUrl,
      image: imageUrl,
      identifier: capsule.id,
      dateCreated: capsule.createdAt,
      datePublished: capsule.sealedAt ?? capsule.createdAt,
      encodingFormat: "application/json",
      sha256: capsule.payloadHash,
      about: capsule.matchLabel,
      isBasedOn: capsule.filecoinProof.cid,
      ...(associatedMedia ? { associatedMedia } : {}),
    },
  };
};

export const buildModeProofMeta = (
  run: GameModeRun,
  canonicalUrl: string,
  fallbackImageUrl: string,
  artifact?: ShareArtifactEvidence,
): PublicProofMeta => {
  const title = `${run.title} mode proof`;
  const description = `${run.summary}. ${run.capsuleIds.length} linked lock${run.capsuleIds.length === 1 ? "" : "s"}. CID ${run.filecoinProof.cid}.`;
  const matchingArtifact = artifactForProofUrl("mode", run.id, canonicalUrl, artifact);
  const imageUrl = socialImageUrl(fallbackImageUrl, canonicalUrl, matchingArtifact);
  const associatedMedia = imageObjectFor(imageUrl, matchingArtifact);
  return {
    kind: "mode",
    title,
    description,
    canonicalUrl,
    imageUrl,
    imageAlt: `${run.title} Kickoff Lock mode proof card`,
    twitterCard: "summary_large_image",
    imageManifest: manifestFor(matchingArtifact),
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: title,
      description,
      url: canonicalUrl,
      image: imageUrl,
      identifier: run.id,
      dateCreated: run.createdAt,
      encodingFormat: "application/json",
      sha256: run.payloadHash,
      about: run.modeId,
      isBasedOn: run.filecoinProof.cid,
      ...(associatedMedia ? { associatedMedia } : {}),
    },
  };
};

export const buildProfileMeta = (
  profile: PublicProfile,
  canonicalUrl: string,
  fallbackImageUrl: string,
): PublicProofMeta => {
  const title = `${profile.displayName} Kickoff Lock profile`;
  const description = `${profile.locks} locked predictions, ${profile.modeProofs} mode proofs, ${profile.xp} XP.`;
  return {
    kind: "profile",
    title,
    description,
    canonicalUrl,
    imageUrl: absoluteUrl(fallbackImageUrl, canonicalUrl),
    imageAlt: `${profile.displayName} Kickoff Lock public profile`,
    twitterCard: "summary_large_image",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      name: title,
      description,
      url: canonicalUrl,
      image: absoluteUrl(fallbackImageUrl, canonicalUrl),
      identifier: profile.id,
      about: {
        "@type": "Person",
        name: profile.displayName,
        homeLocation: profile.location,
      },
    },
  };
};

const setMeta = (doc: Document, selector: string, attr: "name" | "property", key: string, content: string) => {
  let node = doc.head.querySelector<HTMLMetaElement>(selector);
  if (!node) {
    node = doc.createElement("meta");
    node.setAttribute(attr, key);
    doc.head.append(node);
  }
  node.content = content;
};

export const applyPublicProofMeta = (meta: PublicProofMeta, doc = document) => {
  doc.title = meta.title;
  let canonical = doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = doc.createElement("link");
    canonical.rel = "canonical";
    doc.head.append(canonical);
  }
  canonical.href = meta.canonicalUrl;

  setMeta(doc, 'meta[property="og:title"]', "property", "og:title", meta.title);
  setMeta(doc, 'meta[property="og:description"]', "property", "og:description", meta.description);
  setMeta(doc, 'meta[property="og:url"]', "property", "og:url", meta.canonicalUrl);
  setMeta(doc, 'meta[property="og:image"]', "property", "og:image", meta.imageUrl);
  setMeta(doc, 'meta[property="og:image:alt"]', "property", "og:image:alt", meta.imageAlt);
  setMeta(doc, 'meta[name="twitter:card"]', "name", "twitter:card", meta.twitterCard);
  setMeta(doc, 'meta[name="twitter:title"]', "name", "twitter:title", meta.title);
  setMeta(doc, 'meta[name="twitter:description"]', "name", "twitter:description", meta.description);
  setMeta(doc, 'meta[name="twitter:image"]', "name", "twitter:image", meta.imageUrl);

  let script = doc.head.querySelector<HTMLScriptElement>('script[data-kickoff-public-proof="jsonld"]');
  if (!script) {
    script = doc.createElement("script");
    script.type = "application/ld+json";
    script.dataset.kickoffPublicProof = "jsonld";
    doc.head.append(script);
  }
  script.textContent = JSON.stringify(meta.jsonLd);
};
