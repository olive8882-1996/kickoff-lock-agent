import { describe, expect, it } from "vitest";
import {
  buildOpenedShareChannelArtifacts,
  buildShareChannelEvidencePacket,
  buildShareChannelQueue,
  buildShareIntentAuditPacket,
  buildSharePublishQueue,
  hasShareChannelEvidence,
  isProductionShareCardEvidence,
} from "./sharePublishing";
import type { GameModeRun, MemoryRecord, ShareArtifactEvidence } from "./types";

const record = (id: string): MemoryRecord => ({
  capsule: {
    id,
    matchId: `match-${id}`,
    matchLabel: `${id} home vs ${id} away`,
    kickoffAt: "2026-07-01T20:00:00.000Z",
    createdAt: "2026-07-01T10:00:00.000Z",
    sealedAt: "2026-07-01T10:10:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "real",
      cid: `bafy-${id}`,
      pieceCid: `piece-${id}`,
      provider: "synapse",
      dataSetId: "set",
      proofStatus: "verified",
    },
    prediction: {
      homeScore: 2,
      awayScore: 1,
      winner: `${id} home`,
      keyPlayers: [],
      confidence: 66,
      style: "analysis",
      reasoning: "Reasoning",
      agentSummary: "Summary",
      markets: [],
    },
  },
});

const modeRun = (id: string): GameModeRun => ({
  id,
  modeId: "parlay",
  title: `Mode ${id}`,
  createdAt: "2026-07-01T12:00:00.000Z",
  capsuleIds: ["cap-a", "cap-b", "cap-c"],
  payloadHash: "b".repeat(64),
  filecoinProof: {
    mode: "real",
    cid: `bafy-${id}`,
    pieceCid: `piece-${id}`,
    provider: "synapse",
    dataSetId: "set",
    proofStatus: "verified",
  },
  status: "sealed",
  summary: "sealed",
  requirements: [],
});

const artifact = (
  id: string,
  kind: ShareArtifactEvidence["kind"],
  patch: Partial<ShareArtifactEvidence> = {},
): ShareArtifactEvidence => ({
  id,
  kind,
  proofUrl: `https://example.com/kickoff-lock-agent/?${kind === "record" ? "proof" : "mode"}=${id}`,
  imageGenerated: true,
  generatedAt: "2026-07-01T12:05:00.000Z",
  fileName: `${id}.png`,
  imageMime: "image/png",
  imageByteLength: 64_000,
  imageHash: "c".repeat(64),
  ...patch,
});

const supabaseImage = (id: string) =>
  `https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/${id}.png`;

const xIntent = (id: string, kind: ShareArtifactEvidence["kind"] = "record") => {
  const proofUrl = `https://example.com/kickoff-lock-agent/?${kind === "record" ? "proof" : "mode"}=${id}`;
  const url = new URL("https://twitter.com/intent/tweet");
  url.searchParams.set("text", `Kickoff Lock Agent proof ${id}\nVerify: ${proofUrl}`);
  url.searchParams.set("url", proofUrl);
  url.searchParams.set("hashtags", "KickoffLock,Filecoin,WorldCup");
  return url.toString();
};

