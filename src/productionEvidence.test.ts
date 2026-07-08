import { describe, expect, it } from "vitest";
import {
  buildCacheBustedPublicEvidenceUrl,
  buildProductionVerifyEnv,
  diagnosePublicAcceptanceEvidence,
  evaluateCleanSessionRestoreResults,
  evaluateLeaderboardScopeRows,
  evaluatePublicAppRootReadiness,
  evaluateProductionTargetEnvContract,
  evaluatePublicRenderSnapshot,
  extractPublicRenderSnapshot,
  leaderboardRankKeyForScope,
  mergeProductionVerifyEnv,
  parseEnvText,
  productionFriendCode,
  publicEvidenceNoStoreFetchOptions,
  publicRenderCloudLoaded,
  publicRenderExpectation,
  summarizeProductionEvidence,
  type ProductionEvidencePacket,
} from "./productionEvidence";
import { ACCEPTANCE_TEST_SUITES, acceptanceManifestHash, type AcceptanceEvidencePacket } from "./acceptance";

const packet = (checks: ProductionEvidencePacket["checks"]): ProductionEvidencePacket => ({
  generatedAt: "2026-07-03T00:00:00.000Z",
  source: "local-script",
  strict: true,
  checks,
});

const snapshotDocument = (nodes: Record<string, Record<string, string> & { textContent?: string }>, text = "") => ({
  body: { innerText: text },
  querySelector: (selector: string) => {
    const node = nodes[selector];
    if (!node) return null;
    return {
      textContent: node.textContent,
      getAttribute: (name: string) => node[name] ?? null,
    };
  },
});

const cleanRender = (
  kind: "profile" | "proof" | "mode",
  patch: {
    targetId?: string;
    url?: string;
    passed?: boolean;
    cloudLoaded?: boolean;
    canonicalOk?: boolean;
    socialOk?: boolean;
    shareImageMatched?: boolean;
    structuredImageMatched?: boolean;
    detail?: string;
  } = {},
) => ({
  kind,
  targetId: patch.targetId,
  url: patch.url ?? `https://example.com/kickoff-lock-agent/?${kind}=${patch.targetId ?? kind}-1`,
  passed: patch.passed ?? true,
  cloudLoaded: patch.cloudLoaded ?? true,
  canonicalOk: patch.canonicalOk,
  socialOk: patch.socialOk,
  shareImageMatched: patch.shareImageMatched,
  structuredImageMatched: patch.structuredImageMatched,
  detail: patch.detail ?? `Cloud ${kind} loaded.`,
});

const acceptancePacket = (patch: Partial<AcceptanceEvidencePacket> = {}): AcceptanceEvidencePacket => ({
  generatedAt: "2026-07-03T00:00:00.000Z",
  source: "local-script",
  suiteManifestHash: acceptanceManifestHash(),
  suites: ACCEPTANCE_TEST_SUITES.map((suite) => ({
    suiteId: suite.id,
    command: suite.command,
    status: "passed",
    startedAt: "2026-07-03T00:00:00.000Z",
    completedAt: "2026-07-03T00:01:00.000Z",
    durationMs: 60_000,
    exitCode: 0,
    summary: `${suite.label} passed.`,
  })),
  ...patch,
});

