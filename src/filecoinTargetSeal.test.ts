import { describe, expect, it, vi } from "vitest";
import {
  buildFilecoinTargetSealArtifact,
  buildFilecoinTargetPayloads,
  buildFilecoinTargetSealReport,
  filecoinTargetJobStatusUrl,
  filecoinTargetSealUploadUrl,
  filecoinTargetUrl,
} from "./filecoinTargetSeal";
import { parseEnvText } from "./productionEvidence";

const env = {
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
  VITE_FILECOIN_SEAL_TOKEN: "seal-token",
  KICKOFF_SEED_USER_ID: "user-prod",
  KICKOFF_SEED_PROOF_ID: "cap-prod",
  KICKOFF_SEED_MODE_ID: "mode-prod",
  KICKOFF_SEED_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-prod/record/cap-prod/card.png",
  KICKOFF_SEED_MODE_SHARE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-prod/mode/mode-prod/card.png",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const productionHealth = {
  ok: true,
  service: "kickoff-lock-filecoin-seal-api",
  mockMode: false,
  hasPrivateKey: true,
  authRequired: true,
  productionReady: true,
  blockers: [],
  proofCount: 0,
  persistence: "file",
  maxUploadBytes: 262144,
};

const sealedTarget = (kind: "record" | "mode", id: string, hash: string, baseUrl = "https://seal.example") => {
  const cid = `bafy-${id}`;
  const jobId = `job-${id}`;
  return {
    kind,
    id,
    payload: "{}",
    payloadHash: hash,
    byteLength: 2,
    cid,
    proofUrl: `${baseUrl}/proof/${cid}`,
    cidQueryUrl: `${baseUrl}/proof/${cid}`,
    verifyUrl: `${baseUrl}/verify?cid=${cid}`,
    backendJobId: jobId,
    uploadStatusUrl: `${baseUrl}/jobs/${jobId}`,
    uploadStatusPolls: 2,
    uploadStatusLog: [
      {
        attempt: 1,
        checkedAt: "2026-07-04T12:00:00.000Z",
        status: "running" as const,
        detail: "running",
        jobId,
        payloadHash: hash,
        byteLength: 2,
      },
      {
        attempt: 2,
        checkedAt: "2026-07-04T12:01:00.000Z",
        status: "verified" as const,
        detail: "ok",
        jobId,
        cid,
        payloadHash: hash,
        byteLength: 2,
      },
    ],
    verifyPolls: 2,
    verifyPollLog: [
      {
        attempt: 1,
        checkedAt: "2026-07-04T12:00:00.000Z",
        status: "pending" as const,
        proofStatus: "draft" as const,
        detail: "pending",
      },
      {
        attempt: 2,
        checkedAt: "2026-07-04T12:01:00.000Z",
        status: "verified" as const,
        proofStatus: "verified" as const,
        detail: "ok",
        cid,
        payloadHash: hash,
        byteLength: 2,
      },
    ],
    proof: {
      mode: "real" as const,
      cid,
      pieceCid: `piece-${id}`,
      provider: "synapse-provider",
      dataSetId: `dataset-${id}`,
      proofStatus: "verified" as const,
      payloadHash: hash,
      byteLength: 2,
    },
  };
};

