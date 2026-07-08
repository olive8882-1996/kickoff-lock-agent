import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { canResumeFilecoinSealJob, lookupFilecoinProof, runSealJob, sealApiHeaders, sealApiUrl } from "./filecoinSeal";
import { buildFilecoinSealResumeReadiness } from "./filecoinSealJobChecks";
import type { GameModeRun, MemoryRecord, SealJob } from "./types";

const record: MemoryRecord = {
  capsule: {
    id: "cap-seal",
    matchId: "m1",
    matchLabel: "A vs B",
    kickoffAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2098-12-31T00:00:00.000Z",
    sealedAt: "2098-12-31T00:00:00.000Z",
    locked: true,
    lateLock: false,
    payloadHash: "a".repeat(64),
    filecoinProof: {
      mode: "demo",
      cid: "bafy",
      pieceCid: "piece",
      provider: "demo",
      dataSetId: "set",
      proofStatus: "retrievable",
    },
    prediction: {
      homeScore: 1,
      awayScore: 0,
      winner: "A",
      keyPlayers: [],
      confidence: 55,
      style: "analysis",
      reasoning: "Reasoning",
      agentSummary: "Summary",
      markets: [],
    },
  },
};

const modeRun: GameModeRun = {
  id: "mode-parlay-seal",
  modeId: "parlay",
  title: "Multi-match parlay",
  createdAt: "2099-01-01T00:00:00.000Z",
  capsuleIds: ["cap-one", "cap-two", "cap-three"],
  payloadHash: "b".repeat(64),
  filecoinProof: {
    mode: "demo",
    cid: "bafy-mode-demo",
    pieceCid: "piece-mode-demo",
    provider: "demo",
    dataSetId: "mode-set",
    proofStatus: "retrievable",
  },
  status: "sealed",
  summary: "Mode proof sealed.",
  requirements: ["3 sealed match capsules"],
};

const resumableJob = (patch: Partial<SealJob> = {}): SealJob => ({
  id: "seal-resume-local",
  capsuleId: "cap-seal",
  status: "failed",
  startedAt: "2099-01-01T00:00:00.000Z",
  updatedAt: "2099-01-01T00:01:00.000Z",
  endpoint: "https://seal.example/seal",
  healthStatus: "ready",
  backendJobId: "seal-job-resume-1",
  uploadStatusUrl: "https://seal.example/jobs/seal-job-resume-1",
  uploadStatusPolls: 1,
  uploadStatusLog: [
    {
      attempt: 1,
      checkedAt: "2099-01-01T00:01:00.000Z",
      status: "failed",
      httpStatus: 503,
      detail: "temporary upstream outage",
      jobId: "seal-job-resume-1",
    },
  ],
  uploadPayloadHash: "c".repeat(64),
  uploadByteLength: 123,
  steps: [
    { id: "payload", label: "Build immutable payload", status: "passed", detail: "payload ready" },
    { id: "health", label: "Check seal API health", status: "passed", detail: "health ready" },
    { id: "upload", label: "Upload through Synapse", status: "failed", detail: "temporary upstream outage" },
    { id: "deal", label: "Storage deal accepted", status: "queued", detail: "waiting" },
    { id: "poll", label: "Poll retrievability", status: "queued", detail: "waiting" },
    { id: "registry", label: "Read proof registry", status: "queued", detail: "waiting" },
    { id: "verify", label: "Attach proof", status: "queued", detail: "waiting" },
  ],
  error: "temporary upstream outage",
  ...patch,
});

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