describe("share publish queue", () => {
  it("requires a stored X intent URL plus an opened timestamp for channel evidence", () => {
    expect(
      hasShareChannelEvidence(
        artifact("cap-time-only", "record", {
          imageUrl: supabaseImage("cap-time-only"),
          xIntentOpenedAt: "2026-07-01T12:06:00.000Z",
        }),
      ),
    ).toBe(false);
    expect(
      hasShareChannelEvidence(
        artifact("cap-x-opened", "record", {
          imageUrl: supabaseImage("cap-x-opened"),
          xIntentUrl: xIntent("cap-x-opened"),
          xIntentOpenedAt: "2026-07-01T12:06:00.000Z",
        }),
      ),
    ).toBe(true);
    expect(
      hasShareChannelEvidence(
        artifact("cap-native-opened", "record", {
          imageUrl: supabaseImage("cap-native-opened"),
          xIntentUrl: xIntent("cap-native-opened"),
          nativeShareOpenedAt: "2026-07-01T12:06:00.000Z",
        }),
      ),
    ).toBe(true);
  });

  it("rejects future share-channel timestamps instead of counting them as opened evidence", () => {
    const futureArtifact = artifact("cap-future", "record", {
      imageUrl: supabaseImage("cap-future"),
      xIntentUrl: xIntent("cap-future"),
      xIntentOpenedAt: "2099-07-01T12:06:00.000Z",
    });

    expect(hasShareChannelEvidence(futureArtifact)).toBe(false);

    const audit = buildShareIntentAuditPacket(futureArtifact, futureArtifact.xIntentUrl, "Future timestamp proof");

    expect(audit.ready).toBe(false);
    expect(audit.channelReady).toBe(false);
    expect(audit.checks.find((check) => check.key === "share-opened")).toMatchObject({
      status: "failed",
      detail: "opened timestamp is in the future",
    });
  });

  it("treats any public HTTPS bitmap card as production share-card evidence", () => {
    expect(
      isProductionShareCardEvidence(
        artifact("cap-supabase", "record", {
          imageUrl: supabaseImage("cap-supabase"),
        }),
      ),
    ).toBe(true);
    expect(
      isProductionShareCardEvidence(
        artifact("cap-generic", "record", {
          imageUrl: "https://example.com/cards/cap-generic.png",
        }),
      ),
    ).toBe(true);
  });

  it("queues missing and local-only share card manifests for production publishing", () => {
    const queue = buildSharePublishQueue(
      [record("cap-ready"), record("cap-local"), record("cap-missing")],
      [modeRun("mode-local")],
      [
        artifact("cap-ready", "record", { imageUrl: supabaseImage("cap-ready") }),
        artifact("cap-local", "record", { proofUrl: "http://localhost:5173/?proof=cap-local" }),
        artifact("mode-local", "mode", { imageUrl: supabaseImage("mode-local"), proofUrl: "/?mode=mode-local" }),
      ],
    );

    expect(queue.totalArtifacts).toBe(4);
    expect(queue.productionReady).toBe(1);
    expect(queue.publishable).toBe(3);
    expect(queue.missingProduction).toBe(3);
    expect(queue.items.map((item) => `${item.kind}:${item.id}`)).toEqual([
      "record:cap-local",
      "record:cap-missing",
      "mode:mode-local",
    ]);
    expect(queue.items.find((item) => item.id === "cap-local")?.hasManifest).toBe(true);
    expect(queue.items.find((item) => item.id === "cap-missing")?.hasManifest).toBe(false);
    expect(queue.nextAction).toContain("Publish 3 missing proof cards");
  });

  it("returns an empty queue once every card has deployed HTTPS proof and image URLs", () => {
    const queue = buildSharePublishQueue(
      [record("cap-ready")],
      [modeRun("mode-ready")],
      [
        artifact("cap-ready", "record", { imageUrl: supabaseImage("cap-ready") }),
        artifact("mode-ready", "mode", { imageUrl: supabaseImage("mode-ready") }),
      ],
    );

    expect(queue.productionReady).toBe(2);
    expect(queue.missingProduction).toBe(0);
    expect(queue.items).toEqual([]);
    expect(queue.nextAction).toBe("All proof cards have production share evidence.");
  });

  it("builds a share-channel queue only for production HTTPS cards without opened channels", () => {
    const queue = buildShareChannelQueue(
      [record("cap-ready"), record("cap-opened"), record("cap-local")],
      [modeRun("mode-ready")],
      [
        artifact("cap-ready", "record", {
          imageUrl: supabaseImage("cap-ready"),
          xIntentUrl: xIntent("cap-ready"),
        }),
        artifact("cap-opened", "record", {
          imageUrl: supabaseImage("cap-opened"),
          xIntentUrl: xIntent("cap-opened"),
          xIntentOpenedAt: "2026-07-01T12:06:00.000Z",
        }),
        artifact("cap-local", "record", { proofUrl: "http://localhost:5173/?proof=cap-local" }),
        artifact("mode-ready", "mode", {
          imageUrl: supabaseImage("mode-ready"),
        }),
      ],
    );

    expect(queue.totalArtifacts).toBe(4);
    expect(queue.productionCards).toBe(3);
    expect(queue.openedChannels).toBe(1);
    expect(queue.runnable).toBe(2);
    expect(queue.items.map((item) => `${item.kind}:${item.id}:${item.runnable}`)).toEqual([
      "record:cap-ready:true",
      "record:cap-local:false",
      "mode:mode-ready:true",
    ]);
    expect(queue.items.find((item) => item.id === "cap-ready")?.hasXIntent).toBe(true);
    expect(queue.items.find((item) => item.id === "mode-ready")?.reason).toContain("create X intent");
    expect(queue.nextAction).toContain("Open 2 missing X share channels");
  });

  it("opens production record and mode share channels as one merged evidence batch", () => {
    const openedAt = "2026-07-01T12:10:00.000Z";
    const batch = buildOpenedShareChannelArtifacts(
      [record("cap-ready"), record("cap-local"), record("cap-opened")],
      [modeRun("mode-ready")],
      [
        artifact("cap-ready", "record", {
          imageUrl: supabaseImage("cap-ready"),
          xIntentUrl: xIntent("cap-ready"),
        }),
        artifact("cap-local", "record", { proofUrl: "http://localhost:5173/?proof=cap-local" }),
        artifact("cap-opened", "record", {
          imageUrl: supabaseImage("cap-opened"),
          xIntentUrl: xIntent("cap-opened"),
          xIntentOpenedAt: "2026-07-01T12:06:00.000Z",
        }),
        artifact("mode-ready", "mode", {
          imageUrl: supabaseImage("mode-ready"),
        }),
      ],
      openedAt,
    );

    expect(batch.opened.map((item) => `${item.kind}:${item.id}`)).toEqual([
      "record:cap-ready",
      "mode:mode-ready",
    ]);
    expect(batch.opened.every((item) => item.xIntentOpenedAt === openedAt)).toBe(true);
    expect(batch.opened.find((item) => item.id === "mode-ready")?.xIntentUrl).toContain("twitter.com/intent/tweet");
    expect(batch.skipped.map((item) => `${item.kind}:${item.id}`)).toEqual(["record:cap-local"]);
    expect(batch.evidence).toHaveLength(4);
    expect(batch.evidence[0]).toMatchObject({ id: "cap-ready", kind: "record", xIntentOpenedAt: openedAt });
    expect(batch.evidence[1]).toMatchObject({ id: "mode-ready", kind: "mode", xIntentOpenedAt: openedAt });
    expect(batch.evidence.find((item) => item.id === "cap-opened")?.xIntentOpenedAt).toBe("2026-07-01T12:06:00.000Z");
  });

  it("can mark production share channels as opened through native share with X fallback URLs", () => {
    const openedAt = "2026-07-01T12:12:00.000Z";
    const batch = buildOpenedShareChannelArtifacts(
      [record("cap-ready")],
      [modeRun("mode-ready")],
      [
        artifact("cap-ready", "record", {
          imageUrl: supabaseImage("cap-ready"),
        }),
        artifact("mode-ready", "mode", {
          imageUrl: supabaseImage("mode-ready"),
        }),
      ],
      openedAt,
      "native",
    );

    expect(batch.opened.map((item) => `${item.kind}:${item.id}`)).toEqual([
      "record:cap-ready",
      "mode:mode-ready",
    ]);
    expect(batch.opened.every((item) => item.nativeShareOpenedAt === openedAt)).toBe(true);
    expect(batch.opened.every((item) => item.xIntentOpenedAt === undefined)).toBe(true);
    expect(batch.opened.every((item) => item.xIntentUrl?.includes("twitter.com/intent/tweet"))).toBe(true);
  });

  it("does not count native share timestamps without reproducible X fallback intents", () => {
    const packet = buildShareChannelEvidencePacket(
      [record("cap-native-no-intent")],
      [],
      [
        artifact("cap-native-no-intent", "record", {
          imageUrl: supabaseImage("cap-native-no-intent"),
          nativeShareOpenedAt: "2026-07-01T12:06:00.000Z",
        }),
      ],
    );

    expect(packet.openedChannels).toBe(0);
    expect(packet.readyToOpen).toBe(1);
    expect(packet.rows[0]).toMatchObject({
      status: "ready-to-open",
      channelOpened: false,
      channel: "none",
    });
  });

  it("builds a share-channel evidence packet with publish and channel status", () => {
    const packet = buildShareChannelEvidencePacket(
      [record("cap-opened"), record("cap-ready"), record("cap-local")],
      [modeRun("mode-ready")],
      [
        artifact("cap-opened", "record", {
          imageUrl: supabaseImage("cap-opened"),
          xIntentUrl: xIntent("cap-opened"),
          xIntentOpenedAt: "2026-07-01T12:06:00.000Z",
        }),
        artifact("cap-ready", "record", {
          imageUrl: supabaseImage("cap-ready"),
          xIntentUrl: xIntent("cap-ready"),
        }),
        artifact("cap-local", "record", { proofUrl: "http://localhost:5173/?proof=cap-local" }),
        artifact("mode-ready", "mode", {
          imageUrl: supabaseImage("mode-ready"),
        }),
      ],
    );

    expect(packet.ready).toBe(false);
    expect(packet.totalArtifacts).toBe(4);
    expect(packet.productionCards).toBe(3);
    expect(packet.openedChannels).toBe(1);
    expect(packet.readyToOpen).toBe(2);
    expect(packet.missingProductionCards).toBe(1);
    expect(packet.rows.map((row) => `${row.kind}:${row.id}:${row.status}`)).toEqual([
      "record:cap-opened:published",
      "record:cap-ready:ready-to-open",
      "record:cap-local:needs-production-card",
      "mode:mode-ready:ready-to-open",
    ]);
    expect(packet.rows.find((row) => row.id === "mode-ready")?.xIntentUrl).toContain("twitter.com/intent/tweet");
    expect(packet.rows.find((row) => row.id === "cap-ready")?.openCommand).toContain("open 'https://twitter.com/intent/tweet");
    expect(packet.rows.find((row) => row.id === "cap-ready")?.readBackCommand).toContain(
      "$VITE_SUPABASE_URL/rest/v1/kickoff_share_artifacts",
    );
    expect(packet.rows.find((row) => row.id === "cap-ready")?.readBackCommand).toContain("proof_url=eq.");
    expect(packet.rows.find((row) => row.id === "cap-ready")?.readBackCommand).toContain("image_url=eq.");
    expect(packet.rows.find((row) => row.id === "cap-ready")?.readBackCommand).toContain("x_intent_url=eq.");
    expect(packet.rows.find((row) => row.id === "cap-ready")?.readBackCommand).toContain(
      "Authorization: Bearer $VITE_SUPABASE_ANON_KEY",
    );
    expect(packet.copyText).toContain("Kickoff Lock Agent share-channel evidence");
    expect(packet.copyText).toContain("read-back: curl -sS");
    expect(packet.nextAction).toContain("Open 2 ready X/native share channels");
  });

  it("audits X intent publishing readiness before and after the channel is opened", () => {
    const readyArtifact = artifact("cap-ready", "record", {
      imageUrl: supabaseImage("cap-ready"),
      xIntentUrl: xIntent("cap-ready"),
    });
    const readyAudit = buildShareIntentAuditPacket(readyArtifact, readyArtifact.xIntentUrl, "Brazil vs Japan");

    expect(readyAudit.ready).toBe(false);
    expect(readyAudit.publishReady).toBe(true);
    expect(readyAudit.channelReady).toBe(false);
    expect(readyAudit.checks.map((check) => `${check.key}:${check.status}`)).toEqual([
      "proof-url:passed",
      "image-metadata:passed",
      "image-url:passed",
      "x-intent:passed",
      "share-opened:pending",
    ]);
    expect(readyAudit.nextAction).toContain("Open the X intent");
    expect(readyAudit.copyText).toContain("Kickoff Lock Agent share intent audit");

    const openedAudit = buildShareIntentAuditPacket(
      { ...readyArtifact, xIntentOpenedAt: "2026-07-01T12:06:00.000Z" },
      readyArtifact.xIntentUrl,
      "Brazil vs Japan",
    );

    expect(openedAudit.ready).toBe(true);
    expect(openedAudit.channelReady).toBe(true);
    expect(openedAudit.nextAction).toBe("Share intent evidence is ready for production read-back.");
  });

  it("marks share-channel evidence ready after every production card has a saved channel timestamp", () => {
    const packet = buildShareChannelEvidencePacket(
      [record("cap-opened")],
      [modeRun("mode-opened")],
      [
        artifact("cap-opened", "record", {
          imageUrl: supabaseImage("cap-opened"),
          xIntentUrl: xIntent("cap-opened"),
          xIntentOpenedAt: "2026-07-01T12:06:00.000Z",
        }),
        artifact("mode-opened", "mode", {
          imageUrl: supabaseImage("mode-opened"),
          xIntentUrl: xIntent("mode-opened", "mode"),
          nativeShareOpenedAt: "2026-07-01T12:08:00.000Z",
        }),
      ],
    );

    expect(packet.ready).toBe(true);
    expect(packet.openedChannels).toBe(2);
    expect(packet.rows.map((row) => row.channel)).toEqual(["x", "native"]);
    expect(packet.nextAction).toContain("All public proof cards");
  });

  it("does not count a saved share timestamp without the stored X intent URL", () => {
    const packet = buildShareChannelEvidencePacket(
      [record("cap-opened")],
      [],
      [
        artifact("cap-opened", "record", {
          imageUrl: supabaseImage("cap-opened"),
          xIntentOpenedAt: "2026-07-01T12:06:00.000Z",
        }),
      ],
    );

    expect(packet.ready).toBe(false);
    expect(packet.openedChannels).toBe(0);
    expect(packet.readyToOpen).toBe(1);
    expect(packet.rows[0]).toMatchObject({
      status: "ready-to-open",
      channelOpened: false,
      channel: "none",
    });
  });

  it("does not count malformed X intents or timestamps before card generation", () => {
    const packet = buildShareChannelEvidencePacket(
      [record("cap-bad-url"), record("cap-too-early")],
      [],
      [
        artifact("cap-bad-url", "record", {
          imageUrl: supabaseImage("cap-bad-url"),
          xIntentUrl: "https://example.com/intent/tweet?url=https://example.com/kickoff-lock-agent/?proof=cap-bad-url",
          xIntentOpenedAt: "2026-07-01T12:06:00.000Z",
        }),
        artifact("cap-too-early", "record", {
          imageUrl: supabaseImage("cap-too-early"),
          xIntentUrl: xIntent("cap-too-early"),
          xIntentOpenedAt: "2026-07-01T12:04:59.000Z",
        }),
      ],
    );

    expect(packet.openedChannels).toBe(0);
    expect(packet.readyToOpen).toBe(1);
    expect(packet.rows.map((row) => row.status)).toEqual(["needs-x-intent", "ready-to-open"]);
  });

  it("uses production X intent rules before marking a channel ready to open", () => {
    const proofUrl = "https://example.com/kickoff-lock-agent/?proof=cap-loose";
    const missingTags = new URL("https://twitter.com/intent/tweet");
    missingTags.searchParams.set("text", `Kickoff Lock proof\nVerify: ${proofUrl}`);
    missingTags.searchParams.set("url", proofUrl);
    const missingProofInText = new URL("https://twitter.com/intent/tweet");
    missingProofInText.searchParams.set("text", "Kickoff Lock proof");
    missingProofInText.searchParams.set("url", proofUrl);
    missingProofInText.searchParams.set("hashtags", "KickoffLock,Filecoin,WorldCup");

    const packet = buildShareChannelEvidencePacket(
      [record("cap-loose"), record("cap-text")],
      [],
      [
        artifact("cap-loose", "record", {
          imageUrl: supabaseImage("cap-loose"),
          xIntentUrl: missingTags.toString(),
        }),
        artifact("cap-text", "record", {
          imageUrl: supabaseImage("cap-text"),
          xIntentUrl: missingProofInText.toString(),
        }),
      ],
    );

    expect(packet.readyToOpen).toBe(0);
    expect(packet.rows.map((row) => row.status)).toEqual(["needs-x-intent", "needs-x-intent"]);
    expect(packet.rows.every((row) => row.productionReady)).toBe(true);
    expect(packet.nextAction).toContain("Regenerate 2 X intent URLs");
    expect(packet.rows[0].action).toContain("hashtags");
  });
});
