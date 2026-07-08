import { describe, expect, it } from "vitest";
import { buildFilecoinProductionBootstrapPlan } from "./filecoinProductionBootstrap";

const readyEnv = {
  SYNAPSE_PRIVATE_KEY: `0x${"a".repeat(64)}`,
  FILECOIN_SEAL_TOKEN: "token-token-token-token",
  VITE_FILECOIN_SEAL_TOKEN: "token-token-token-token",
  FILECOIN_PROOF_STORE_PATH: "./proofs/filecoin-proof-store.json",
  FILECOIN_SEAL_MOCK: "0",
  ALLOW_ORIGIN: "https://example.com",
  VITE_FILECOIN_SEAL_API: "https://seal.example.com/seal",
  KICKOFF_FILECOIN_SEAL_HEALTH_READY: "1",
  KICKOFF_FILECOIN_SEAL_LIFECYCLE_READY: "1",
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
  VITE_SUPABASE_URL: "https://project.supabase.co",
  KICKOFF_SEED_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/record/cap-1/card.png",
  KICKOFF_SEED_MODE_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-1/mode/mode-bracket/card.png",
};

describe("Filecoin production bootstrap plan", () => {
  it("blocks until production seal API prerequisites are configured", () => {
    const plan = buildFilecoinProductionBootstrapPlan({});

    expect(plan.ready).toBe(false);
    expect(plan.blockedStages).toBeGreaterThan(0);
    expect(plan.missingEnv).toEqual(
      expect.arrayContaining([
        "Synapse private key",
        "Server upload token",
        "Browser token matches server",
        "Browser seal endpoint",
      ]),
    );
    expect(plan.stages.find((stage) => stage.id === "api")).toMatchObject({
      status: "blocked",
      command: "bun run filecoin:api:check",
    });
  });

  it("opens the real seal command when API and target payload inputs are ready", () => {
    const plan = buildFilecoinProductionBootstrapPlan(readyEnv, { proofStoreWritable: true });

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "api")).toMatchObject({ status: "ready" });
    expect(plan.stages.find((stage) => stage.id === "dry-run")).toMatchObject({ status: "ready" });
    expect(plan.stages.find((stage) => stage.id === "seal")).toMatchObject({
      status: "ready",
      command: "bun run seal:production-targets",
    });
    expect(plan.readBackCommands.find((item) => item.label === "Seal API health")).toMatchObject({
      ready: true,
      kind: "health",
      url: "https://seal.example.com/health",
      authMode: "none",
      command: "curl -sS 'https://seal.example.com/health'",
      responseExpectation: {
        ok: true,
        productionReady: true,
        mockMode: false,
        authRequired: true,
        persistence: "file",
      },
    });
    expect(plan.readBackCommands.find((item) => item.label === "Record verify status")).toMatchObject({
      ready: false,
      command: expect.stringContaining("target CID"),
    });
    expect(plan.commands).toEqual(
      expect.arrayContaining([
        "bun run filecoin:api:check",
        "bun run seal:production-targets -- --dry-run",
        "bun run seal:production-targets",
      ]),
    );
  });

  it("opens the real seal command when the seal API is mounted on the app origin", () => {
    const plan = buildFilecoinProductionBootstrapPlan(
      {
        ...readyEnv,
        VITE_FILECOIN_SEAL_API: "",
        VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        FILECOIN_SEAL_UPSTREAM_URL: "https://seal-origin.example/seal",
      },
      { proofStoreWritable: true },
    );

    expect(plan.stages.find((stage) => stage.id === "api")).toMatchObject({ status: "ready" });
    expect(plan.stages.find((stage) => stage.id === "seal")).toMatchObject({ status: "ready" });
    expect(plan.readBackCommands.find((item) => item.label === "Seal API health")?.command).toBe(
      "curl -sS 'https://example.com/health'",
    );
    expect(plan.missingEnv).not.toContain("VITE_FILECOIN_SEAL_API");
  });

  it("keeps seal payload building blocked until the mode share image target is configured", () => {
    const plan = buildFilecoinProductionBootstrapPlan(
      {
        ...readyEnv,
        KICKOFF_SEED_MODE_SHARE_IMAGE_URL: "",
        KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL: "",
      },
      { proofStoreWritable: true },
    );

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "dry-run")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["KICKOFF_SEED_MODE_SHARE_IMAGE_URL or KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"]),
    });
    expect(plan.stages.find((stage) => stage.id === "seal")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["KICKOFF_SEED_MODE_SHARE_IMAGE_URL or KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"]),
    });
  });

  it("opens sealing when target payloads use deployed public bitmap share images", () => {
    const plan = buildFilecoinProductionBootstrapPlan(
      {
        ...readyEnv,
        KICKOFF_SEED_SHARE_IMAGE_URL: "https://cdn.example.com/share.png",
        KICKOFF_SEED_MODE_SHARE_IMAGE_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/generated/kickoff-production-mode-share.webp",
      },
      { proofStoreWritable: true },
    );

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "dry-run")).toMatchObject({
      status: "ready",
    });
    expect(plan.stages.find((stage) => stage.id === "seal")).toMatchObject({
      status: "ready",
    });
  });

  it("does not open sealing when target payloads use non-public share image URLs", () => {
    const plan = buildFilecoinProductionBootstrapPlan(
      {
        ...readyEnv,
        KICKOFF_SEED_SHARE_IMAGE_URL: "http://cdn.example.com/share.png",
        KICKOFF_SEED_MODE_SHARE_IMAGE_URL: "https://cdn.example.com/mode-share.svg",
      },
      { proofStoreWritable: true },
    );

    expect(plan.ready).toBe(false);
    expect(plan.stages.find((stage) => stage.id === "dry-run")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "Record share image URL must be a public HTTPS URL",
        "Mode share image URL must point to a PNG, JPEG or WebP image path",
      ]),
    });
    expect(plan.stages.find((stage) => stage.id === "seal")).toMatchObject({
      status: "blocked",
    });
  });

  it("switches to doctor once CID and payload hash targets are collected", () => {
    const plan = buildFilecoinProductionBootstrapPlan(
      {
        ...readyEnv,
        KICKOFF_VERIFY_FILECOIN_RECORD_JOB_ID: "job-record",
        KICKOFF_VERIFY_FILECOIN_RECORD_CID: "bafy-record",
        KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH: "a".repeat(64),
        KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS: "job-1,job-2,job-3,job-4,job-5,job-6",
        KICKOFF_VERIFY_FILECOIN_MODE_CIDS: "bafy-1,bafy-2,bafy-3,bafy-4,bafy-5,bafy-6",
        KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)].join(","),
      },
      { proofStoreWritable: true },
    );

    expect(plan.stages.find((stage) => stage.id === "seal")).toMatchObject({ status: "done" });
    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "ready",
      command: "bun run doctor:filecoin",
    });
    expect(plan.readBackCommands).toHaveLength(22);
    expect(plan.readBackCommands.every((item) => item.ready)).toBe(true);
    expect(plan.readBackCommands.find((item) => item.label === "Record upload status")).toMatchObject({
      kind: "job",
      url: "https://seal.example.com/jobs/job-record",
      authMode: "bearer-token",
      expectedJobId: "job-record",
      responseExpectation: {
        ok: true,
        status: "verified",
        jobId: "job-record",
      },
      command: "curl -sS 'https://seal.example.com/jobs/job-record' -H \"Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN\"",
    });
    expect(plan.readBackCommands.find((item) => item.label === "Record verify status")).toMatchObject({
      kind: "verify",
      url: "https://seal.example.com/verify?cid=bafy-record",
      authMode: "bearer-token",
      expectedCid: "bafy-record",
      command: "curl -sS 'https://seal.example.com/verify?cid=bafy-record' -H \"Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN\"",
      expectedPayloadHash: "a".repeat(64),
      responseExpectation: {
        ok: true,
        proofStatus: "verified",
        cid: "bafy-record",
        payloadHash: "a".repeat(64),
      },
    });
    expect(plan.readBackCommands.find((item) => item.label === "Mode 5 proof read-back")).toMatchObject({
      kind: "proof",
      url: "https://seal.example.com/proof/bafy-5",
      authMode: "bearer-token",
      expectedCid: "bafy-5",
      command: "curl -sS 'https://seal.example.com/proof/bafy-5' -H \"Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN\"",
      expectedPayloadHash: "f".repeat(64),
      responseExpectation: {
        ok: true,
        proofStatus: "retrievable",
        cid: "bafy-5",
        payloadHash: "f".repeat(64),
      },
    });
    expect(plan.commands).toContain("bun run doctor:filecoin");
    expect(plan.copyText).toContain("Filecoin production bootstrap");
    expect(plan.copyText).toContain("Filecoin read-back commands");
    expect(plan.copyText).toContain("$VITE_FILECOIN_SEAL_TOKEN");
    expect(plan.copyText).not.toContain("token-token-token-token");
  });

  it("uses structured same-origin read-backs without exposing the browser seal token", () => {
    const plan = buildFilecoinProductionBootstrapPlan(
      {
        ...readyEnv,
        VITE_FILECOIN_SEAL_API: "",
        VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        FILECOIN_SEAL_UPSTREAM_URL: "https://seal-origin.example/seal",
        KICKOFF_VERIFY_FILECOIN_RECORD_JOB_ID: "job-record",
        KICKOFF_VERIFY_FILECOIN_RECORD_CID: "bafy-record",
        KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH: "a".repeat(64),
        KICKOFF_VERIFY_FILECOIN_MODE_JOB_IDS: "job-1,job-2,job-3,job-4,job-5",
        KICKOFF_VERIFY_FILECOIN_MODE_CIDS: "bafy-1,bafy-2,bafy-3,bafy-4,bafy-5,bafy-6",
        KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES: ["b".repeat(64), "c".repeat(64), "d".repeat(64), "e".repeat(64), "f".repeat(64), "1".repeat(64)].join(","),
      },
      { proofStoreWritable: true },
    );

    const verify = plan.readBackCommands.find((item) => item.label === "Record verify status");
    const uploadStatus = plan.readBackCommands.find((item) => item.label === "Record upload status");

    expect(uploadStatus).toMatchObject({
      kind: "job",
      url: "https://example.com/jobs/job-record",
      authMode: "same-origin",
      expectedJobId: "job-record",
      command: "curl -sS 'https://example.com/jobs/job-record'",
    });
    expect(verify).toMatchObject({
      kind: "verify",
      url: "https://example.com/verify?cid=bafy-record",
      authMode: "same-origin",
      expectedCid: "bafy-record",
      expectedPayloadHash: "a".repeat(64),
      command: "curl -sS 'https://example.com/verify?cid=bafy-record'",
    });
    expect(plan.readBackCommands.map((item) => item.command).join("\n")).not.toContain("VITE_FILECOIN_SEAL_TOKEN");
  });

  it("keeps production sealing open until all six mode CID/hash pairs are collected", () => {
    const plan = buildFilecoinProductionBootstrapPlan(
      {
        ...readyEnv,
        KICKOFF_VERIFY_FILECOIN_RECORD_CID: "bafy-record",
        KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH: "a".repeat(64),
        KICKOFF_VERIFY_FILECOIN_MODE_CIDS: "bafy-mode-1",
        KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES: "b".repeat(64),
      },
      { proofStoreWritable: true },
    );

    expect(plan.ready).toBe(false);
    expect(plan.missingEnv).toEqual(
      expect.arrayContaining([
        "KICKOFF_VERIFY_FILECOIN_MODE_CIDS needs 6 mode CIDs",
        "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES needs 6 mode payload hashes",
      ]),
    );
    expect(plan.stages.find((stage) => stage.id === "seal")).toMatchObject({
      status: "ready",
      detail: expect.stringContaining("all 6 mode targets"),
    });
    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining(["KICKOFF_VERIFY_FILECOIN_MODE_CIDS needs 6 mode CIDs"]),
    });
  });

  it("rejects malformed Filecoin payload hash outputs before doctor handoff", () => {
    const plan = buildFilecoinProductionBootstrapPlan(
      {
        ...readyEnv,
        KICKOFF_VERIFY_FILECOIN_RECORD_CID: "bafy-record",
        KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH: "not-a-hash",
        KICKOFF_VERIFY_FILECOIN_MODE_CIDS: "bafy-1,bafy-2,bafy-3,bafy-4,bafy-5,bafy-6",
        KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES: ["b".repeat(64), "c".repeat(64), "bad", "e".repeat(64), "f".repeat(64)].join(","),
      },
      { proofStoreWritable: true },
    );

    expect(plan.stages.find((stage) => stage.id === "seal")?.status).toBe("ready");
    expect(plan.stages.find((stage) => stage.id === "doctor")).toMatchObject({
      status: "blocked",
      missingEnv: expect.arrayContaining([
        "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH must be a 64-character SHA-256 hex digest",
        "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES must contain only 64-character SHA-256 hex digests",
      ]),
    });
  });
});