describe("Filecoin seal workflow", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("marks workflow as needing configuration when no seal API exists", async () => {
    const updated = await runSealJob(record);
    expect(updated.sealJob?.status).toBe("needs-config");
    expect(updated.sealJob?.steps.some((step) => step.status === "needs-config")).toBe(true);
  });

  it("builds proof and verify URLs from a seal endpoint", () => {
    expect(sealApiUrl("health", undefined, "https://seal.example/seal")).toBe("https://seal.example/health");
    expect(sealApiUrl("verify", "bafy123", "https://seal.example/seal")).toBe(
      "https://seal.example/verify?cid=bafy123",
    );
    expect(sealApiUrl("proof", "bafy123", "https://seal.example/seal")).toBe(
      "https://seal.example/proof/bafy123",
    );
  });

  it("adds a bearer token to configured seal API upload headers", () => {
    expect(sealApiHeaders({ "Content-Type": "application/json" }, "secret-token")).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer secret-token",
    });
    expect(sealApiHeaders({ "Content-Type": "application/json" }, undefined)).toEqual({
      "Content-Type": "application/json",
    });
  });

  it("uses deployed runtime config for seal URLs and bearer headers", () => {
    vi.stubGlobal("window", {
      location: { href: "https://example.com/kickoff-lock-agent/" },
      __KICKOFF_RUNTIME_CONFIG__: {
        VITE_FILECOIN_SEAL_API: "https://runtime-seal.example/seal",
        VITE_FILECOIN_SEAL_TOKEN: "runtime-token",
      },
    });

    expect(sealApiUrl("health")).toBe("https://runtime-seal.example/health");
    expect(sealApiUrl("verify", "bafy-runtime")).toBe("https://runtime-seal.example/verify?cid=bafy-runtime");
    expect(sealApiHeaders()).toEqual({ Authorization: "Bearer runtime-token" });
  });

  it("uses same-origin runtime config for seal URLs when mounted at /seal", () => {
    vi.stubGlobal("window", {
      location: { href: "https://example.com/kickoff-lock-agent/" },
      __KICKOFF_RUNTIME_CONFIG__: {
        VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
        VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
        VITE_FILECOIN_SEAL_TOKEN: "runtime-token",
      },
    });

    expect(sealApiUrl("health")).toBe("https://example.com/health");
    expect(sealApiUrl("seal")).toBe("https://example.com/seal");
    expect(sealApiUrl("proof", "bafy-runtime")).toBe("https://example.com/proof/bafy-runtime");
    expect(sealApiHeaders()).toEqual({ Authorization: "Bearer runtime-token" });
  });

  it("reports needs-config for CID lookup without a seal API", async () => {
    const result = await lookupFilecoinProof("bafy123");
    expect(result.status).toBe("needs-config");
    expect(result.message).toContain("VITE_FILECOIN_SEAL_API");
  });

  it("detects resumable async seal jobs only when upload metadata and an endpoint exist", () => {
    expect(canResumeFilecoinSealJob(resumableJob(), "https://seal.example/seal")).toBe(true);
    expect(canResumeFilecoinSealJob(resumableJob({ status: "verified" }), "https://seal.example/seal")).toBe(false);
    expect(canResumeFilecoinSealJob(resumableJob({ backendJobId: undefined }), "https://seal.example/seal")).toBe(false);
    expect(canResumeFilecoinSealJob(resumableJob(), undefined)).toBe(false);
  });

  it("does not resume interrupted seal jobs with stale upload or verification evidence", () => {
    const staleUpload = buildFilecoinSealResumeReadiness(
      resumableJob({
        uploadStatusLog: [
          {
            attempt: 1,
            checkedAt: "2099-01-01T00:01:00.000Z",
            status: "running",
            detail: "old job still running",
            jobId: "different-job",
            cid: "bafy-different",
            payloadHash: "d".repeat(64),
            byteLength: 999,
          },
        ],
        proof: {
          mode: "real",
          cid: "bafy-resume",
          pieceCid: "piece-resume",
          provider: "seal-api",
          dataSetId: "set-resume",
          proofStatus: "retrievable",
          payloadHash: "c".repeat(64),
          byteLength: 123,
        },
      }),
      "https://seal.example/seal",
    );
    const stalePoll = buildFilecoinSealResumeReadiness(
      resumableJob({
        proof: {
          mode: "real",
          cid: "bafy-resume",
          pieceCid: "piece-resume",
          provider: "seal-api",
          dataSetId: "set-resume",
          proofStatus: "retrievable",
          payloadHash: "c".repeat(64),
          byteLength: 123,
        },
        pollLog: [
          {
            attempt: 1,
            checkedAt: "2099-01-01T00:02:00.000Z",
            status: "pending",
            proofStatus: "missing",
            detail: "different CID pending",
            cid: "bafy-old",
          },
        ],
      }),
      "https://seal.example/seal",
    );

    expect(staleUpload).toMatchObject({ canResume: false, risk: "metadata-missing" });
    expect(staleUpload.blockers).toEqual(expect.arrayContaining([
      "upload status log contains a stale backend job id",
      "upload status log contains a stale CID",
      "upload status log contains a stale payload hash",
      "upload status log contains a stale byte length",
    ]));
    expect(stalePoll).toMatchObject({ canResume: false, risk: "metadata-missing" });
    expect(stalePoll.blockers).toContain("verification poll log contains a stale CID");
  });

  it("explains why interrupted seal jobs can or cannot resume", () => {
    const ready = buildFilecoinSealResumeReadiness(resumableJob(), "https://seal.example/seal");
    expect(ready).toMatchObject({
      canResume: true,
      risk: "ready",
      nextAction: "poll-upload-status",
      blockers: [],
    });
    expect(ready.nextActionDetail).toContain("seal-job-resume-1");
    expect(ready.evidence).toEqual(expect.arrayContaining(["backend job seal-job-resume-1", "payload hash captured"]));

    const missingHash = buildFilecoinSealResumeReadiness(
      resumableJob({ uploadPayloadHash: undefined }),
      "https://seal.example/seal",
    );
    expect(missingHash).toMatchObject({
      canResume: false,
      risk: "metadata-missing",
      nextAction: "restore-upload-metadata",
    });
    expect(missingHash.blockers).toContain("uploaded payload hash is missing");

    const missingEndpoint = buildFilecoinSealResumeReadiness(resumableJob(), undefined);
    expect(missingEndpoint).toMatchObject({
      canResume: false,
      risk: "needs-config",
      nextAction: "configure-seal-endpoint",
    });

    const complete = buildFilecoinSealResumeReadiness(resumableJob({ status: "verified" }), "https://seal.example/seal");
    expect(complete).toMatchObject({
      canResume: false,
      risk: "already-complete",
      nextAction: "complete",
    });
  });

  it("classifies the exact next Filecoin resume stage from saved evidence", () => {
    const uploadVerifiedJob = resumableJob({
      proof: {
        mode: "real",
        cid: "bafy-resume",
        pieceCid: "piece-resume",
        provider: "seal-api",
        dataSetId: "set-resume",
        proofStatus: "retrievable",
        payloadHash: "c".repeat(64),
        byteLength: 123,
      },
      uploadStatusPolls: 2,
      uploadStatusLog: [
        {
          attempt: 1,
          checkedAt: "2099-01-01T00:01:00.000Z",
          status: "running",
          detail: "seal job running",
          jobId: "seal-job-resume-1",
        },
        {
          attempt: 2,
          checkedAt: "2099-01-01T00:02:00.000Z",
          status: "verified",
          detail: "seal job returned CID",
          jobId: "seal-job-resume-1",
          cid: "bafy-resume",
          payloadHash: "c".repeat(64),
          byteLength: 123,
        },
      ],
    });

    expect(buildFilecoinSealResumeReadiness(uploadVerifiedJob, "https://seal.example/seal")).toMatchObject({
      canResume: true,
      nextAction: "poll-verification-status",
    });

    const verificationVerifiedJob = resumableJob({
      ...uploadVerifiedJob,
      pollAttempts: 2,
      pollLog: [
        {
          attempt: 1,
          checkedAt: "2099-01-01T00:03:00.000Z",
          status: "pending",
          proofStatus: "missing",
          detail: "CID not retrievable yet",
          cid: "bafy-resume",
        },
        {
          attempt: 2,
          checkedAt: "2099-01-01T00:04:00.000Z",
          status: "verified",
          proofStatus: "verified",
          detail: "CID retrievable",
          cid: "bafy-resume",
          payloadHash: "c".repeat(64),
          byteLength: 123,
        },
      ],
    });

    expect(buildFilecoinSealResumeReadiness(verificationVerifiedJob, "https://seal.example/seal")).toMatchObject({
      canResume: true,
      nextAction: "read-proof-registry",
    });
  });

  it("builds a startup resume queue for pending record and mode seal jobs", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.resetModules();
    const { buildFilecoinSealResumeQueue } = await import("./filecoinSeal");

    const queue = buildFilecoinSealResumeQueue(
      [
        { ...record, sealJob: resumableJob({ status: "running" }) },
        { ...record, capsule: { ...record.capsule, id: "cap-verified" }, sealJob: resumableJob({ status: "verified" }) },
      ],
      [
        {
          ...modeRun,
          sealJob: resumableJob({
            capsuleId: modeRun.id,
            backendJobId: "seal-job-mode-resume",
            uploadStatusUrl: "https://seal.example/jobs/seal-job-mode-resume",
            uploadPayloadHash: "d".repeat(64),
            uploadByteLength: 456,
            uploadStatusLog: [
              {
                attempt: 1,
                checkedAt: "2099-01-01T00:01:00.000Z",
                status: "failed",
                httpStatus: 503,
                detail: "temporary upstream outage",
                jobId: "seal-job-mode-resume",
              },
            ],
            proof: {
              mode: "real",
              cid: "bafy-resume-mode",
              pieceCid: "piece-resume-mode",
              provider: "seal-api",
              dataSetId: "set-resume-mode",
              proofStatus: "retrievable",
              payloadHash: "d".repeat(64),
              byteLength: 456,
            },
          }),
        },
      ],
    );

    expect(queue).toEqual([
      expect.objectContaining({
        kind: "record",
        artifactId: "cap-seal",
        backendJobId: "seal-job-resume-1",
        status: "running",
        canResume: true,
        risk: "ready",
        nextAction: "poll-upload-status",
        nextActionDetail: expect.stringContaining("seal-job-resume-1"),
        evidence: expect.arrayContaining(["backend job seal-job-resume-1", "payload hash captured"]),
      }),
      expect.objectContaining({
        kind: "mode",
        artifactId: "mode-parlay-seal",
        backendJobId: "seal-job-mode-resume",
        uploadStatusUrl: "https://seal.example/jobs/seal-job-mode-resume",
        uploadStatusPolls: 1,
      }),
    ]);
  });

  it("reports missing when the seal API has no registered proof for the CID", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: false, proofStatus: "draft" }, 404)),
    );
    const { lookupFilecoinProof: lookupConfiguredProof } = await import("./filecoinSeal");

    const result = await lookupConfiguredProof("bafy-unknown");

    expect(result.status).toBe("missing");
    expect(result.message).toContain("No proof metadata");
  });

  it("uses the configured bearer token for CID proof and verify lookups", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubEnv("VITE_FILECOIN_SEAL_TOKEN", "seal-token");
    const calls: Array<{ url: string; headers?: HeadersInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, headers: init?.headers });
        if (url === "https://seal.example/proof/bafy-tokenized") {
          return jsonResponse({
            cid: "bafy-tokenized",
            pieceCid: "baga-tokenized",
            provider: "synapse-provider",
            dataSetId: "dataset-tokenized",
            proofStatus: "retrievable",
            payloadHash: "a".repeat(64),
            byteLength: 1024,
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-tokenized") {
          return jsonResponse({
            cid: "bafy-tokenized",
            pieceCid: "baga-tokenized",
            provider: "synapse-provider",
            dataSetId: "dataset-tokenized",
            proofStatus: "verified",
            checkedAt: "2099-01-01T00:00:00.000Z",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { lookupFilecoinProof: lookupConfiguredProof } = await import("./filecoinSeal");

    const result = await lookupConfiguredProof("bafy-tokenized");

    expect(result.status).toBe("found");
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => (call.headers as Record<string, string>)?.Authorization === "Bearer seal-token")).toBe(true);
  });

  it("rejects CID lookup proof metadata with placeholder provider fields", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "https://seal.example/proof/bafy-placeholder") {
          return jsonResponse({
            cid: "bafy-placeholder",
            pieceCid: "baga-placeholder",
            provider: "seal-api-provider",
            dataSetId: "seal-api-dataset",
            proofStatus: "verified",
            payloadHash: "a".repeat(64),
            byteLength: 1024,
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-placeholder") {
          return jsonResponse({
            cid: "bafy-placeholder",
            proofStatus: "verified",
            checkedAt: "2099-01-01T00:00:00.000Z",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { lookupFilecoinProof: lookupConfiguredProof } = await import("./filecoinSeal");

    const result = await lookupConfiguredProof("bafy-placeholder");

    expect(result.status).toBe("error");
    expect(result.proof).toBeUndefined();
    expect(result.message).toContain("not production-ready");
    expect(result.message).toContain("provider looks like mock, demo or placeholder data");
  });

  it("rejects CID lookup proof metadata when the proof registry returns a different CID", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "https://seal.example/proof/bafy-requested") {
          return jsonResponse({
            cid: "bafy-other",
            proofStatus: "verified",
            payloadHash: "a".repeat(64),
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-requested") {
          return jsonResponse({
            cid: "bafy-requested",
            proofStatus: "verified",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { lookupFilecoinProof: lookupConfiguredProof } = await import("./filecoinSeal");

    const result = await lookupConfiguredProof("bafy-requested");

    expect(result.status).toBe("error");
    expect(result.proof).toBeUndefined();
    expect(result.message).toContain("metadata mismatch");
    expect(result.message).toContain("/proof/:cid returned bafy-other");
  });

  it("rejects CID lookup proof metadata when verify returns a different CID", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "https://seal.example/proof/bafy-requested") {
          return jsonResponse({
            cid: "bafy-requested",
            proofStatus: "retrievable",
            payloadHash: "a".repeat(64),
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-requested") {
          return jsonResponse({
            cid: "bafy-other",
            proofStatus: "verified",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { lookupFilecoinProof: lookupConfiguredProof } = await import("./filecoinSeal");

    const result = await lookupConfiguredProof("bafy-requested");

    expect(result.status).toBe("error");
    expect(result.proof).toBeUndefined();
    expect(result.message).toContain("/verify returned bafy-other");
  });

  it("requires CID lookup to read back the verify endpoint before attaching proof metadata", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "https://seal.example/proof/bafy-proof-only") {
          return jsonResponse({
            cid: "bafy-proof-only",
            pieceCid: "baga-proof-only",
            provider: "synapse-provider",
            dataSetId: "dataset-proof-only",
            proofStatus: "verified",
            payloadHash: "a".repeat(64),
            byteLength: 1024,
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-proof-only") {
          return jsonResponse({ error: "not indexed" }, 404);
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { lookupFilecoinProof: lookupConfiguredProof } = await import("./filecoinSeal");

    const result = await lookupConfiguredProof("bafy-proof-only");

    expect(result.status).toBe("error");
    expect(result.proof).toBeUndefined();
    expect(result.message).toContain("Verify lookup returned 404");
  });

  it("rejects CID lookup proof metadata when proof and verify hashes conflict", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "https://seal.example/proof/bafy-requested") {
          return jsonResponse({
            cid: "bafy-requested",
            proofStatus: "retrievable",
            payloadHash: "a".repeat(64),
            byteLength: 1234,
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-requested") {
          return jsonResponse({
            cid: "bafy-requested",
            proofStatus: "verified",
            payloadHash: "b".repeat(64),
            byteLength: 1234,
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { lookupFilecoinProof: lookupConfiguredProof } = await import("./filecoinSeal");

    const result = await lookupConfiguredProof("bafy-requested");

    expect(result.status).toBe("error");
    expect(result.proof).toBeUndefined();
    expect(result.message).toContain("payload hashes do not match");
  });

  it("runs configured one-click sealing through health, upload and verification polling", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? "GET", body: init?.body?.toString() });
        if (url === "https://seal.example/health") {
          return jsonResponse({
            ok: true,
            service: "kickoff-lock-filecoin-seal-api",
            mockMode: false,
            hasPrivateKey: true,
            authRequired: true,
            productionReady: true,
            blockers: [],
            proofCount: 4,
            persistence: "file",
            maxUploadBytes: 262144,
          });
        }
        if (url === "https://seal.example/seal?async=1") {
          const payloadHash = sha256Hex(init?.body?.toString() ?? "");
          return jsonResponse({
            ok: true,
            jobId: "seal-job-real-1",
            status: "running",
            statusUrl: "/jobs/seal-job-real-1",
            retrievalUrl: "https://cid.ipfs.tech/#bafy-real-1234567890",
            payloadHash,
            byteLength: init?.body?.toString().length,
          }, 202);
        }
        if (url === "https://seal.example/jobs/seal-job-real-1") {
          const uploadBody = calls.find((call) => call.method === "POST")?.body ?? "";
          const payloadHash = sha256Hex(uploadBody);
          return jsonResponse({
            ok: true,
            jobId: "seal-job-real-1",
            status: "verified",
            proof: {
              cid: "bafy-real-1234567890",
              pieceCid: "baga-real-1234567890",
              provider: "synapse-provider",
              dataSetId: "dataset-1",
              proofStatus: "retrievable",
              retrievalUrl: "https://cid.ipfs.tech/#bafy-real-1234567890",
              payloadHash,
              byteLength: uploadBody.length,
            },
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-real-1234567890") {
          return jsonResponse({
            cid: "bafy-real-1234567890",
            pieceCid: "baga-real-1234567890",
            provider: "synapse-provider",
            dataSetId: "dataset-1",
            proofStatus: "verified",
            checkedAt: "2099-01-01T00:00:00.000Z",
          });
        }
        if (url === "https://seal.example/proof/bafy-real-1234567890") {
          const payloadHash = sha256Hex(calls.find((call) => call.method === "POST")?.body ?? "");
          return jsonResponse({
            cid: "bafy-real-1234567890",
            pieceCid: "baga-real-1234567890",
            provider: "synapse-provider",
            dataSetId: "dataset-1",
            proofStatus: "verified",
            retrievalUrl: "https://cid.ipfs.tech/#bafy-real-1234567890",
            payloadHash,
            byteLength: calls.find((call) => call.method === "POST")?.body?.length,
            checkedAt: "2099-01-01T00:01:00.000Z",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://seal.example/health",
      "POST https://seal.example/seal?async=1",
      "GET https://seal.example/jobs/seal-job-real-1",
      "GET https://seal.example/verify?cid=bafy-real-1234567890",
      "GET https://seal.example/proof/bafy-real-1234567890",
    ]);
    expect(calls[1].body).toContain(record.capsule.payloadHash);
    expect(updated.capsule.filecoinProof.mode).toBe("real");
    expect(updated.capsule.filecoinProof.proofStatus).toBe("verified");
    expect(updated.sealJob?.status).toBe("verified");
    expect(updated.sealJob?.backendJobId).toBe("seal-job-real-1");
    expect(updated.sealJob?.uploadStatusPolls).toBe(1);
    expect(updated.sealJob?.healthStatus).toBe("ready");
    expect(updated.sealJob?.backendHealth?.mockMode).toBe(false);
    expect(updated.sealJob?.backendHealth?.hasPrivateKey).toBe(true);
    expect(updated.sealJob?.backendHealth?.authRequired).toBe(true);
    expect(updated.sealJob?.backendHealth?.productionReady).toBe(true);
    expect(updated.sealJob?.backendHealth?.persistence).toBe("file");
    expect(updated.sealJob?.backendHealth?.maxUploadBytes).toBe(262144);
    expect(updated.sealJob?.steps.find((step) => step.id === "health")?.detail).toContain("real Synapse");
    expect(updated.sealJob?.steps.find((step) => step.id === "health")?.detail).toContain("production-ready");
    expect(updated.sealJob?.steps.find((step) => step.id === "health")?.detail).toContain("file proof registry");
    expect(updated.sealJob?.pollAttempts).toBe(1);
    expect(updated.sealJob?.pollLog).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "verified",
        proofStatus: "verified",
        httpStatus: 200,
      }),
    ]);
    expect(updated.sealJob?.uploadPayloadHash).toBe(updated.sealJob?.proof?.payloadHash);
    expect(updated.sealJob?.proofRegistryStatus).toBe("verified");
    expect(updated.sealJob?.proofRegistryHash).toBe(updated.sealJob?.uploadPayloadHash);
    expect(updated.sealJob?.proofRegistryByteLength).toBe(updated.sealJob?.uploadByteLength);
    expect(updated.sealJob?.proofRegistryCheckedAt).toBe("2099-01-01T00:01:00.000Z");
    expect(updated.sealJob?.proof?.byteLength).toBeGreaterThan(0);
    expect(updated.sealJob?.steps.find((step) => step.id === "deal")?.status).toBe("passed");
    expect(updated.sealJob?.steps.find((step) => step.id === "registry")?.status).toBe("passed");
    expect(updated.sealJob?.lastCheckedAt).toBe("2099-01-01T00:00:00.000Z");
    expect(updated.sealJob?.proofUrl).toBe("https://seal.example/proof/bafy-real-1234567890");
    expect(updated.sealJob?.verifyUrl).toBe("https://seal.example/verify?cid=bafy-real-1234567890");
    expect(updated.sealJob?.steps.every((step) => step.status === "passed")).toBe(true);
  });

  it("keeps an auditable polling log when verification is pending before becoming verified", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    let verifyAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://seal.example/health") {
          return jsonResponse({
            ok: true,
            service: "kickoff-lock-filecoin-seal-api",
            mockMode: false,
            hasPrivateKey: true,
            authRequired: true,
            productionReady: true,
            blockers: [],
            proofCount: 8,
            persistence: "file",
            maxUploadBytes: 262144,
          });
        }
        if (url === "https://seal.example/seal?async=1") {
          return jsonResponse(
            {
              ok: true,
              jobId: "seal-job-polling-1",
              status: "running",
              statusUrl: "/jobs/seal-job-polling-1",
              payloadHash: sha256Hex(init?.body?.toString() ?? ""),
              byteLength: init?.body?.toString().length,
            },
            202,
          );
        }
        if (url === "https://seal.example/jobs/seal-job-polling-1") {
          const uploadBody = (globalThis.fetch as any).mock.calls.find((call: any[]) => String(call[0]) === "https://seal.example/seal?async=1")?.[1]?.body?.toString() ?? "";
          return jsonResponse({
            ok: true,
            jobId: "seal-job-polling-1",
            status: "verified",
            proof: {
              cid: "bafy-polling-real",
              pieceCid: "baga-polling-real",
              provider: "synapse-provider",
              dataSetId: "dataset-polling",
              proofStatus: "sealed",
              payloadHash: sha256Hex(uploadBody),
              byteLength: uploadBody.length,
            },
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-polling-real") {
          verifyAttempts += 1;
          return verifyAttempts === 1
            ? jsonResponse({
                cid: "bafy-polling-real",
                proofStatus: "sealed",
                checkedAt: "2099-01-01T00:00:00.000Z",
              })
            : jsonResponse({
                cid: "bafy-polling-real",
                proofStatus: "verified",
                checkedAt: "2099-01-01T00:00:01.000Z",
              });
        }
        if (url === "https://seal.example/proof/bafy-polling-real") {
          const payloadHash = sha256Hex((globalThis.fetch as any).mock.calls.find((call: any[]) => String(call[0]).startsWith("https://seal.example/seal"))?.[1]?.body?.toString() ?? "");
          return jsonResponse({
            cid: "bafy-polling-real",
            pieceCid: "baga-polling-real",
            provider: "synapse-provider",
            dataSetId: "dataset-polling",
            proofStatus: "verified",
            payloadHash,
            checkedAt: "2099-01-01T00:00:02.000Z",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(updated.sealJob?.status).toBe("verified");
    expect(updated.sealJob?.pollAttempts).toBe(2);
    expect(updated.sealJob?.pollLog).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "pending",
        proofStatus: "sealed",
        httpStatus: 200,
      }),
      expect.objectContaining({
        attempt: 2,
        status: "verified",
        proofStatus: "verified",
        httpStatus: 200,
      }),
    ]);
    expect(updated.sealJob?.lastCheckedAt).toBe("2099-01-01T00:00:01.000Z");
  });

  it("polls an async seal upload job before verifying the returned CID", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    let uploadJobPolls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://seal.example/health") {
          return jsonResponse({
            ok: true,
            service: "kickoff-lock-filecoin-seal-api",
            mockMode: false,
            hasPrivateKey: true,
            authRequired: true,
            productionReady: true,
            blockers: [],
            proofCount: 4,
            persistence: "file",
            maxUploadBytes: 262144,
          });
        }
        if (url === "https://seal.example/seal?async=1") {
          const payloadHash = sha256Hex(init?.body?.toString() ?? "");
          return jsonResponse(
            {
              ok: true,
              jobId: "seal-job-async-1",
              status: "running",
              statusUrl: "/jobs/seal-job-async-1",
              payloadHash,
              byteLength: init?.body?.toString().length,
            },
            202,
          );
        }
        if (url === "https://seal.example/jobs/seal-job-async-1") {
          uploadJobPolls += 1;
          const uploadBody = (globalThis.fetch as any).mock.calls.find((call: any[]) => String(call[0]) === "https://seal.example/seal?async=1")?.[1]?.body?.toString() ?? "";
          const payloadHash = sha256Hex(uploadBody);
          return jsonResponse(
            uploadJobPolls === 1
              ? { ok: true, jobId: "seal-job-async-1", status: "running", payloadHash }
              : {
                  ok: true,
                  jobId: "seal-job-async-1",
                  status: "verified",
                  payloadHash,
                  proof: {
                    cid: "bafy-async-real",
                    pieceCid: "baga-async-real",
                    provider: "synapse-provider",
                    dataSetId: "dataset-async",
                    proofStatus: "retrievable",
                    payloadHash,
                    byteLength: uploadBody.length,
                  },
                },
          );
        }
        if (url === "https://seal.example/verify?cid=bafy-async-real") {
          return jsonResponse({
            cid: "bafy-async-real",
            proofStatus: "verified",
            checkedAt: "2099-01-01T00:00:03.000Z",
          });
        }
        if (url === "https://seal.example/proof/bafy-async-real") {
          const uploadBody = (globalThis.fetch as any).mock.calls.find((call: any[]) => String(call[0]) === "https://seal.example/seal?async=1")?.[1]?.body?.toString() ?? "";
          const payloadHash = sha256Hex(uploadBody);
          return jsonResponse({
            cid: "bafy-async-real",
            pieceCid: "baga-async-real",
            provider: "synapse-provider",
            dataSetId: "dataset-async",
            proofStatus: "verified",
            payloadHash,
            byteLength: uploadBody.length,
            checkedAt: "2099-01-01T00:00:04.000Z",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(updated.sealJob?.status).toBe("verified");
    expect(updated.sealJob?.backendJobId).toBe("seal-job-async-1");
    expect(updated.sealJob?.uploadStatusUrl).toBe("https://seal.example/jobs/seal-job-async-1");
    expect(updated.sealJob?.uploadStatusPolls).toBe(2);
    expect(updated.sealJob?.uploadStatusLog?.map((attempt) => attempt.status)).toEqual(["running", "verified"]);
    expect(updated.sealJob?.proof?.cid).toBe("bafy-async-real");
    expect(updated.sealJob?.pollAttempts).toBe(1);
    expect(updated.sealJob?.steps.find((step) => step.id === "upload")?.detail).toContain("seal-job-async-1");
  });

  it("fails async sealing when the seal API skips the upload job status contract", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://seal.example/health") {
          return jsonResponse({
            ok: true,
            service: "kickoff-lock-filecoin-seal-api",
            mockMode: false,
            hasPrivateKey: true,
            authRequired: true,
            productionReady: true,
            blockers: [],
            proofCount: 4,
            persistence: "file",
            maxUploadBytes: 262144,
          });
        }
        if (url === "https://seal.example/seal?async=1") {
          return jsonResponse({
            cid: "bafy-direct-response",
            proofStatus: "verified",
            payloadHash: sha256Hex(init?.body?.toString() ?? ""),
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(updated.capsule.filecoinProof.mode).toBe("demo");
    expect(updated.sealJob?.status).toBe("failed");
    expect(updated.sealJob?.steps.find((step) => step.id === "upload")?.status).toBe("failed");
    expect(updated.sealJob?.error).toContain("jobId");
    expect(updated.sealJob?.pollAttempts).toBeUndefined();
  });

  it("keeps async upload job metadata when job status polling fails", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://seal.example/health") {
          return jsonResponse({
            ok: true,
            service: "kickoff-lock-filecoin-seal-api",
            mockMode: false,
            hasPrivateKey: true,
            authRequired: true,
            productionReady: true,
            blockers: [],
            persistence: "file",
            maxUploadBytes: 262144,
          });
        }
        if (url === "https://seal.example/seal?async=1") {
          return jsonResponse(
            {
              ok: true,
              jobId: "seal-job-status-failed",
              status: "running",
              statusUrl: "/jobs/seal-job-status-failed",
              payloadHash: sha256Hex(init?.body?.toString() ?? ""),
            },
            202,
          );
        }
        if (url === "https://seal.example/jobs/seal-job-status-failed") {
          return jsonResponse({ ok: false, error: "temporary upstream outage" }, 503);
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(updated.capsule.filecoinProof.mode).toBe("demo");
    expect(updated.sealJob?.status).toBe("failed");
    expect(updated.sealJob?.backendJobId).toBe("seal-job-status-failed");
    expect(updated.sealJob?.uploadStatusUrl).toBe("https://seal.example/jobs/seal-job-status-failed");
    expect(updated.sealJob?.uploadStatusPolls).toBe(1);
    expect(updated.sealJob?.uploadStatusLog).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "failed",
        httpStatus: 503,
        detail: "temporary upstream outage",
        jobId: "seal-job-status-failed",
      }),
    ]);
    expect(updated.sealJob?.steps.find((step) => step.id === "upload")?.status).toBe("failed");
    expect(updated.sealJob?.error).toBe("temporary upstream outage");
    expect(updated.sealJob?.uploadPayloadHash).toBeTruthy();
    expect(updated.sealJob?.uploadByteLength).toBeGreaterThan(0);
  });

  it("fails async sealing immediately when the upload job reports a terminal failure status", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(url);
        if (url === "https://seal.example/health") {
          return jsonResponse({
            ok: true,
            service: "kickoff-lock-filecoin-seal-api",
            mockMode: false,
            hasPrivateKey: true,
            authRequired: true,
            productionReady: true,
            blockers: [],
            persistence: "file",
            maxUploadBytes: 262144,
          });
        }
        if (url === "https://seal.example/seal?async=1") {
          return jsonResponse(
            {
              ok: true,
              jobId: "seal-job-terminal-failed",
              status: "running",
              statusUrl: "/jobs/seal-job-terminal-failed",
              payloadHash: sha256Hex(init?.body?.toString() ?? ""),
            },
            202,
          );
        }
        if (url === "https://seal.example/jobs/seal-job-terminal-failed") {
          return jsonResponse({
            ok: false,
            jobId: "seal-job-terminal-failed",
            status: "failed",
            error: "Synapse rejected the upload payload.",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(calls.filter((url) => url === "https://seal.example/jobs/seal-job-terminal-failed")).toHaveLength(1);
    expect(updated.capsule.filecoinProof.mode).toBe("demo");
    expect(updated.sealJob?.status).toBe("failed");
    expect(updated.sealJob?.uploadStatusPolls).toBe(1);
    expect(updated.sealJob?.uploadStatusLog).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "failed",
        httpStatus: 200,
        detail: "Synapse rejected the upload payload.",
        jobId: "seal-job-terminal-failed",
      }),
    ]);
    expect(updated.sealJob?.error).toBe("Synapse rejected the upload payload.");
    expect(updated.sealJob?.steps.find((step) => step.id === "upload")?.status).toBe("failed");
  });

  it("fails async sealing immediately when the upload job status endpoint returns a client error", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(url);
        if (url === "https://seal.example/health") {
          return jsonResponse({
            ok: true,
            service: "kickoff-lock-filecoin-seal-api",
            mockMode: false,
            hasPrivateKey: true,
            authRequired: true,
            productionReady: true,
            blockers: [],
            persistence: "file",
            maxUploadBytes: 262144,
          });
        }
        if (url === "https://seal.example/seal?async=1") {
          return jsonResponse(
            {
              ok: true,
              jobId: "seal-job-rejected",
              status: "running",
              statusUrl: "/jobs/seal-job-rejected",
              payloadHash: sha256Hex(init?.body?.toString() ?? ""),
            },
            202,
          );
        }
        if (url === "https://seal.example/jobs/seal-job-rejected") {
          return jsonResponse({ ok: false, error: "Upload token does not allow this job." }, 403);
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(calls.filter((url) => url === "https://seal.example/jobs/seal-job-rejected")).toHaveLength(1);
    expect(updated.sealJob?.status).toBe("failed");
    expect(updated.sealJob?.uploadStatusPolls).toBe(1);
    expect(updated.sealJob?.uploadStatusLog).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "error",
        httpStatus: 403,
        detail: "Upload token does not allow this job.",
        jobId: "seal-job-rejected",
      }),
    ]);
    expect(updated.sealJob?.error).toBe("Upload token does not allow this job.");
  });

  it("resumes an existing async seal job without re-uploading the capsule payload", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? "GET" });
        if (url === "https://seal.example/jobs/seal-job-resume-1") {
          return jsonResponse({
            ok: true,
            jobId: "seal-job-resume-1",
            status: "verified",
            proof: {
              cid: "bafy-resumed-record",
              pieceCid: "baga-resumed-record",
              provider: "synapse-provider",
              dataSetId: "dataset-resumed",
              proofStatus: "retrievable",
              payloadHash: "c".repeat(64),
              byteLength: 123,
            },
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-resumed-record") {
          return jsonResponse({
            cid: "bafy-resumed-record",
            proofStatus: "verified",
            checkedAt: "2099-01-01T00:02:00.000Z",
          });
        }
        if (url === "https://seal.example/proof/bafy-resumed-record") {
          return jsonResponse({
            cid: "bafy-resumed-record",
            proofStatus: "verified",
            payloadHash: "c".repeat(64),
            byteLength: 123,
            checkedAt: "2099-01-01T00:03:00.000Z",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob({ ...record, sealJob: resumableJob() });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://seal.example/jobs/seal-job-resume-1",
      "GET https://seal.example/verify?cid=bafy-resumed-record",
      "GET https://seal.example/proof/bafy-resumed-record",
    ]);
    expect(updated.capsule.filecoinProof.cid).toBe("bafy-resumed-record");
    expect(updated.sealJob?.status).toBe("verified");
    expect(updated.sealJob?.uploadStatusPolls).toBe(2);
    expect(updated.sealJob?.uploadStatusLog?.map((attempt) => attempt.status)).toEqual(["failed", "verified"]);
    expect(updated.sealJob?.steps.find((step) => step.id === "upload")?.detail).toContain("Resumed seal job");
  });

  it("resumes CID verification directly when upload status already returned a proof", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? "GET" });
        if (url === "https://seal.example/jobs/seal-job-resume-1") {
          return jsonResponse({ ok: false, error: "job status expired" }, 410);
        }
        if (url === "https://seal.example/verify?cid=bafy-resume") {
          return jsonResponse({
            cid: "bafy-resume",
            pieceCid: "baga-resume",
            provider: "synapse-provider",
            dataSetId: "dataset-resume",
            proofStatus: "verified",
            checkedAt: "2099-01-01T00:05:00.000Z",
          });
        }
        if (url === "https://seal.example/proof/bafy-resume") {
          return jsonResponse({
            cid: "bafy-resume",
            pieceCid: "baga-resume",
            provider: "synapse-provider",
            dataSetId: "dataset-resume",
            proofStatus: "verified",
            payloadHash: "c".repeat(64),
            byteLength: 123,
            checkedAt: "2099-01-01T00:06:00.000Z",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob({
      ...record,
      sealJob: resumableJob({
        status: "running",
        proof: {
          mode: "real",
          cid: "bafy-resume",
          pieceCid: "baga-resume",
          provider: "synapse-provider",
          dataSetId: "dataset-resume",
          proofStatus: "retrievable",
          payloadHash: "c".repeat(64),
          byteLength: 123,
        },
        uploadStatusPolls: 2,
        uploadStatusLog: [
          {
            attempt: 1,
            checkedAt: "2099-01-01T00:01:00.000Z",
            status: "running",
            detail: "seal job running",
            jobId: "seal-job-resume-1",
          },
          {
            attempt: 2,
            checkedAt: "2099-01-01T00:02:00.000Z",
            status: "verified",
            detail: "seal job returned CID",
            jobId: "seal-job-resume-1",
            cid: "bafy-resume",
            payloadHash: "c".repeat(64),
            byteLength: 123,
          },
        ],
      }),
    });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://seal.example/verify?cid=bafy-resume",
      "GET https://seal.example/proof/bafy-resume",
    ]);
    expect(updated.capsule.filecoinProof.cid).toBe("bafy-resume");
    expect(updated.sealJob?.status).toBe("verified");
    expect(updated.sealJob?.uploadStatusPolls).toBe(2);
    expect(updated.sealJob?.proofRegistryStatus).toBe("verified");
    expect(updated.sealJob?.steps.find((step) => step.id === "upload")?.detail).toContain("already returned");
  });

  it("runs configured one-click sealing for a tournament mode proof", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? "GET", body: init?.body?.toString() });
        if (url === "https://seal.example/health") {
          return jsonResponse({
            ok: true,
            service: "kickoff-lock-filecoin-seal-api",
            mockMode: false,
            hasPrivateKey: true,
            authRequired: true,
            productionReady: true,
            blockers: [],
            proofCount: 4,
            persistence: "file",
            maxUploadBytes: 262144,
          });
        }
        if (url === "https://seal.example/seal?async=1") {
          const payloadHash = sha256Hex(init?.body?.toString() ?? "");
          return jsonResponse({
            ok: true,
            jobId: "seal-job-mode-1",
            status: "running",
            statusUrl: "/jobs/seal-job-mode-1",
            retrievalUrl: "https://cid.ipfs.tech/#bafy-mode-real-1234567890",
            payloadHash,
            byteLength: init?.body?.toString().length,
          }, 202);
        }
        if (url === "https://seal.example/jobs/seal-job-mode-1") {
          const uploadBody = calls.find((call) => call.method === "POST")?.body ?? "";
          const payloadHash = sha256Hex(uploadBody);
          return jsonResponse({
            ok: true,
            jobId: "seal-job-mode-1",
            status: "verified",
            proof: {
              cid: "bafy-mode-real-1234567890",
              pieceCid: "baga-mode-real-1234567890",
              provider: "synapse-provider",
              dataSetId: "dataset-mode",
              proofStatus: "retrievable",
              retrievalUrl: "https://cid.ipfs.tech/#bafy-mode-real-1234567890",
              payloadHash,
              byteLength: uploadBody.length,
            },
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-mode-real-1234567890") {
          return jsonResponse({
            cid: "bafy-mode-real-1234567890",
            proofStatus: "verified",
            checkedAt: "2099-01-01T00:00:00.000Z",
          });
        }
        if (url === "https://seal.example/proof/bafy-mode-real-1234567890") {
          const payloadHash = sha256Hex(calls.find((call) => call.method === "POST")?.body ?? "");
          return jsonResponse({
            cid: "bafy-mode-real-1234567890",
            pieceCid: "baga-mode-real-1234567890",
            provider: "synapse-provider",
            dataSetId: "dataset-mode",
            proofStatus: "verified",
            payloadHash,
            byteLength: calls.find((call) => call.method === "POST")?.body?.length,
            checkedAt: "2099-01-01T00:01:00.000Z",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runModeSealJob } = await import("./filecoinSeal");

    const updated = await runModeSealJob(modeRun);

    expect(calls[1].body).toContain('"modeRun"');
    expect(calls[1].body).toContain(modeRun.payloadHash);
    expect(calls[1].body).not.toContain('"sealJob"');
    expect(updated.filecoinProof.mode).toBe("real");
    expect(updated.filecoinProof.cid).toBe("bafy-mode-real-1234567890");
    expect(updated.sealJob?.status).toBe("verified");
    expect(updated.sealJob?.pollLog?.[0]).toEqual(expect.objectContaining({ status: "verified" }));
    expect(updated.sealJob?.proofRegistryStatus).toBe("verified");
    expect(updated.sealJob?.proofRegistryHash).toBe(updated.sealJob?.uploadPayloadHash);
    expect(updated.sealJob?.proofRegistryByteLength).toBe(updated.sealJob?.uploadByteLength);
    expect(updated.sealJob?.steps.find((step) => step.id === "verify")?.detail).toContain("Mode proof CID");
  });

  it("resumes an existing async mode seal job without re-uploading the mode proof", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? "GET" });
        if (url === "https://seal.example/jobs/seal-job-mode-resume") {
          return jsonResponse({
            ok: true,
            jobId: "seal-job-mode-resume",
            status: "verified",
            proof: {
              cid: "bafy-resumed-mode",
              pieceCid: "baga-resumed-mode",
              provider: "synapse-provider",
              dataSetId: "dataset-mode-resumed",
              proofStatus: "retrievable",
              payloadHash: "d".repeat(64),
              byteLength: 456,
            },
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-resumed-mode") {
          return jsonResponse({
            cid: "bafy-resumed-mode",
            proofStatus: "verified",
            checkedAt: "2099-01-01T00:02:00.000Z",
          });
        }
        if (url === "https://seal.example/proof/bafy-resumed-mode") {
          return jsonResponse({
            cid: "bafy-resumed-mode",
            proofStatus: "verified",
            payloadHash: "d".repeat(64),
            byteLength: 456,
            checkedAt: "2099-01-01T00:03:00.000Z",
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runModeSealJob } = await import("./filecoinSeal");

    const updated = await runModeSealJob({
      ...modeRun,
      sealJob: resumableJob({
        capsuleId: modeRun.id,
        backendJobId: "seal-job-mode-resume",
        uploadStatusUrl: "https://seal.example/jobs/seal-job-mode-resume",
        uploadPayloadHash: "d".repeat(64),
        uploadByteLength: 456,
        uploadStatusLog: [
          {
            attempt: 1,
            checkedAt: "2099-01-01T00:01:00.000Z",
            status: "failed",
            httpStatus: 503,
            detail: "temporary upstream outage",
            jobId: "seal-job-mode-resume",
          },
        ],
      }),
    });

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://seal.example/jobs/seal-job-mode-resume",
      "GET https://seal.example/verify?cid=bafy-resumed-mode",
      "GET https://seal.example/proof/bafy-resumed-mode",
    ]);
    expect(updated.filecoinProof.cid).toBe("bafy-resumed-mode");
    expect(updated.sealJob?.status).toBe("verified");
    expect(updated.sealJob?.uploadStatusPolls).toBe(2);
    expect(updated.sealJob?.steps.find((step) => step.id === "upload")?.detail).toContain("Resumed seal job");
  });

  it("records seal API production blockers and refuses to attach mock proof metadata", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://seal.example/health") {
          return jsonResponse({
            ok: true,
            mockMode: true,
            hasPrivateKey: false,
            authRequired: false,
            productionReady: false,
            blockers: [
              "FILECOIN_SEAL_MOCK is enabled",
              "SYNAPSE_PRIVATE_KEY is missing",
              "FILECOIN_SEAL_TOKEN is missing",
              "FILECOIN_PROOF_STORE_PATH is missing",
            ],
            persistence: "memory",
            maxUploadBytes: 262144,
          });
        }
        if (url === "https://seal.example/seal?async=1") {
          const payloadHash = sha256Hex(init?.body?.toString() ?? "");
          return jsonResponse({
            ok: true,
            jobId: "seal-job-demo-1",
            status: "running",
            statusUrl: "/jobs/seal-job-demo-1",
            payloadHash,
            byteLength: init?.body?.toString().length,
          }, 202);
        }
        if (url === "https://seal.example/jobs/seal-job-demo-1") {
          const uploadBody = (globalThis.fetch as any).mock.calls.find((call: any[]) => String(call[0]) === "https://seal.example/seal?async=1")?.[1]?.body?.toString() ?? "";
          const payloadHash = sha256Hex(uploadBody);
          return jsonResponse({
            ok: true,
            jobId: "seal-job-demo-1",
            status: "verified",
            proof: {
              cid: "bafy-demo-ready",
              pieceCid: "baga-demo-ready",
              provider: "mock-synapse-provider",
              dataSetId: "mock-dataset",
              proofStatus: "verified",
              payloadHash,
              byteLength: uploadBody.length,
            },
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-demo-ready") {
          return jsonResponse({ cid: "bafy-demo-ready", proofStatus: "verified" });
        }
        if (url === "https://seal.example/proof/bafy-demo-ready") {
          const payloadHash = sha256Hex(init?.body?.toString() ?? "");
          return jsonResponse({
            cid: "bafy-demo-ready",
            proofStatus: "verified",
            payloadHash: sha256Hex((globalThis.fetch as any).mock.calls.find((call: any[]) => String(call[0]).startsWith("https://seal.example/seal"))?.[1]?.body?.toString() ?? ""),
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob, sealBackendProductionReady: isProductionReady } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(updated.capsule.filecoinProof.mode).toBe("demo");
    expect(updated.sealJob?.status).toBe("failed");
    expect(isProductionReady(updated.sealJob?.backendHealth)).toBe(false);
    expect(updated.sealJob?.steps.find((step) => step.id === "health")?.detail).toContain("production blockers");
    expect(updated.sealJob?.steps.find((step) => step.id === "health")?.detail).toContain("FILECOIN_SEAL_MOCK");
    expect(updated.sealJob?.proofRegistryStatus).toBe("failed");
    expect(updated.sealJob?.error).toContain("not production-ready");
  });

  it("fails sealing when verification polling returns a different CID than the upload job", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(url);
        if (url === "https://seal.example/health") {
          return jsonResponse({
            ok: true,
            mockMode: false,
            hasPrivateKey: true,
            authRequired: true,
            productionReady: true,
            blockers: [],
            persistence: "file",
            maxUploadBytes: 262144,
          });
        }
        if (url === "https://seal.example/seal?async=1") {
          return jsonResponse(
            {
              ok: true,
              jobId: "seal-job-verify-cid-mismatch",
              status: "running",
              statusUrl: "/jobs/seal-job-verify-cid-mismatch",
              payloadHash: sha256Hex(init?.body?.toString() ?? ""),
              byteLength: init?.body?.toString().length,
            },
            202,
          );
        }
        if (url === "https://seal.example/jobs/seal-job-verify-cid-mismatch") {
          const uploadBody = (globalThis.fetch as any).mock.calls.find((call: any[]) => String(call[0]) === "https://seal.example/seal?async=1")?.[1]?.body?.toString() ?? "";
          return jsonResponse({
            ok: true,
            jobId: "seal-job-verify-cid-mismatch",
            status: "verified",
            proof: {
              cid: "bafy-uploaded-cid",
              pieceCid: "baga-uploaded-cid",
              provider: "synapse-provider",
              dataSetId: "dataset-verify-cid-mismatch",
              proofStatus: "retrievable",
              payloadHash: sha256Hex(uploadBody),
              byteLength: uploadBody.length,
            },
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-uploaded-cid") {
          return jsonResponse({
            cid: "bafy-other-cid",
            proofStatus: "verified",
            checkedAt: "2099-01-01T00:00:00.000Z",
          });
        }
        if (url.startsWith("https://seal.example/proof/")) {
          return jsonResponse({ error: "proof registry should not be read after verify mismatch" }, 500);
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(updated.capsule.filecoinProof.mode).toBe("demo");
    expect(updated.sealJob?.status).toBe("failed");
    expect(updated.sealJob?.error).toContain("returned CID bafy-other-cid");
    expect(updated.sealJob?.pollAttempts).toBe(1);
    expect(updated.sealJob?.pollLog).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: "error",
        httpStatus: 200,
        detail: expect.stringContaining("expected bafy-uploaded-cid"),
      }),
    ]);
    expect(updated.sealJob?.steps.find((step) => step.id === "poll")?.status).toBe("failed");
    expect(calls.some((url) => url.startsWith("https://seal.example/proof/"))).toBe(false);
  });

  it("fails sealing when the proof registry read-back does not match the uploaded payload", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://seal.example/health") {
          return jsonResponse({ ok: true, mockMode: false, hasPrivateKey: true, persistence: "file", authRequired: true });
        }
        if (url === "https://seal.example/seal?async=1") {
          const payloadHash = sha256Hex(init?.body?.toString() ?? "");
          return jsonResponse({
            ok: true,
            jobId: "seal-job-registry-mismatch",
            status: "running",
            statusUrl: "/jobs/seal-job-registry-mismatch",
            payloadHash,
          }, 202);
        }
        if (url === "https://seal.example/jobs/seal-job-registry-mismatch") {
          const uploadBody = (globalThis.fetch as any).mock.calls.find((call: any[]) => String(call[0]) === "https://seal.example/seal?async=1")?.[1]?.body?.toString() ?? "";
          return jsonResponse({
            ok: true,
            jobId: "seal-job-registry-mismatch",
            status: "verified",
            proof: {
              cid: "bafy-registry-mismatch",
              pieceCid: "baga-registry-mismatch",
              provider: "synapse-provider",
              dataSetId: "dataset-1",
              proofStatus: "retrievable",
              payloadHash: sha256Hex(uploadBody),
              byteLength: uploadBody.length,
            },
          });
        }
        if (url === "https://seal.example/verify?cid=bafy-registry-mismatch") {
          return jsonResponse({
            cid: "bafy-registry-mismatch",
            proofStatus: "verified",
            checkedAt: "2099-01-01T00:00:00.000Z",
          });
        }
        if (url === "https://seal.example/proof/bafy-registry-mismatch") {
          return jsonResponse({
            cid: "bafy-registry-mismatch",
            proofStatus: "verified",
            payloadHash: "0".repeat(64),
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(updated.capsule.filecoinProof.mode).toBe("demo");
    expect(updated.sealJob?.status).toBe("failed");
    expect(updated.sealJob?.proofRegistryStatus).toBe("failed");
    expect(updated.sealJob?.steps.find((step) => step.id === "registry")?.status).toBe("failed");
    expect(updated.sealJob?.error).toContain("Proof registry payload hash");
  });

  it("fails sealing when the seal API returns proof metadata for a different payload", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "https://seal.example/health") {
          return jsonResponse({ ok: true, mockMode: true, persistence: "memory", authRequired: false });
        }
        if (url === "https://seal.example/seal?async=1") {
          return jsonResponse(
            {
              ok: true,
              jobId: "seal-job-wrong-payload",
              status: "running",
              statusUrl: "/jobs/seal-job-wrong-payload",
              payloadHash: sha256Hex("queued-body"),
            },
            202,
          );
        }
        if (url === "https://seal.example/jobs/seal-job-wrong-payload") {
          return jsonResponse({
            ok: true,
            jobId: "seal-job-wrong-payload",
            status: "verified",
            proof: {
              cid: "bafy-wrong-payload",
              pieceCid: "baga-wrong-payload",
              provider: "seal-api-provider",
              dataSetId: "dataset",
              proofStatus: "verified",
              payloadHash: "0".repeat(64),
            },
          });
        }
        return jsonResponse({ error: "unexpected" }, 404);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(updated.capsule.filecoinProof.mode).toBe("demo");
    expect(updated.sealJob?.status).toBe("failed");
    expect(updated.sealJob?.error).toContain("payload hash");
    expect(updated.sealJob?.steps.find((step) => step.id === "deal")?.status).toBe("failed");
  });

  it("stores a failed seal job when the configured backend health check fails", async () => {
    vi.stubEnv("VITE_FILECOIN_SEAL_API", "https://seal.example/seal");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return jsonResponse({ ok: false }, 503);
      }),
    );
    const { runSealJob: runConfiguredSealJob } = await import("./filecoinSeal");

    const updated = await runConfiguredSealJob(record);

    expect(calls).toEqual(["https://seal.example/health"]);
    expect(updated.capsule.filecoinProof.mode).toBe("demo");
    expect(updated.sealJob?.status).toBe("failed");
    expect(updated.sealJob?.healthStatus).toBe("failed");
    expect(updated.sealJob?.error).toContain("503");
    expect(updated.sealJob?.steps.find((step) => step.id === "health")?.status).toBe("failed");
  });
});