describe("Filecoin production target seal", () => {
  it("builds seal API URLs from the browser endpoint", () => {
    expect(filecoinTargetUrl(env, "health")).toBe("https://seal.example/health");
    expect(filecoinTargetUrl(env, "seal")).toBe("https://seal.example/seal");
    expect(filecoinTargetSealUploadUrl(env)).toBe("https://seal.example/seal?async=1");
    expect(filecoinTargetJobStatusUrl(env, "/jobs/job-1", undefined)).toBe("https://seal.example/jobs/job-1");
    expect(filecoinTargetJobStatusUrl(env, undefined, "job-2")).toBe("https://seal.example/jobs/job-2");
    expect(filecoinTargetUrl(env, "verify", "bafy-1")).toBe("https://seal.example/verify?cid=bafy-1");
    expect(filecoinTargetUrl(env, "proof", "bafy-1")).toBe("https://seal.example/proof/bafy-1");
  });

  it("builds seal API URLs from a same-origin /seal mount", () => {
    const sameOriginEnv = {
      ...env,
      VITE_FILECOIN_SEAL_API: "",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
    };

    expect(filecoinTargetUrl(sameOriginEnv, "health")).toBe("https://example.com/health");
    expect(filecoinTargetUrl(sameOriginEnv, "seal")).toBe("https://example.com/seal");
    expect(filecoinTargetSealUploadUrl(sameOriginEnv)).toBe("https://example.com/seal?async=1");
    expect(filecoinTargetUrl(sameOriginEnv, "verify", "bafy-1")).toBe("https://example.com/verify?cid=bafy-1");
    expect(filecoinTargetUrl(sameOriginEnv, "proof", "bafy-1")).toBe("https://example.com/proof/bafy-1");
  });

  it("builds deterministic record and mode payloads accepted by the seal API contract", async () => {
    const payloads = await buildFilecoinTargetPayloads(env, "2026-07-03T00:00:00.000Z");

    expect(payloads.record).toMatchObject({ kind: "record", id: "cap-prod" });
    expect(payloads.record.payload).toContain('"capsule"');
    expect(payloads.record.payload).toContain('"result"');
    expect(payloads.record.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(payloads.record.byteLength).toBeGreaterThan(1000);
    expect(payloads.mode).toMatchObject({ kind: "mode", id: "mode-prod" });
    expect(payloads.modes.map((target) => target.id)).toHaveLength(6);
    expect(payloads.modes.map((target) => target.id)).toEqual([
      "mode-prod",
      expect.stringContaining("mode-prod-parlay"),
      expect.stringContaining("mode-prod-agent-vs-human"),
      expect.stringContaining("mode-prod-upset"),
      expect.stringContaining("mode-prod-group-path"),
      expect.stringContaining("mode-prod-penalty-pressure"),
    ]);
    expect(payloads.mode.payload).toContain('"modeRun"');
    expect(payloads.mode.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(payloads.mode.byteLength).toBeGreaterThan(1000);
    expect(payloads.seed.targets.shareImageUrl).toBe("https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-prod/record/cap-prod/card.png");
    expect(payloads.seed.targets.modeShareImageUrl).toBe("https://project.supabase.co/storage/v1/object/public/kickoff-share-cards/user-prod/mode/mode-prod/card.png");
  });

  it("dry-runs without contacting the seal API and emits payload hashes", async () => {
    const fetcher = vi.fn();
    const report = await buildFilecoinTargetSealReport(
      {
        VITE_PUBLIC_APP_URL: env.VITE_PUBLIC_APP_URL,
        VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
        KICKOFF_SEED_SHARE_IMAGE_URL: env.KICKOFF_SEED_SHARE_IMAGE_URL,
        KICKOFF_SEED_MODE_SHARE_IMAGE_URL: env.KICKOFF_SEED_MODE_SHARE_IMAGE_URL,
      },
      { dryRun: true, fetcher: fetcher as any, now: "2026-07-03T00:00:00.000Z" },
    );

    expect(report.ready).toBe(false);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        "VITE_FILECOIN_SEAL_API missing or VITE_FILECOIN_SEAL_SAME_ORIGIN not enabled",
        "VITE_FILECOIN_SEAL_TOKEN missing",
      ]),
    );
    expect(report.targets.map((target) => target.kind)).toEqual(["record", "mode", "mode", "mode", "mode", "mode", "mode"]);
    expect(report.targets.filter((target) => target.kind === "mode")).toHaveLength(6);
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH=");
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH=");
    const dryRunEnv = parseEnvText(report.verifyEnv);
    expect(dryRunEnv.KICKOFF_VERIFY_PUBLIC_PROFILE_URL).toBe("https://example.com/kickoff-lock-agent/?profile=kickoff-production-seed");
    expect(dryRunEnv.KICKOFF_VERIFY_SHARE_ARTIFACT_IDS).toContain("record:");
    expect(dryRunEnv.KICKOFF_VERIFY_SHARE_ARTIFACT_IDS).toContain("mode:");
    expect(dryRunEnv.KICKOFF_VERIFY_LEADERBOARD_SCOPES).toBe("global,friend,season");
    expect(report.verifyEnv).toContain(`KICKOFF_VERIFY_SHARE_IMAGE_URL=${env.KICKOFF_SEED_SHARE_IMAGE_URL}`);
    expect(report.verifyEnv).toContain(`KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL=${env.KICKOFF_SEED_MODE_SHARE_IMAGE_URL}`);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("dry-runs Cloudflare Pages same-origin seal targets without exposing a browser token", async () => {
    const fetcher = vi.fn();
    const report = await buildFilecoinTargetSealReport(
      {
        ...env,
        VITE_FILECOIN_SEAL_API: "",
        VITE_FILECOIN_SEAL_TOKEN: "",
        VITE_FILECOIN_SEAL_SAME_ORIGIN: "",
        VITE_PUBLIC_APP_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/",
        CF_PAGES: "1",
        CF_PAGES_URL: "https://kickoff-lock-agent.pages.dev/",
      },
      { dryRun: true, fetcher: fetcher as any, now: "2026-07-03T00:00:00.000Z" },
    );

    expect(filecoinTargetSealUploadUrl({
      ...env,
      VITE_FILECOIN_SEAL_API: "",
      VITE_PUBLIC_APP_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      CF_PAGES: "1",
      CF_PAGES_URL: "https://kickoff-lock-agent.pages.dev/",
    })).toBe("https://kickoff-lock-agent.pages.dev/seal?async=1");
    expect(report.blockers).not.toContain("VITE_FILECOIN_SEAL_TOKEN missing");
    expect(report.blockers).not.toContain("VITE_FILECOIN_SEAL_API missing or VITE_FILECOIN_SEAL_SAME_ORIGIN not enabled");
    expect(report.targets.filter((target) => target.kind === "mode")).toHaveLength(6);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps same-origin target read-back commands secretless", () => {
    const artifact = buildFilecoinTargetSealArtifact({
      ready: true,
      dryRun: false,
      endpoint: "https://kickoff-lock-agent.pages.dev/seal",
      sameOriginSeal: true,
      productionReady: true,
      targets: [
        sealedTarget("record", "cap-same", "a".repeat(64), "https://kickoff-lock-agent.pages.dev"),
        sealedTarget("mode", "mode-same-1", "b".repeat(64), "https://kickoff-lock-agent.pages.dev"),
        sealedTarget("mode", "mode-same-2", "c".repeat(64), "https://kickoff-lock-agent.pages.dev"),
        sealedTarget("mode", "mode-same-3", "d".repeat(64), "https://kickoff-lock-agent.pages.dev"),
        sealedTarget("mode", "mode-same-4", "e".repeat(64), "https://kickoff-lock-agent.pages.dev"),
        sealedTarget("mode", "mode-same-5", "f".repeat(64), "https://kickoff-lock-agent.pages.dev"),
      ],
      verifyEnv: "",
      blockers: [],
    });

    const commands = artifact.readBackCommands.map((command) => command.command).join("\n");

    expect(artifact.ready).toBe(true);
    expect(artifact.readBackCommands).toHaveLength(18);
    expect(artifact.readBackCommands.every((command) => command.authMode === "same-origin-proxy")).toBe(true);
    expect(commands).toContain("curl -sS 'https://kickoff-lock-agent.pages.dev/jobs/job-cap-same'");
    expect(commands).toContain("curl -sS 'https://kickoff-lock-agent.pages.dev/verify?cid=bafy-cap-same'");
    expect(commands).not.toContain("$VITE_FILECOIN_SEAL_TOKEN");
    expect(commands).not.toContain("Authorization: Bearer");
  });

  it("seals record and mode targets through async jobs, verifies registry read-back and emits production env", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const jobPolls = new Map<string, number>();
    const jobBodies = new Map<string, string>();
    const verifyPolls = new Map<string, number>();
    const modeJobIdFor = (body: string) => {
      const id = JSON.parse(body).modeRun.id as string;
      return `seal-job-${id}`;
    };
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body?.toString() });
      expect(init?.headers).toMatchObject({ Authorization: "Bearer seal-token" });
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url === "https://seal.example/seal?async=1") {
        const body = init?.body?.toString() ?? "";
        const kind = body.includes('"modeRun"') ? "mode" : "record";
        const { sha256 } = await import("./proof");
        const payload = body;
        const jobId = kind === "mode" ? modeJobIdFor(body) : "seal-job-record";
        jobBodies.set(jobId, body);
        return jsonResponse(
          {
            jobId,
            status: "queued",
            statusUrl: `/jobs/${jobId}`,
            payloadHash: await sha256(payload),
            byteLength: new TextEncoder().encode(payload).byteLength,
          },
          202,
        );
      }
      if (url.startsWith("https://seal.example/jobs/seal-job-")) {
        const jobId = url.split("/").pop() ?? "";
        const kind = jobId === "seal-job-record" ? "record" : "mode";
        const nextPoll = (jobPolls.get(jobId) ?? 0) + 1;
        jobPolls.set(jobId, nextPoll);
        const body = jobBodies.get(jobId) ?? "";
        const { sha256 } = await import("./proof");
        const suffix = kind === "mode" ? JSON.parse(body).modeRun.id : "record";
        const proof = {
          cid: kind === "mode" ? `bafy-${suffix}` : "bafy-record-real",
          proofStatus: "retrievable",
          payloadHash: await sha256(body),
          byteLength: new TextEncoder().encode(body).byteLength,
        };
        return jsonResponse(nextPoll === 1 ? { jobId, status: "running" } : { jobId, status: "verified", proof });
      }
      if (url === "https://seal.example/verify?cid=bafy-record-real") {
        const nextPoll = (verifyPolls.get(url) ?? 0) + 1;
        verifyPolls.set(url, nextPoll);
        return jsonResponse({
          cid: "bafy-record-real",
          proofStatus: nextPoll === 1 ? "sealed" : "verified",
        });
      }
      if (url === "https://seal.example/proof/bafy-record-real") {
        const body = calls.find((call) => call.method === "POST" && call.body?.includes('"capsule"'))?.body ?? "";
        const { sha256 } = await import("./proof");
        return jsonResponse({
          cid: "bafy-record-real",
          mode: "real",
          pieceCid: "piece-bafy-record-real",
          provider: "synapse-provider",
          dataSetId: "dataset-record",
          proofStatus: "verified",
          payloadHash: await sha256(body),
          byteLength: new TextEncoder().encode(body).byteLength,
        });
      }
      if (url.startsWith("https://seal.example/verify?cid=bafy-mode-")) {
        const cid = new URL(url).searchParams.get("cid");
        const nextPoll = (verifyPolls.get(url) ?? 0) + 1;
        verifyPolls.set(url, nextPoll);
        return jsonResponse({ cid, proofStatus: nextPoll === 1 ? "draft" : "verified" });
      }
      if (url.startsWith("https://seal.example/proof/bafy-mode-")) {
        const cid = url.split("/").pop() ?? "";
        const jobId = `seal-job-${cid.replace(/^bafy-/, "")}`;
        const body = jobBodies.get(jobId) ?? "";
        const { sha256 } = await import("./proof");
        return jsonResponse({
          cid,
          mode: "real",
          pieceCid: `piece-${cid}`,
          provider: "synapse-provider",
          dataSetId: `dataset-${cid}`,
          proofStatus: "verified",
          payloadHash: await sha256(body),
          byteLength: new TextEncoder().encode(body).byteLength,
        });
      }
      return jsonResponse({ error: "unexpected" }, 404);
    });

    const report = await buildFilecoinTargetSealReport(env, {
      fetcher: fetcher as any,
      now: "2026-07-03T00:00:00.000Z",
      pollDelayMs: 0,
    });

    const record = report.targets.find((target) => target.kind === "record");
    const modes = report.targets.filter((target) => target.kind === "mode");
    const mode = modes[0];
    expect(report.ready).toBe(true);
    expect(report.productionReady).toBe(true);
    expect(modes).toHaveLength(6);
    expect(record?.cid).toBe("bafy-record-real");
    expect(record?.backendJobId).toBe("seal-job-record");
    expect(record?.uploadStatusUrl).toBe("https://seal.example/jobs/seal-job-record");
    expect(record?.uploadStatusPolls).toBe(2);
    expect(record?.uploadStatusLog?.map((item) => item.status)).toEqual(["running", "verified"]);
    expect(record?.verifyPolls).toBe(2);
    expect(record?.verifyPollLog?.map((item) => item.status)).toEqual(["pending", "verified"]);
    expect(mode?.cid).toBe("bafy-mode-prod");
    expect(mode?.backendJobId).toBe("seal-job-mode-prod");
    expect(mode?.uploadStatusUrl).toBe("https://seal.example/jobs/seal-job-mode-prod");
    expect(mode?.uploadStatusPolls).toBe(2);
    expect(mode?.uploadStatusLog?.map((item) => item.status)).toEqual(["running", "verified"]);
    expect(mode?.verifyPolls).toBe(2);
    expect(mode?.verifyPollLog?.map((item) => item.status)).toEqual(["pending", "verified"]);
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FILECOIN_RECORD_CID=bafy-record-real");
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FILECOIN_MODE_CID=bafy-mode-prod");
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FILECOIN_MODE_CIDS=");
    expect(report.verifyEnv).toContain("bafy-mode-prod");
    const sealedEnv = parseEnvText(report.verifyEnv);
    expect(sealedEnv.KICKOFF_VERIFY_PUBLIC_PROFILE_URL).toBe("https://example.com/kickoff-lock-agent/?profile=user-prod");
    expect(sealedEnv.KICKOFF_VERIFY_SHARE_ARTIFACT_IDS).toContain("record:cap-prod");
    expect(sealedEnv.KICKOFF_VERIFY_SHARE_ARTIFACT_IDS).toContain("mode:mode-prod");
    expect(sealedEnv.KICKOFF_VERIFY_LEADERBOARD_SCOPES).toBe("global,friend,season");
    expect(report.verifyEnv).toContain(`KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL=${env.KICKOFF_SEED_MODE_SHARE_IMAGE_URL}`);
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual(
      expect.arrayContaining([
        "GET https://seal.example/health",
        "POST https://seal.example/seal?async=1",
        "GET https://seal.example/jobs/seal-job-record",
        "GET https://seal.example/verify?cid=bafy-record-real",
        "GET https://seal.example/proof/bafy-record-real",
      ]),
    );
    expect(calls.filter((call) => call.url === "https://seal.example/seal?async=1")).toHaveLength(7);
    expect(calls.filter((call) => call.url === "https://seal.example/jobs/seal-job-record")).toHaveLength(2);
    expect(calls.filter((call) => call.url === "https://seal.example/verify?cid=bafy-record-real")).toHaveLength(2);
    for (const target of modes) {
      expect(calls.filter((call) => call.url === `https://seal.example/jobs/seal-job-${target.id}`)).toHaveLength(2);
      expect(calls.some((call) => call.url === `https://seal.example/verify?cid=bafy-${target.id}`)).toBe(true);
      expect(calls.some((call) => call.url === `https://seal.example/proof/bafy-${target.id}`)).toBe(true);
    }

    const artifact = buildFilecoinTargetSealArtifact(report, {
      envFiles: [".env.production.local"],
      generatedAt: "2026-07-04T12:00:00.000Z",
    });
    expect(artifact.artifactVersion).toBe(1);
    expect(artifact.generatedAt).toBe("2026-07-04T12:00:00.000Z");
    expect(artifact.envFiles).toEqual([".env.production.local"]);
    expect(artifact.acceptance).toMatchObject({
      recordSealed: true,
      modeSealedCount: 6,
      requiredModeSealCount: 6,
      uploadStatusComplete: true,
      verifyPollingComplete: true,
      cidQueryComplete: true,
      proofReadbackComplete: true,
      targets: expect.arrayContaining([
        expect.objectContaining({
          kind: "record",
          id: "cap-prod",
          cid: "bafy-record-real",
          backendJobId: "seal-job-record",
          sealed: true,
          uploadStatus: true,
          uploadStatusProgression: true,
          verifyPolling: true,
          verifyPollingProgression: true,
          cidQuery: true,
          cidQueryUrl: "https://seal.example/proof/bafy-record-real",
          proofReadback: true,
          blockers: [],
        }),
        expect.objectContaining({
          kind: "mode",
          id: "mode-prod",
          cid: "bafy-mode-prod",
          backendJobId: "seal-job-mode-prod",
          sealed: true,
          uploadStatus: true,
          uploadStatusProgression: true,
          verifyPolling: true,
          verifyPollingProgression: true,
          cidQuery: true,
          cidQueryUrl: "https://seal.example/proof/bafy-mode-prod",
          proofReadback: true,
          blockers: [],
        }),
      ]),
      outputEnvKeys: [
        "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
        "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH",
        "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
        "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES",
      ],
    });
    expect(artifact.readBackCommands).toHaveLength(21);
    expect(artifact.readBackCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "record-cap-prod-upload-status",
          url: "https://seal.example/jobs/seal-job-record",
          command: `curl -sS 'https://seal.example/jobs/seal-job-record' -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`,
          ready: true,
          expectedCid: "bafy-record-real",
        }),
        expect.objectContaining({
          id: "record-cap-prod-verify",
          url: "https://seal.example/verify?cid=bafy-record-real",
          command: `curl -sS 'https://seal.example/verify?cid=bafy-record-real' -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`,
          ready: true,
          expectedPayloadHash: report.targets.find((target) => target.kind === "record")?.payloadHash,
        }),
        expect.objectContaining({
          id: "mode-mode-prod-proof",
          url: "https://seal.example/proof/bafy-mode-prod",
          command: `curl -sS 'https://seal.example/proof/bafy-mode-prod' -H "Authorization: Bearer $VITE_FILECOIN_SEAL_TOKEN"`,
          ready: true,
          expectedCid: "bafy-mode-prod",
        }),
      ]),
    );
  });

  it("does not mark a seal artifact complete without CID verification and proof read-back", async () => {
    const report = await buildFilecoinTargetSealReport(
      {
        VITE_PUBLIC_APP_URL: env.VITE_PUBLIC_APP_URL,
        VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
        KICKOFF_SEED_SHARE_IMAGE_URL: env.KICKOFF_SEED_SHARE_IMAGE_URL,
        KICKOFF_SEED_MODE_SHARE_IMAGE_URL: env.KICKOFF_SEED_MODE_SHARE_IMAGE_URL,
      },
      { dryRun: true, now: "2026-07-03T00:00:00.000Z" },
    );

    const artifact = buildFilecoinTargetSealArtifact(report);

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance).toMatchObject({
      recordSealed: false,
      modeSealedCount: 0,
      uploadStatusComplete: false,
      verifyPollingComplete: false,
      cidQueryComplete: false,
      proofReadbackComplete: false,
    });
  });

  it("does not mark a target complete without a CID query registry URL", () => {
    const target = (kind: "record" | "mode", id: string, hash: string, patch = {}) => ({
      kind,
      id,
      payload: "{}",
      payloadHash: hash,
      byteLength: 2,
      cid: `bafy-${id}`,
      proofUrl: `https://seal.example/proof/bafy-${id}`,
      cidQueryUrl: `https://seal.example/proof/bafy-${id}`,
      verifyUrl: `https://seal.example/verify?cid=bafy-${id}`,
      backendJobId: `job-${id}`,
      uploadStatusUrl: `https://seal.example/jobs/job-${id}`,
      uploadStatusPolls: 2,
      uploadStatusLog: [
        { attempt: 1, checkedAt: "2026-07-04T12:00:00.000Z", status: "running" as const, detail: "running", jobId: `job-${id}`, payloadHash: hash, byteLength: 2 },
        { attempt: 2, checkedAt: "2026-07-04T12:01:00.000Z", status: "verified" as const, detail: "ok", cid: `bafy-${id}`, jobId: `job-${id}`, payloadHash: hash, byteLength: 2 },
      ],
      verifyPolls: 2,
      verifyPollLog: [
        { attempt: 1, checkedAt: "2026-07-04T12:00:00.000Z", status: "pending" as const, proofStatus: "draft" as const, detail: "pending" },
        { attempt: 2, checkedAt: "2026-07-04T12:01:00.000Z", status: "verified" as const, proofStatus: "verified" as const, detail: "ok", cid: `bafy-${id}` },
      ],
      proof: {
        mode: "real" as const,
        cid: `bafy-${id}`,
        pieceCid: `piece-${id}`,
        provider: "synapse-provider",
        dataSetId: `dataset-${id}`,
        proofStatus: "verified" as const,
        payloadHash: hash,
        byteLength: 2,
      },
      ...patch,
    });
    const artifact = buildFilecoinTargetSealArtifact({
      ready: true,
      dryRun: false,
      endpoint: env.VITE_FILECOIN_SEAL_API,
      productionReady: true,
      targets: [
        target("record", "record", "a".repeat(64), { cidQueryUrl: undefined }),
        target("mode", "mode-1", "b".repeat(64)),
        target("mode", "mode-2", "c".repeat(64)),
        target("mode", "mode-3", "d".repeat(64)),
        target("mode", "mode-4", "e".repeat(64)),
        target("mode", "mode-5", "f".repeat(64)),
      ],
      verifyEnv: "",
      blockers: [],
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.cidQueryComplete).toBe(false);
    expect(artifact.acceptance.recordSealed).toBe(false);
    expect(artifact.acceptance.targets.find((item) => item.kind === "record")).toMatchObject({
      cidQuery: false,
      proofReadback: false,
      blockers: expect.arrayContaining(["CID query read-back missing or targets a different CID"]),
    });
  });

  it("does not mark CID query complete when the registry URL points at another CID", () => {
    const target = (kind: "record" | "mode", id: string, hash: string, patch = {}) => ({
      kind,
      id,
      payload: "{}",
      payloadHash: hash,
      byteLength: 2,
      cid: `bafy-${id}`,
      proofUrl: `https://seal.example/proof/bafy-${id}`,
      cidQueryUrl: `https://seal.example/proof/bafy-${id}`,
      verifyUrl: `https://seal.example/verify?cid=bafy-${id}`,
      backendJobId: `job-${id}`,
      uploadStatusUrl: `https://seal.example/jobs/job-${id}`,
      uploadStatusPolls: 2,
      uploadStatusLog: [
        { attempt: 1, checkedAt: "2026-07-04T12:00:00.000Z", status: "running" as const, detail: "running", jobId: `job-${id}`, payloadHash: hash, byteLength: 2 },
        { attempt: 2, checkedAt: "2026-07-04T12:01:00.000Z", status: "verified" as const, detail: "ok", cid: `bafy-${id}`, jobId: `job-${id}`, payloadHash: hash, byteLength: 2 },
      ],
      verifyPolls: 2,
      verifyPollLog: [
        { attempt: 1, checkedAt: "2026-07-04T12:00:00.000Z", status: "pending" as const, proofStatus: "draft" as const, detail: "pending" },
        { attempt: 2, checkedAt: "2026-07-04T12:01:00.000Z", status: "verified" as const, proofStatus: "verified" as const, detail: "ok", cid: `bafy-${id}`, payloadHash: hash, byteLength: 2 },
      ],
      proof: {
        mode: "real" as const,
        cid: `bafy-${id}`,
        pieceCid: `piece-${id}`,
        provider: "synapse-provider",
        dataSetId: `dataset-${id}`,
        proofStatus: "verified" as const,
        payloadHash: hash,
        byteLength: 2,
      },
      ...patch,
    });
    const artifact = buildFilecoinTargetSealArtifact({
      ready: true,
      dryRun: false,
      endpoint: env.VITE_FILECOIN_SEAL_API,
      productionReady: true,
      targets: [
        target("record", "record", "a".repeat(64), { cidQueryUrl: "https://seal.example/proof/bafy-other-record" }),
        target("mode", "mode-1", "b".repeat(64)),
        target("mode", "mode-2", "c".repeat(64)),
        target("mode", "mode-3", "d".repeat(64)),
        target("mode", "mode-4", "e".repeat(64)),
        target("mode", "mode-5", "f".repeat(64)),
      ],
      verifyEnv: "",
      blockers: [],
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.cidQueryComplete).toBe(false);
    expect(artifact.acceptance.recordSealed).toBe(false);
    expect(artifact.acceptance.targets.find((item) => item.kind === "record")).toMatchObject({
      cidQuery: false,
      proofReadback: false,
      blockers: expect.arrayContaining(["CID query read-back missing or targets a different CID"]),
    });
  });

  it("does not mark a seal artifact ready when proof metadata is mock or placeholder data", () => {
    const target = (kind: "record" | "mode", id: string, hash: string) => ({
      kind,
      id,
      payload: "{}",
      payloadHash: hash,
      byteLength: 2,
      cid: `bafy-${id}`,
      proofUrl: `https://seal.example/proof/bafy-${id}`,
      cidQueryUrl: `https://seal.example/proof/bafy-${id}`,
      verifyUrl: `https://seal.example/verify?cid=bafy-${id}`,
      backendJobId: `job-${id}`,
      uploadStatusUrl: `https://seal.example/jobs/job-${id}`,
      uploadStatusPolls: 2,
      uploadStatusLog: [
        {
          attempt: 1,
          checkedAt: "2026-07-04T12:00:00.000Z",
          status: "running" as const,
          detail: "running",
          jobId: `job-${id}`,
          payloadHash: hash,
          byteLength: 2,
        },
        {
          attempt: 2,
          checkedAt: "2026-07-04T12:01:00.000Z",
          status: "verified" as const,
          detail: "ok",
          cid: `bafy-${id}`,
          payloadHash: hash,
          byteLength: 2,
        },
      ],
      verifyPolls: 2,
      verifyPollLog: [
        { attempt: 1, checkedAt: "2026-07-04T12:00:00.000Z", status: "pending" as const, proofStatus: "draft" as const, detail: "pending" },
        { attempt: 2, checkedAt: "2026-07-04T12:01:00.000Z", status: "verified" as const, proofStatus: "verified" as const, detail: "ok", cid: `bafy-${id}` },
      ],
      proof: {
        mode: "real" as const,
        cid: `bafy-${id}`,
        pieceCid: `piece-${id}`,
        provider: id === "record" ? "mock-synapse-provider" : "synapse-provider",
        dataSetId: id === "mode-2" ? "seal-api-dataset" : `dataset-${id}`,
        proofStatus: "verified" as const,
        payloadHash: hash,
        byteLength: 2,
      },
    });
    const artifact = buildFilecoinTargetSealArtifact({
      ready: true,
      dryRun: false,
      endpoint: env.VITE_FILECOIN_SEAL_API,
      productionReady: true,
      targets: [
        target("record", "record", "a".repeat(64)),
        target("mode", "mode-1", "b".repeat(64)),
        target("mode", "mode-2", "c".repeat(64)),
        target("mode", "mode-3", "d".repeat(64)),
        target("mode", "mode-4", "e".repeat(64)),
      ],
      verifyEnv: "",
      blockers: [],
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.recordSealed).toBe(false);
    expect(artifact.acceptance.modeSealedCount).toBe(3);
    expect(artifact.acceptance.proofReadbackComplete).toBe(false);
  });

  it("does not mark target seal polling complete when the latest status CID is stale", () => {
    const target = (kind: "record" | "mode", id: string, hash: string, patch = {}) => ({
      kind,
      id,
      payload: "{}",
      payloadHash: hash,
      byteLength: 2,
      cid: `bafy-${id}`,
      proofUrl: `https://seal.example/proof/bafy-${id}`,
      cidQueryUrl: `https://seal.example/proof/bafy-${id}`,
      verifyUrl: `https://seal.example/verify?cid=bafy-${id}`,
      backendJobId: `job-${id}`,
      uploadStatusUrl: `https://seal.example/jobs/job-${id}`,
      uploadStatusPolls: 2,
      uploadStatusLog: [
        {
          attempt: 1,
          checkedAt: "2026-07-04T12:00:00.000Z",
          status: "running" as const,
          detail: "running",
          jobId: `job-${id}`,
          payloadHash: hash,
          byteLength: 2,
        },
        {
          attempt: 2,
          checkedAt: "2026-07-04T12:01:00.000Z",
          status: "verified" as const,
          detail: "ok",
          cid: `bafy-${id}`,
          jobId: `job-${id}`,
          payloadHash: hash,
          byteLength: 2,
        },
      ],
      verifyPolls: 2,
      verifyPollLog: [
        { attempt: 1, checkedAt: "2026-07-04T12:00:00.000Z", status: "pending" as const, proofStatus: "draft" as const, detail: "pending" },
        { attempt: 2, checkedAt: "2026-07-04T12:01:00.000Z", status: "verified" as const, proofStatus: "verified" as const, detail: "ok", cid: `bafy-${id}` },
      ],
      proof: {
        mode: "real" as const,
        cid: `bafy-${id}`,
        pieceCid: `piece-${id}`,
        provider: "synapse-provider",
        dataSetId: `dataset-${id}`,
        proofStatus: "verified" as const,
        payloadHash: hash,
        byteLength: 2,
      },
      ...patch,
    });
    const artifact = buildFilecoinTargetSealArtifact({
      ready: true,
      dryRun: false,
      endpoint: env.VITE_FILECOIN_SEAL_API,
      productionReady: true,
      targets: [
        target("record", "record", "a".repeat(64), {
          uploadStatusLog: [
            {
              attempt: 1,
              checkedAt: "2026-07-04T12:00:00.000Z",
              status: "verified" as const,
              detail: "old",
              cid: "bafy-record",
              jobId: "job-record",
              payloadHash: "a".repeat(64),
              byteLength: 2,
            },
            {
              attempt: 2,
              checkedAt: "2026-07-04T12:01:00.000Z",
              status: "verified" as const,
              detail: "stale",
              cid: "bafy-other",
              jobId: "job-record",
              payloadHash: "a".repeat(64),
              byteLength: 2,
            },
          ],
        }),
        target("mode", "mode-1", "b".repeat(64), {
          verifyPollLog: [
            { attempt: 1, checkedAt: "2026-07-04T12:00:00.000Z", status: "verified" as const, proofStatus: "verified" as const, detail: "stale", cid: "bafy-other" },
          ],
        }),
        target("mode", "mode-2", "c".repeat(64)),
        target("mode", "mode-3", "d".repeat(64)),
        target("mode", "mode-4", "e".repeat(64)),
      ],
      verifyEnv: "",
      blockers: [],
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.recordSealed).toBe(false);
    expect(artifact.acceptance.modeSealedCount).toBe(3);
    expect(artifact.acceptance.uploadStatusComplete).toBe(false);
    expect(artifact.acceptance.verifyPollingComplete).toBe(false);
    expect(artifact.acceptance.proofReadbackComplete).toBe(true);
    expect(artifact.acceptance.targets.find((item) => item.kind === "record")).toMatchObject({
      id: "record",
      sealed: false,
      uploadStatus: false,
      verifyPolling: true,
      proofReadback: true,
      blockers: expect.arrayContaining(["upload status did not progress from queued/running to verified"]),
    });
    expect(artifact.acceptance.targets.find((item) => item.id === "mode-1")).toMatchObject({
      sealed: false,
      uploadStatus: true,
      verifyPolling: false,
      proofReadback: true,
      blockers: expect.arrayContaining([
        "verification polling did not progress from pending/retrievable to retrievable/verified",
      ]),
    });
  });

  it("does not mark target seal polling complete when the upload status payload hash is stale", () => {
    const target = (kind: "record" | "mode", id: string, hash: string, patch = {}) => ({
      kind,
      id,
      payload: "{}",
      payloadHash: hash,
      byteLength: 2,
      cid: `bafy-${id}`,
      proofUrl: `https://seal.example/proof/bafy-${id}`,
      cidQueryUrl: `https://seal.example/proof/bafy-${id}`,
      verifyUrl: `https://seal.example/verify?cid=bafy-${id}`,
      backendJobId: `job-${id}`,
      uploadStatusUrl: `https://seal.example/jobs/job-${id}`,
      uploadStatusPolls: 2,
      uploadStatusLog: [
        {
          attempt: 1,
          checkedAt: "2026-07-04T12:00:00.000Z",
          status: "running" as const,
          detail: "running",
          jobId: `job-${id}`,
          payloadHash: hash,
          byteLength: 2,
        },
        {
          attempt: 2,
          checkedAt: "2026-07-04T12:01:00.000Z",
          status: "verified" as const,
          detail: "ok",
          cid: `bafy-${id}`,
          jobId: `job-${id}`,
          payloadHash: hash,
          byteLength: 2,
        },
      ],
      verifyPolls: 2,
      verifyPollLog: [
        { attempt: 1, checkedAt: "2026-07-04T12:00:00.000Z", status: "pending" as const, proofStatus: "draft" as const, detail: "pending" },
        { attempt: 2, checkedAt: "2026-07-04T12:01:00.000Z", status: "verified" as const, proofStatus: "verified" as const, detail: "ok", cid: `bafy-${id}` },
      ],
      proof: {
        mode: "real" as const,
        cid: `bafy-${id}`,
        pieceCid: `piece-${id}`,
        provider: "synapse-provider",
        dataSetId: `dataset-${id}`,
        proofStatus: "verified" as const,
        payloadHash: hash,
        byteLength: 2,
      },
      ...patch,
    });
    const artifact = buildFilecoinTargetSealArtifact({
      ready: true,
      dryRun: false,
      endpoint: env.VITE_FILECOIN_SEAL_API,
      productionReady: true,
      targets: [
        target("record", "record", "a".repeat(64), {
          uploadStatusLog: [
            {
              attempt: 1,
              checkedAt: "2026-07-04T12:00:00.000Z",
              status: "verified" as const,
              detail: "wrong payload",
              cid: "bafy-record",
              jobId: "job-record",
              payloadHash: "f".repeat(64),
              byteLength: 2,
            },
          ],
        }),
        target("mode", "mode-1", "b".repeat(64)),
        target("mode", "mode-2", "c".repeat(64)),
        target("mode", "mode-3", "d".repeat(64)),
        target("mode", "mode-4", "e".repeat(64)),
      ],
      verifyEnv: "",
      blockers: [],
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.recordSealed).toBe(false);
    expect(artifact.acceptance.modeSealedCount).toBe(4);
    expect(artifact.acceptance.uploadStatusComplete).toBe(false);
    expect(artifact.acceptance.verifyPollingComplete).toBe(true);
    expect(artifact.acceptance.proofReadbackComplete).toBe(true);
  });

  it("does not mark target seal polling complete when earlier poll evidence belongs to another CID", () => {
    const target = (kind: "record" | "mode", id: string, hash: string, patch = {}) => ({
      kind,
      id,
      payload: "{}",
      payloadHash: hash,
      byteLength: 2,
      cid: `bafy-${id}`,
      proofUrl: `https://seal.example/proof/bafy-${id}`,
      cidQueryUrl: `https://seal.example/proof/bafy-${id}`,
      verifyUrl: `https://seal.example/verify?cid=bafy-${id}`,
      backendJobId: `job-${id}`,
      uploadStatusUrl: `https://seal.example/jobs/job-${id}`,
      uploadStatusPolls: 2,
      uploadStatusLog: [
        {
          attempt: 1,
          checkedAt: "2026-07-04T12:00:00.000Z",
          status: "running" as const,
          detail: "old CID leaked into this job log",
          cid: "bafy-old",
          jobId: `job-${id}`,
          payloadHash: hash,
          byteLength: 2,
        },
        {
          attempt: 2,
          checkedAt: "2026-07-04T12:01:00.000Z",
          status: "verified" as const,
          detail: "ok",
          cid: `bafy-${id}`,
          jobId: `job-${id}`,
          payloadHash: hash,
          byteLength: 2,
        },
      ],
      verifyPolls: 2,
      verifyPollLog: [
        { attempt: 1, checkedAt: "2026-07-04T12:00:00.000Z", status: "pending" as const, proofStatus: "draft" as const, detail: "old CID leaked into verify log", cid: "bafy-old" },
        { attempt: 2, checkedAt: "2026-07-04T12:01:00.000Z", status: "verified" as const, proofStatus: "verified" as const, detail: "ok", cid: `bafy-${id}` },
      ],
      proof: {
        mode: "real" as const,
        cid: `bafy-${id}`,
        pieceCid: `piece-${id}`,
        provider: "synapse-provider",
        dataSetId: `dataset-${id}`,
        proofStatus: "verified" as const,
        payloadHash: hash,
        byteLength: 2,
      },
      ...patch,
    });
    const artifact = buildFilecoinTargetSealArtifact({
      ready: true,
      dryRun: false,
      endpoint: env.VITE_FILECOIN_SEAL_API,
      productionReady: true,
      targets: [
        target("record", "record", "a".repeat(64)),
        target("mode", "mode-1", "b".repeat(64)),
        target("mode", "mode-2", "c".repeat(64)),
        target("mode", "mode-3", "d".repeat(64)),
        target("mode", "mode-4", "e".repeat(64)),
      ],
      verifyEnv: "",
      blockers: [],
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.recordSealed).toBe(false);
    expect(artifact.acceptance.modeSealedCount).toBe(0);
    expect(artifact.acceptance.uploadStatusComplete).toBe(false);
    expect(artifact.acceptance.verifyPollingComplete).toBe(false);
    expect(artifact.acceptance.proofReadbackComplete).toBe(true);
  });

  it("does not mark target seal polling complete when verify metadata is stale", () => {
    const target = (kind: "record" | "mode", id: string, hash: string, patch = {}) => ({
      kind,
      id,
      payload: "{}",
      payloadHash: hash,
      byteLength: 2,
      cid: `bafy-${id}`,
      proofUrl: `https://seal.example/proof/bafy-${id}`,
      cidQueryUrl: `https://seal.example/proof/bafy-${id}`,
      verifyUrl: `https://seal.example/verify?cid=bafy-${id}`,
      backendJobId: `job-${id}`,
      uploadStatusUrl: `https://seal.example/jobs/job-${id}`,
      uploadStatusPolls: 2,
      uploadStatusLog: [
        {
          attempt: 1,
          checkedAt: "2026-07-04T12:00:00.000Z",
          status: "running" as const,
          detail: "running",
          jobId: `job-${id}`,
          payloadHash: hash,
          byteLength: 2,
        },
        {
          attempt: 2,
          checkedAt: "2026-07-04T12:01:00.000Z",
          status: "verified" as const,
          detail: "ok",
          cid: `bafy-${id}`,
          jobId: `job-${id}`,
          payloadHash: hash,
          byteLength: 2,
        },
      ],
      verifyPolls: 2,
      verifyPollLog: [
        { attempt: 1, checkedAt: "2026-07-04T12:00:00.000Z", status: "pending" as const, proofStatus: "draft" as const, detail: "pending" },
        { attempt: 2, checkedAt: "2026-07-04T12:01:00.000Z", status: "verified" as const, proofStatus: "verified" as const, detail: "ok", cid: `bafy-${id}` },
      ],
      proof: {
        mode: "real" as const,
        cid: `bafy-${id}`,
        pieceCid: `piece-${id}`,
        provider: "synapse-provider",
        dataSetId: `dataset-${id}`,
        proofStatus: "verified" as const,
        payloadHash: hash,
        byteLength: 2,
      },
      ...patch,
    });
    const artifact = buildFilecoinTargetSealArtifact({
      ready: true,
      dryRun: false,
      endpoint: env.VITE_FILECOIN_SEAL_API,
      productionReady: true,
      targets: [
        target("record", "record", "a".repeat(64), {
          verifyPollLog: [
            { attempt: 1, checkedAt: "2026-07-04T12:00:00.000Z", status: "pending" as const, proofStatus: "draft" as const, detail: "pending" },
            {
              attempt: 2,
              checkedAt: "2026-07-04T12:01:00.000Z",
              status: "verified" as const,
              proofStatus: "verified" as const,
              detail: "stale payload metadata",
              cid: "bafy-record",
              payloadHash: "f".repeat(64),
              byteLength: 999,
            },
          ],
        }),
        target("mode", "mode-1", "b".repeat(64)),
        target("mode", "mode-2", "c".repeat(64)),
        target("mode", "mode-3", "d".repeat(64)),
        target("mode", "mode-4", "e".repeat(64)),
      ],
      verifyEnv: "",
      blockers: [],
    });

    expect(artifact.ready).toBe(false);
    expect(artifact.acceptance.recordSealed).toBe(false);
    expect(artifact.acceptance.modeSealedCount).toBe(4);
    expect(artifact.acceptance.uploadStatusComplete).toBe(true);
    expect(artifact.acceptance.verifyPollingComplete).toBe(false);
    expect(artifact.acceptance.proofReadbackComplete).toBe(true);
  });

  it("fails target sealing when verification returns stale payload metadata", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const jobBodies = new Map<string, string>();
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body?.toString() });
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url === "https://seal.example/seal?async=1") {
        const { sha256 } = await import("./proof");
        const body = init?.body?.toString() ?? "";
        const isMode = body.includes('"modeRun"');
        const modeId = isMode ? JSON.parse(body).modeRun.id as string : "";
        const jobId = isMode ? `seal-job-${modeId}` : "seal-job-record-stale-verify";
        const cid = isMode ? `bafy-${modeId}` : "bafy-record-stale-verify";
        jobBodies.set(jobId, body);
        return jsonResponse({
          jobId,
          status: "verified",
          statusUrl: `/jobs/${jobId}`,
          proof: {
            cid,
            proofStatus: "retrievable",
            payloadHash: await sha256(body),
            byteLength: new TextEncoder().encode(body).byteLength,
          },
        }, 202);
      }
      if (url.startsWith("https://seal.example/jobs/seal-job-")) {
        const jobId = url.split("/").pop() ?? "";
        const uploadBody = jobBodies.get(jobId) ?? "";
        const isMode = uploadBody.includes('"modeRun"');
        const modeId = isMode ? JSON.parse(uploadBody).modeRun.id as string : "";
        const cid = isMode ? `bafy-${modeId}` : "bafy-record-stale-verify";
        const { sha256 } = await import("./proof");
        return jsonResponse({
          jobId,
          status: "verified",
          proof: {
            cid,
            proofStatus: "retrievable",
            payloadHash: await sha256(uploadBody),
            byteLength: new TextEncoder().encode(uploadBody).byteLength,
          },
        });
      }
      if (url === "https://seal.example/verify?cid=bafy-record-stale-verify") {
        return jsonResponse({
          cid: "bafy-record-stale-verify",
          proofStatus: "verified",
          payloadHash: "f".repeat(64),
          byteLength: 999,
        });
      }
      if (url.startsWith("https://seal.example/verify?cid=bafy-mode-")) {
        const cid = new URL(url).searchParams.get("cid");
        return jsonResponse({ cid, proofStatus: "verified" });
      }
      if (url.startsWith("https://seal.example/proof/bafy-mode-")) {
        const cid = url.split("/").pop() ?? "";
        const jobId = `seal-job-${cid.replace(/^bafy-/, "")}`;
        const body = jobBodies.get(jobId) ?? "";
        const { sha256 } = await import("./proof");
        return jsonResponse({
          cid,
          mode: "real",
          pieceCid: `piece-${cid}`,
          provider: "synapse-provider",
          dataSetId: `dataset-${cid}`,
          proofStatus: "verified",
          payloadHash: await sha256(body),
          byteLength: new TextEncoder().encode(body).byteLength,
        });
      }
      if (url.startsWith("https://seal.example/proof/")) {
        return jsonResponse({ error: "proof registry should not be read after stale verify metadata" }, 500);
      }
      return jsonResponse({ error: "unexpected" }, 404);
    });

    await expect(
      buildFilecoinTargetSealReport(env, {
        fetcher: fetcher as any,
        now: "2026-07-03T00:00:00.000Z",
        pollDelayMs: 0,
        maxVerifyPolls: 1,
      }),
    ).rejects.toThrow("record verify payload metadata mismatch");
    expect(calls.some((call) => call.url === "https://seal.example/proof/bafy-record-stale-verify")).toBe(false);
  });

  it("does not submit seal jobs when production share images are not public bitmap URLs", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      return jsonResponse({ error: "unexpected" }, 404);
    });

    const report = await buildFilecoinTargetSealReport(
      {
        ...env,
        KICKOFF_SEED_SHARE_IMAGE_URL: "http://cdn.example.com/record-share.png",
        KICKOFF_SEED_MODE_SHARE_IMAGE_URL: "https://cdn.example.com/mode-share.svg",
      },
      {
        fetcher: fetcher as any,
        now: "2026-07-03T00:00:00.000Z",
      },
    );

    expect(report.ready).toBe(false);
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        "Record share image URL must be a public HTTPS URL",
        "Mode share image URL must point to a PNG, JPEG or WebP image path",
      ]),
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(report.targets.every((target) => !target.cid)).toBe(true);
  });

  it("keeps the report unready when health is mock or memory-only", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      if (url === "https://seal.example/health") {
        return jsonResponse({
          ...productionHealth,
          mockMode: true,
          productionReady: false,
          persistence: "memory",
          blockers: ["FILECOIN_SEAL_MOCK is enabled", "FILECOIN_PROOF_STORE_PATH is missing"],
        });
      }
      if (url === "https://seal.example/seal") return jsonResponse({ cid: init?.body?.toString().includes('"modeRun"') ? "bafy-mode" : "bafy-record" });
      if (url.includes("/verify")) return jsonResponse({ proofStatus: "verified" });
      if (url.includes("/proof/")) return jsonResponse({ cid: url.endsWith("bafy-mode") ? "bafy-mode" : "bafy-record" });
      return jsonResponse({ error: "unexpected" }, 404);
    });

    const report = await buildFilecoinTargetSealReport(env, {
      fetcher: fetcher as any,
      now: "2026-07-03T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.productionReady).toBe(false);
    expect(report.targets.every((target) => !target.cid)).toBe(true);
    expect(report.blockers).toEqual(
      expect.arrayContaining(["FILECOIN_SEAL_MOCK is enabled", "FILECOIN_PROOF_STORE_PATH is missing"]),
    );
    expect(calls).toEqual([{ method: "GET", url: "https://seal.example/health" }]);
    expect(fetcher).not.toHaveBeenCalledWith("https://seal.example/seal", expect.anything());
  });
});