describe("production evidence summary", () => {
  it("builds cache-busted public evidence URLs for deployed JSON artifacts", () => {
    const url = new URL(
      buildCacheBustedPublicEvidenceUrl(
        "https://olive8882-1996.github.io/kickoff-lock-agent/",
        "acceptance-evidence.json",
        "run-123",
      ),
    );

    expect(url.origin).toBe("https://olive8882-1996.github.io");
    expect(url.pathname).toBe("/kickoff-lock-agent/acceptance-evidence.json");
    expect(url.searchParams.get("_kickoff_evidence")).toBe("run-123");
  });

  it("builds cache-busted public evidence URLs for runtime config scripts", () => {
    const url = new URL(
      buildCacheBustedPublicEvidenceUrl(
        "https://olive8882-1996.github.io/kickoff-lock-agent/?old=1",
        "runtime-config.js",
        12345,
      ),
    );

    expect(url.pathname).toBe("/kickoff-lock-agent/runtime-config.js");
    expect(url.searchParams.get("_kickoff_evidence")).toBe("12345");
    expect(url.searchParams.get("old")).toBeNull();
  });

  it("uses no-store headers for public evidence fetches", () => {
    expect(publicEvidenceNoStoreFetchOptions()).toEqual({
      cache: "no-store",
      headers: {
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
    });
  });

  it("diagnoses published acceptance evidence manifest mismatches with expected and published hashes", () => {
    const diagnosis = diagnosePublicAcceptanceEvidence({
      ...acceptancePacket(),
      suiteManifestHash: "acceptance-v1-old",
    });

    expect(diagnosis).toMatchObject({
      passed: false,
      manifestHashMismatch: true,
      expectedSuiteManifestHash: acceptanceManifestHash(),
      suiteManifestHash: "acceptance-v1-old",
    });
    expect(diagnosis.detail).toContain(`expected ${acceptanceManifestHash()}`);
    expect(diagnosis.detail).toContain("published acceptance-v1-old");
    expect(diagnosis.action).toContain("deploy the updated dist/acceptance-evidence.json");
  });

  it("accepts published acceptance evidence that matches the current suite manifest", () => {
    const diagnosis = diagnosePublicAcceptanceEvidence(acceptancePacket());

    expect(diagnosis).toMatchObject({
      passed: true,
      manifestHashMismatch: false,
      suiteManifestHash: acceptanceManifestHash(),
    });
    expect(diagnosis.detail).toContain("9/9 suites");
  });

  it("diagnoses HTTP failures for published acceptance evidence", () => {
    const diagnosis = diagnosePublicAcceptanceEvidence(undefined, false, 404);

    expect(diagnosis).toMatchObject({
      passed: false,
      detail: "HTTP 404",
      action: "Deploy acceptance-evidence.json with the latest dist build.",
    });
  });

  it("passes public app root readiness when the direct root fetch succeeds", () => {
    expect(evaluatePublicAppRootReadiness({ responseOk: true, status: 200, textOk: true })).toEqual({
      passed: true,
      detail: "HTTP 200",
    });
  });

  it("uses published deployment evidence only when direct public root fetch throws", () => {
    const readiness = evaluatePublicAppRootReadiness({
      error: "TypeError: unknown certificate verification error",
      deploymentEvidencePassed: true,
      deploymentEvidenceDetail: "index.html and hashed assets are published",
    });

    expect(readiness.passed).toBe(true);
    expect(readiness.detail).toContain("published deployment evidence confirms");
    expect(readiness.detail).toContain("direct root fetch failed");
    expect(readiness.detail).toContain("index.html and hashed assets are published");
  });

  it("does not let deployment evidence hide public app root HTTP or content failures", () => {
    expect(
      evaluatePublicAppRootReadiness({
        responseOk: false,
        status: 500,
        deploymentEvidencePassed: true,
      }),
    ).toEqual({ passed: false, detail: "HTTP 500" });

    expect(
      evaluatePublicAppRootReadiness({
        responseOk: true,
        status: 200,
        textOk: false,
        deploymentEvidencePassed: true,
      }),
    ).toEqual({ passed: false, detail: "HTTP 200, expected text missing" });
  });

  it("parses dotenv-style verification variables", () => {
    expect(
      parseEnvText(`
        # production verification
        export VITE_PUBLIC_APP_URL="https://example.com/kickoff-lock-agent/"
        KICKOFF_VERIFY_USER_ID=user-1
        KICKOFF_VERIFY_SHARE_IMAGE_URL=https://example.com/card.png # public image
        bad-key=value
      `),
    ).toEqual({
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      KICKOFF_VERIFY_USER_ID: "user-1",
      KICKOFF_VERIFY_SHARE_IMAGE_URL: "https://example.com/card.png",
    });
  });

  it("builds copyable production verification target env", () => {
    const env = buildProductionVerifyEnv({
      userId: "user-1",
      profileId: "user-1",
      publicProfileUrl: "https://example.com/?profile=user-1",
      proofId: "cap-1",
      modeId: "mode-1",
      modeIds: ["mode-1", "mode-2"],
      shareArtifactIds: ["record:cap-1", "mode:mode-1"],
      filecoinRecordCid: "bafy-record",
      filecoinRecordPayloadHash: "a".repeat(64),
      filecoinModeCid: "bafy-mode",
      filecoinModePayloadHash: "b".repeat(64),
      friendCode: productionFriendCode("Chengdu, Sichuan", "fan@example.com"),
      shareImageUrl: "https://example.com/cards/cap-1.png",
      modeShareImageUrl: "https://example.com/cards/mode-1.png",
    });

    expect(env).toContain("KICKOFF_VERIFY_USER_ID=user-1");
    expect(parseEnvText(env).KICKOFF_VERIFY_PUBLIC_PROFILE_URL).toBe("https://example.com/?profile=user-1");
    expect(parseEnvText(env).KICKOFF_VERIFY_SHARE_ARTIFACT_IDS).toBe("record:cap-1,mode:mode-1");
    expect(env).toContain("KICKOFF_VERIFY_FRIEND_CODE=chengdu-sichuan");
    expect(env).toContain("KICKOFF_VERIFY_FILECOIN_RECORD_CID=bafy-record");
    expect(parseEnvText(env).KICKOFF_VERIFY_MODE_IDS).toBe("mode-1,mode-2");
    expect(env).toContain(`KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH=${"b".repeat(64)}`);
    expect(env).toContain("KICKOFF_VERIFY_SEASON_KEY=world-cup-run");
    expect(parseEnvText(env).KICKOFF_VERIFY_LEADERBOARD_SCOPES).toBe("global,friend,season");
    expect(env).toContain("KICKOFF_VERIFY_FIXTURE_ID=");
    expect(env).toContain("KICKOFF_VERIFY_FIXTURE_IDS=");
    expect(parseEnvText(env).KICKOFF_VERIFY_SHARE_IMAGE_URL).toBe("https://example.com/cards/cap-1.png");
    expect(parseEnvText(env).KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL).toBe("https://example.com/cards/mode-1.png");
  });

  it("merges production verification env blocks without letting empty values erase real targets", () => {
    const merged = mergeProductionVerifyEnv([
      buildProductionVerifyEnv({
        userId: "user-1",
        profileId: "user-1",
        publicProfileUrl: "https://example.com/?profile=user-1",
        proofId: "cap-1",
        modeId: "mode-1",
        modeIds: ["mode-1", "mode-2"],
        shareArtifactIds: ["record:cap-1", "mode:mode-1"],
        shareImageUrl: "https://example.com/card.png",
        modeShareImageUrl: "https://example.com/mode-card.png",
      }),
      buildProductionVerifyEnv({
        filecoinRecordPayloadHash: "a".repeat(64),
        filecoinModePayloadHash: "b".repeat(64),
        fixtureId: "fixture-200",
        fixtureIds: ["fixture-200", "fixture-300"],
      }),
      `
      KICKOFF_VERIFY_FILECOIN_RECORD_CID=bafy-record
      KICKOFF_VERIFY_FILECOIN_MODE_CID=bafy-mode
      KICKOFF_VERIFY_PROOF_ID=
      `,
    ]);

    expect(merged.values.KICKOFF_VERIFY_USER_ID).toBe("user-1");
    expect(merged.values.KICKOFF_VERIFY_PROOF_ID).toBe("cap-1");
    expect(merged.values.KICKOFF_VERIFY_MODE_IDS).toBe("mode-1,mode-2");
    expect(merged.values.KICKOFF_VERIFY_FIXTURE_ID).toBe("fixture-200");
    expect(merged.values.KICKOFF_VERIFY_FIXTURE_IDS).toBe("fixture-200,fixture-300");
    expect(merged.values.KICKOFF_VERIFY_FILECOIN_RECORD_CID).toBe("bafy-record");
    expect(merged.values.KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH).toBe("a".repeat(64));
    expect(merged.values.KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL).toBe("https://example.com/mode-card.png");
    expect(merged.values.KICKOFF_VERIFY_ALLOW_FAILURES).toBe("1");
    expect(merged.missingKeys).not.toContain("KICKOFF_VERIFY_SEASON_KEY");
    expect(merged.text).toContain("KICKOFF_VERIFY_FILECOIN_MODE_CID=bafy-mode");
  });

  it("derives public profile URL from the deployed app URL when merge artifacts only provide profile id", () => {
    const merged = mergeProductionVerifyEnv(
      [
        `
        KICKOFF_VERIFY_PROFILE_ID=user-1
        KICKOFF_VERIFY_PUBLIC_PROFILE_URL=
        `,
      ],
      {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/?old=1#hash",
      },
    );

    expect(merged.values.KICKOFF_VERIFY_PUBLIC_PROFILE_URL).toBe("https://example.com/kickoff-lock-agent/?profile=user-1");
  });

  it("does not overwrite an explicit public profile URL while merging production verify env", () => {
    const merged = mergeProductionVerifyEnv(
      [
        `
        KICKOFF_VERIFY_PROFILE_ID=user-1
        KICKOFF_VERIFY_PUBLIC_PROFILE_URL=https://proof.example.com/?profile=user-1
        `,
      ],
      {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      },
    );

    expect(merged.values.KICKOFF_VERIFY_PUBLIC_PROFILE_URL).toBe("https://proof.example.com/?profile=user-1");
  });

  it("verifies that production target env binds profile URL, share artifacts and leaderboard scopes", () => {
    const contract = evaluateProductionTargetEnvContract({
      KICKOFF_VERIFY_PROFILE_ID: "user-1",
      KICKOFF_VERIFY_PUBLIC_PROFILE_URL: "https://example.com/kickoff-lock-agent/?profile=user-1",
      KICKOFF_VERIFY_PROOF_ID: "cap-1",
      KICKOFF_VERIFY_MODE_IDS: "mode-bracket,mode-parlay",
      KICKOFF_VERIFY_SHARE_ARTIFACT_IDS: "record:cap-1,mode:mode-bracket,mode:mode-parlay",
      KICKOFF_VERIFY_LEADERBOARD_SCOPES: "global,friend,season",
    });

    expect(contract.passed).toBe(true);
    expect(contract.detail).toContain("profile user-1");
    expect(contract.sampleIds).toEqual(
      expect.arrayContaining(["user-1", "cap-1", "mode-bracket", "record:cap-1"]),
    );
  });

  it("rejects production target env that cannot reproduce account, sharing and leaderboard checks", () => {
    const contract = evaluateProductionTargetEnvContract({
      KICKOFF_VERIFY_PROFILE_ID: "user-1",
      KICKOFF_VERIFY_PUBLIC_PROFILE_URL: "http://localhost:5173/?profile=other-user",
      KICKOFF_VERIFY_PROOF_ID: "cap-1",
      KICKOFF_VERIFY_MODE_IDS: "mode-bracket,mode-parlay",
      KICKOFF_VERIFY_SHARE_ARTIFACT_IDS: "record:other,mode:mode-bracket,bad-id",
      KICKOFF_VERIFY_LEADERBOARD_SCOPES: "global,friend",
    });

    expect(contract.passed).toBe(false);
    expect(contract.problems).toEqual(
      expect.arrayContaining([
        "KICKOFF_VERIFY_PUBLIC_PROFILE_URL must be HTTPS",
        "KICKOFF_VERIFY_PUBLIC_PROFILE_URL does not point at KICKOFF_VERIFY_PROFILE_ID",
        "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS missing record:cap-1",
        "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS missing mode:mode-parlay",
        "KICKOFF_VERIFY_SHARE_ARTIFACT_IDS invalid bad-id",
        "KICKOFF_VERIFY_LEADERBOARD_SCOPES missing season",
      ]),
    );
  });

  it("requires every required external check to pass", () => {
    const summary = summarizeProductionEvidence(
      packet([
        {
          id: "public-app-root",
          category: "public-app",
          label: "Public app root",
          required: true,
          status: "passed",
          detail: "HTTP 200",
          checkedAt: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "supabase-backend-health",
          category: "supabase",
          label: "Backend schema health",
          required: true,
          status: "failed",
          detail: "not ready",
          checkedAt: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "football-data-backup",
          category: "runtime",
          label: "Backup feed",
          required: false,
          status: "warning",
          detail: "optional token missing",
          checkedAt: "2026-07-03T00:00:00.000Z",
        },
      ]),
    );

    expect(summary.complete).toBe(false);
    expect(summary.requiredPassed).toBe(1);
    expect(summary.requiredTotal).toBe(2);
    expect(summary.optionalTotal).toBe(1);
    expect(summary.failedRequired.map((check) => check.id)).toEqual(["supabase-backend-health"]);
  });

  it("marks the packet complete when all required checks pass", () => {
    const summary = summarizeProductionEvidence(
      packet([
        {
          id: "public-app-root",
          category: "public-app",
          label: "Public app root",
          required: true,
          status: "passed",
          detail: "HTTP 200",
          checkedAt: "2026-07-03T00:00:00.000Z",
        },
      ]),
    );

    expect(summary.loaded).toBe(true);
    expect(summary.complete).toBe(true);
    expect(summary.openRequired).toEqual([]);
  });

  it("defines strict public render expectations for production proof surfaces", () => {
    expect(publicRenderExpectation("profile", "user-1")).toMatchObject({
      queryKey: "profile",
      requiredText: expect.arrayContaining(["Latest proof capsules", "Tournament mode runs", "Verifier packet"]),
      forbiddenText: expect.arrayContaining(["Profile unavailable", "needs share card"]),
    });
    expect(publicRenderExpectation("proof", "cap-1")).toMatchObject({
      queryKey: "proof",
      requiredText: expect.arrayContaining(["Proof verification", "Proof timeline", "Verifier packet", "cap-1"]),
      forbiddenText: expect.arrayContaining(["No share manifest yet"]),
    });
    expect(publicRenderExpectation("mode", "mode-1")).toMatchObject({
      queryKey: "mode",
      requiredText: expect.arrayContaining(["Mode proof verification", "Proof timeline", "Verifier packet", "mode-1"]),
      forbiddenText: expect.arrayContaining(["Cloud mode proof loaded. No share manifest"]),
    });
  });

  it("evaluates public render snapshots without failing on visual uppercase text", () => {
    const result = evaluatePublicRenderSnapshot(
      "proof",
      "cap-1",
      {
        text: "PROOF VERIFICATION\nPROOF FACTS\nPROOF TIMELINE\nVERIFIER PACKET\nSOCIAL METADATA\nPREDICTION\nCAP-1",
        canonical: "https://example.com/kickoff-lock-agent/?proof=cap-1",
        ogTitle: "CAP-1 LOCKED PREDICTION PROOF",
        jsonLd: "{}",
      },
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
    );

    expect(result).toMatchObject({
      passed: true,
      missing: [],
      forbidden: [],
      canonicalOk: true,
    });
  });

  it("can require social metadata and cloud-loaded public content from the shared renderer evaluator", () => {
    const result = evaluatePublicRenderSnapshot(
      "mode",
      "mode-1",
      {
        text: "CLOUD MODE PROOF AND SHARE MANIFEST LOADED.\nMODE PROOF VERIFICATION\nMODE PROOF FACTS\nPROOF TIMELINE\nVERIFIER PACKET\nSOCIAL METADATA\nMODE-1",
        canonical: "https://example.com/kickoff-lock-agent/?mode=mode-1",
        ogTitle: "Mode proof",
        ogImage: "https://cdn.example.com/mode.png",
        twitterCard: "summary_large_image",
        jsonLd: JSON.stringify({
          identifier: "mode-1",
          associatedMedia: {
            "@type": "ImageObject",
            contentUrl: "https://cdn.example.com/mode.png",
            encodingFormat: "image/png",
            contentSize: 220000,
            sha256: "a".repeat(64),
          },
        }),
      },
      "https://example.com/kickoff-lock-agent/?mode=mode-1",
      { requireSocial: true, requireCloudLoaded: true },
    );

    expect(result).toMatchObject({
      passed: true,
      socialOk: true,
      cloudLoaded: true,
    });
    expect(publicRenderCloudLoaded("mode", { text: "Cloud mode proof and share manifest loaded." })).toBe(true);
    expect(publicRenderCloudLoaded("mode", { text: "fixture text can change", publicKind: "mode", publicSource: "cloud" })).toBe(true);
    expect(publicRenderCloudLoaded("mode", { text: "Cloud mode proof and share manifest loaded.", publicKind: "mode", publicSource: "fixture" })).toBe(false);
  });

  it("fails shared public render evaluation when social metadata or cloud evidence is missing", () => {
    const result = evaluatePublicRenderSnapshot(
      "proof",
      "cap-1",
      {
        text: "PROOF VERIFICATION\nPROOF FACTS\nPROOF TIMELINE\nVERIFIER PACKET\nSOCIAL METADATA\nPREDICTION\nCAP-1",
        canonical: "https://example.com/kickoff-lock-agent/?proof=cap-1",
        ogTitle: "Proof",
        jsonLd: "{}",
      },
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      { requireSocial: true, requireCloudLoaded: true },
    );

    expect(result.passed).toBe(false);
    expect(result.detail).toContain("social metadata incomplete");
    expect(result.detail).toContain("cloud content not loaded");
  });

  it("does not accept default logo fallback or JSON-LD without the target id as production social metadata", () => {
    const logoFallback = evaluatePublicRenderSnapshot(
      "proof",
      "cap-1",
      {
        text: "CLOUD PROOF AND SHARE MANIFEST LOADED.\nPROOF VERIFICATION\nPROOF FACTS\nPROOF TIMELINE\nVERIFIER PACKET\nSOCIAL METADATA\nPREDICTION\nCAP-1",
        canonical: "https://example.com/kickoff-lock-agent/?proof=cap-1",
        ogTitle: "Proof",
        ogImage: "https://example.com/kickoff-lock-agent/assets/kickoff-lock-icon.png",
        twitterCard: "summary_large_image",
        jsonLd: JSON.stringify({ identifier: "cap-1" }),
      },
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      { requireSocial: true, requireCloudLoaded: true },
    );
    const missingJsonTarget = evaluatePublicRenderSnapshot(
      "mode",
      "mode-1",
      {
        text: "CLOUD MODE PROOF AND SHARE MANIFEST LOADED.\nMODE PROOF VERIFICATION\nMODE PROOF FACTS\nPROOF TIMELINE\nVERIFIER PACKET\nSOCIAL METADATA\nMODE-1",
        canonical: "https://example.com/kickoff-lock-agent/?mode=mode-1",
        ogTitle: "Mode proof",
        ogImage: "https://cdn.example.com/mode-1.png",
        twitterCard: "summary_large_image",
        jsonLd: JSON.stringify({ identifier: "another-mode" }),
      },
      "https://example.com/kickoff-lock-agent/?mode=mode-1",
      { requireSocial: true, requireCloudLoaded: true },
    );

    expect(logoFallback.passed).toBe(false);
    expect(logoFallback.detail).toContain("social metadata incomplete");
    expect(missingJsonTarget.passed).toBe(false);
    expect(missingJsonTarget.detail).toContain("social metadata incomplete");
  });

  it("extracts public render snapshot metadata and cloud target markers from the DOM", () => {
    const snapshot = extractPublicRenderSnapshot(
      snapshotDocument(
        {
          'link[rel="canonical"]': { href: "https://example.com/kickoff-lock-agent/?proof=cap-1" },
          'meta[property="og:title"]': { content: "Kickoff proof cap-1" },
          'meta[property="og:image"]': { content: "https://cdn.example.com/cap-1.png" },
          'meta[name="twitter:card"]': { content: "summary_large_image" },
          'script[data-kickoff-public-proof="jsonld"]': { textContent: JSON.stringify({ identifier: "cap-1" }) },
          "[data-kickoff-public-kind]": {
            "data-kickoff-public-kind": "proof",
            "data-kickoff-public-target": "cap-1",
            "data-kickoff-public-source": "cloud",
          },
        },
        "Cloud proof and share manifest loaded. Proof verification cap-1",
      ),
    );

    expect(snapshot).toEqual({
      text: "Cloud proof and share manifest loaded. Proof verification cap-1",
      canonical: "https://example.com/kickoff-lock-agent/?proof=cap-1",
      ogTitle: "Kickoff proof cap-1",
      ogImage: "https://cdn.example.com/cap-1.png",
      twitterCard: "summary_large_image",
      jsonLd: JSON.stringify({ identifier: "cap-1" }),
      publicKind: "proof",
      publicTarget: "cap-1",
      publicSource: "cloud",
    });
  });

  it("does not accept a public render whose DOM target marker points at another artifact", () => {
    const result = evaluatePublicRenderSnapshot(
      "proof",
      "cap-1",
      {
        text: "CLOUD PROOF AND SHARE MANIFEST LOADED.\nPROOF VERIFICATION\nPROOF FACTS\nPROOF TIMELINE\nVERIFIER PACKET\nSOCIAL METADATA\nPREDICTION\nCAP-1",
        canonical: "https://example.com/kickoff-lock-agent/?proof=cap-1",
        ogTitle: "Proof",
        ogImage: "https://cdn.example.com/cap-1.png",
        twitterCard: "summary_large_image",
        jsonLd: JSON.stringify({
          identifier: "cap-1",
          associatedMedia: {
            "@type": "ImageObject",
            contentUrl: "https://cdn.example.com/cap-1.png",
            encodingFormat: "image/png",
            contentSize: 220000,
            sha256: "a".repeat(64),
          },
        }),
        publicKind: "proof",
        publicTarget: "cap-other",
        publicSource: "cloud",
      },
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      { requireSocial: true, requireCloudLoaded: true },
    );

    expect(result.passed).toBe(false);
    expect(result.publicTargetOk).toBe(false);
    expect(result.detail).toContain("public target cap-other mismatch");
  });

  it("does not accept proof social metadata without matching JSON-LD share image evidence", () => {
    const missingImageObject = evaluatePublicRenderSnapshot(
      "proof",
      "cap-1",
      {
        text: "CLOUD PROOF AND SHARE MANIFEST LOADED.\nPROOF VERIFICATION\nPROOF FACTS\nPROOF TIMELINE\nVERIFIER PACKET\nSOCIAL METADATA\nPREDICTION\nCAP-1",
        canonical: "https://example.com/kickoff-lock-agent/?proof=cap-1",
        ogTitle: "Proof",
        ogImage: "https://cdn.example.com/cap-1.png",
        twitterCard: "summary_large_image",
        jsonLd: JSON.stringify({ identifier: "cap-1", image: "https://cdn.example.com/cap-1.png" }),
      },
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      { requireSocial: true, requireCloudLoaded: true },
    );
    const staleImageObject = evaluatePublicRenderSnapshot(
      "proof",
      "cap-1",
      {
        text: "CLOUD PROOF AND SHARE MANIFEST LOADED.\nPROOF VERIFICATION\nPROOF FACTS\nPROOF TIMELINE\nVERIFIER PACKET\nSOCIAL METADATA\nPREDICTION\nCAP-1",
        canonical: "https://example.com/kickoff-lock-agent/?proof=cap-1",
        ogTitle: "Proof",
        ogImage: "https://cdn.example.com/cap-1.png",
        twitterCard: "summary_large_image",
        jsonLd: JSON.stringify({
          identifier: "cap-1",
          associatedMedia: {
            "@type": "ImageObject",
            contentUrl: "https://cdn.example.com/another-proof.png",
            encodingFormat: "image/png",
            contentSize: 220000,
            sha256: "a".repeat(64),
          },
        }),
      },
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      { requireSocial: true, requireCloudLoaded: true },
    );

    expect(missingImageObject.passed).toBe(false);
    expect(missingImageObject.detail).toContain("social metadata incomplete");
    expect(staleImageObject.passed).toBe(false);
    expect(staleImageObject.detail).toContain("social metadata incomplete");
  });

  it("requires cloud-loaded public pages for clean-session account restore", () => {
    const result = evaluateCleanSessionRestoreResults([
      cleanRender("profile", { detail: "rendered profile proof page for user-1" }),
      cleanRender("proof", { cloudLoaded: false, detail: "rendered proof proof page for cap-1" }),
      cleanRender("mode", { detail: "rendered mode proof page for mode-1" }),
    ]);

    expect(result.passed).toBe(false);
    expect(result.missingKinds).toEqual(["proof"]);
    expect(result.detail).toContain("fixture fallback or local-only page rendered");
  });

  it("passes clean-session restore only when profile, proof and mode all load from cloud", () => {
    const result = evaluateCleanSessionRestoreResults([
      cleanRender("profile", { detail: "Cloud profile loaded." }),
      cleanRender("proof", { detail: "Cloud proof and share manifest loaded." }),
      cleanRender("mode", { detail: "Cloud mode proof and share manifest loaded." }),
    ]);

    expect(result).toMatchObject({
      passed: true,
      missingKinds: [],
    });
  });

  it("requires every expected clean-session target to render from cloud", () => {
    const result = evaluateCleanSessionRestoreResults(
      [
        cleanRender("profile", { targetId: "user-1", detail: "Cloud profile loaded." }),
        cleanRender("proof", { targetId: "cap-1", detail: "Cloud proof and share manifest loaded." }),
        cleanRender("mode", { targetId: "mode-1", detail: "Cloud mode proof and share manifest loaded." }),
        cleanRender("mode", { targetId: "mode-2", detail: "Cloud mode proof and share manifest loaded." }),
      ],
      {
        profile: ["user-1"],
        proof: ["cap-1"],
        mode: ["mode-1", "mode-2", "mode-3", "mode-4", "mode-5", "mode-6"],
      },
    );

    expect(result.passed).toBe(false);
    expect(result.missingKinds).toEqual(["mode"]);
    expect(result.missingTargets).toEqual([
      { kind: "mode", targetId: "mode-3", detail: "not rendered" },
      { kind: "mode", targetId: "mode-4", detail: "not rendered" },
      { kind: "mode", targetId: "mode-5", detail: "not rendered" },
      { kind: "mode", targetId: "mode-6", detail: "not rendered" },
    ]);
    expect(result.detail).toContain("mode:mode-3 (not rendered)");
  });

  it("does not reuse clean-session renders from a different target id", () => {
    const result = evaluateCleanSessionRestoreResults(
      [
        cleanRender("profile", { targetId: "user-1", detail: "Cloud profile loaded." }),
        cleanRender("proof", { targetId: "cap-old", detail: "Cloud proof and share manifest loaded." }),
        cleanRender("mode", {
          targetId: "mode-1",
          cloudLoaded: false,
          detail: "rendered mode preview from fixture fallback",
        }),
      ],
      {
        profile: ["user-1"],
        proof: ["cap-1"],
        mode: ["mode-1"],
      },
    );

    expect(result.passed).toBe(false);
    expect(result.missingKinds).toEqual(["proof", "mode"]);
    expect(result.missingTargets).toEqual([
      { kind: "proof", targetId: "cap-1", detail: "not rendered" },
      { kind: "mode", targetId: "mode-1", detail: "fixture fallback or local-only page rendered" },
    ]);
  });

  it("fails clean-session restore when any rendered mode page falls back to local or fixture content", () => {
    const result = evaluateCleanSessionRestoreResults([
      cleanRender("profile", { detail: "Cloud profile loaded." }),
      cleanRender("proof", { detail: "Cloud proof and share manifest loaded." }),
      cleanRender("mode", { detail: "Cloud mode proof and share manifest loaded." }),
      cleanRender("mode", { cloudLoaded: false, detail: "rendered mode preview from fixture fallback" }),
    ]);

    expect(result.passed).toBe(false);
    expect(result.missingKinds).toEqual(["mode"]);
    expect(result.detail).toContain("mode (fixture fallback or local-only page rendered)");
  });

  it("does not pass clean-session restore with localhost public URLs", () => {
    const result = evaluateCleanSessionRestoreResults([
      cleanRender("profile", { url: "http://127.0.0.1:4173/kickoff-lock-agent/?profile=user-1" }),
      cleanRender("proof", { url: "https://localhost:4173/kickoff-lock-agent/?proof=cap-1" }),
      cleanRender("mode", { url: "https://preview.localhost/kickoff-lock-agent/?mode=mode-1" }),
    ]);

    expect(result.passed).toBe(false);
    expect(result.missingKinds).toEqual(["profile", "proof", "mode"]);
    expect(result.detail).toContain("profile (non-production public URL)");
    expect(result.detail).toContain("proof (non-production public URL)");
    expect(result.detail).toContain("mode (non-production public URL)");
  });

  it("requires clean-session renders to keep public sharing metadata valid", () => {
    const result = evaluateCleanSessionRestoreResults(
      [
        cleanRender("profile", { targetId: "user-1", detail: "Cloud profile loaded." }),
        cleanRender("proof", {
          targetId: "cap-1",
          socialOk: false,
          detail: "Cloud proof and share manifest loaded, but social metadata is stale.",
        }),
        cleanRender("mode", {
          targetId: "mode-1",
          shareImageMatched: false,
          detail: "Cloud mode proof and share manifest loaded, but og:image is stale.",
        }),
      ],
      {
        profile: ["user-1"],
        proof: ["cap-1"],
        mode: ["mode-1"],
      },
    );

    expect(result.passed).toBe(false);
    expect(result.missingKinds).toEqual(["proof", "mode"]);
    expect(result.missingTargets).toEqual([
      { kind: "proof", targetId: "cap-1", detail: "social metadata incomplete" },
      { kind: "mode", targetId: "mode-1", detail: "share image mismatch" },
    ]);
  });

  it("does not treat mixed cloud marker plus fixture fallback text as clean-session cloud content", () => {
    const evaluation = evaluatePublicRenderSnapshot(
      "proof",
      "cap-1",
      {
        text: "Cloud proof and share manifest loaded. Fixture fallback preview rendered. Proof verification Proof facts Proof timeline Verifier packet Social metadata Prediction cap-1",
        canonical: "https://example.com/kickoff-lock-agent/?proof=cap-1",
        ogTitle: "Proof",
        ogImage: "https://cdn.example.com/cap-1.png",
        twitterCard: "summary_large_image",
        jsonLd: JSON.stringify({ identifier: "cap-1" }),
      },
      "https://example.com/kickoff-lock-agent/?proof=cap-1",
      { requireSocial: true, requireCloudLoaded: true },
    );

    expect(publicRenderCloudLoaded("proof", { text: "Cloud proof and share manifest loaded. Local-only page rendered." })).toBe(false);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.detail).toContain("cloud content not loaded");
  });

  it("requires scoped leaderboard ranks for production leaderboard evidence", () => {
    expect(leaderboardRankKeyForScope("global")).toBe("global_rank");
    expect(leaderboardRankKeyForScope("friend")).toBe("friend_rank");
    expect(leaderboardRankKeyForScope("season")).toBe("season_rank");

    const friend = evaluateLeaderboardScopeRows(
      [
        {
          id: "user-1",
          friend_code: "chengdu",
          season_key: "world-cup-run",
          global_rank: 20,
          friend_rank: 2,
          season_rank: 5,
        },
      ],
      { userId: "user-1", scope: "friend", scopeTarget: { key: "friend_code", value: "chengdu" } },
    );

    expect(friend).toMatchObject({
      passed: true,
      rankKey: "friend_rank",
      rankValue: 2,
      sampleIds: ["user-1"],
    });
    expect(friend.detail).toContain("friend_rank #2");
  });

  it("rejects leaderboard rows that match the current user but omit the scoped rank", () => {
    const season = evaluateLeaderboardScopeRows(
      [
        {
          id: "user-1",
          friend_code: "chengdu",
          season_key: "world-cup-run",
          global_rank: 20,
          friend_rank: 2,
          rank: 20,
        },
      ],
      { userId: "user-1", scope: "season", scopeTarget: { key: "season_key", value: "world-cup-run" } },
    );

    expect(season.passed).toBe(false);
    expect(season.detail).toContain("season_rank missing");
  });
});
