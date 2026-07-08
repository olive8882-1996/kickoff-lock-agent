import { describe, expect, it } from "vitest";
import {
  buildFilecoinSealApiReadinessReport,
  filecoinSealApiEndpointProblem,
  maskSecret,
  publicSealApiReady,
  resolvedPublicSealApi,
} from "./filecoinSealApiReadiness";

const readyEnv = {
  SYNAPSE_PRIVATE_KEY: `0x${"a".repeat(64)}`,
  FILECOIN_SEAL_TOKEN: "seal-token-production-123",
  VITE_FILECOIN_SEAL_TOKEN: "seal-token-production-123",
  FILECOIN_PROOF_STORE_PATH: "./proofs/filecoin-proof-store.json",
  FILECOIN_MAX_UPLOAD_BYTES: "262144",
  FILECOIN_SEAL_MOCK: "0",
  ALLOW_ORIGIN: "https://olive8882-1996.github.io",
  VITE_FILECOIN_SEAL_API: "https://seal.example.com/seal",
  KICKOFF_FILECOIN_SEAL_HEALTH_READY: "1",
  KICKOFF_FILECOIN_SEAL_LIFECYCLE_READY: "1",
};

describe("Filecoin seal API readiness", () => {
  it("passes only when production seal API configuration is complete", () => {
    const report = buildFilecoinSealApiReadinessReport(readyEnv, { proofStoreWritable: true });

    expect(report.ready).toBe(true);
    expect(report.passed).toBe(report.total);
    expect(report.blockers).toEqual([]);
    expect(report.masked.privateKey).toBe("0xaa...aaaa");
    expect(report.masked.sealToken).toBe("seal...-123");
    expect(report.masked.publicSealHealthUrl).toBe("https://seal.example.com/health");
  });

  it("can prove production readiness from a deployed health response instead of manual flags", () => {
    const report = buildFilecoinSealApiReadinessReport(
      {
        ...readyEnv,
        KICKOFF_FILECOIN_SEAL_HEALTH_READY: "",
        KICKOFF_FILECOIN_SEAL_LIFECYCLE_READY: "",
      },
      {
        proofStoreWritable: true,
        healthStatus: 200,
        health: {
          ok: true,
          service: "kickoff-lock-filecoin-seal-api",
          productionReady: true,
          authRequired: true,
          mockMode: false,
          endpoints: ["POST /seal", "POST /seal?async=1", "GET /jobs/:id", "GET /verify?cid=", "GET /proof/:cid"],
        },
      },
    );

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "production-health-response")).toMatchObject({
      passed: true,
    });
    expect(report.checks.find((check) => check.id === "seal-lifecycle-routes")).toMatchObject({
      passed: true,
    });
  });

  it("does not mark the seal API ready without production health and lifecycle route proof", () => {
    const report = buildFilecoinSealApiReadinessReport(
      {
        ...readyEnv,
        KICKOFF_FILECOIN_SEAL_HEALTH_READY: "",
        KICKOFF_FILECOIN_SEAL_LIFECYCLE_READY: "",
      },
      {
        proofStoreWritable: true,
        healthStatus: 200,
        health: {
          ok: true,
          service: "kickoff-lock-filecoin-seal-api",
          productionReady: false,
          authRequired: true,
          mockMode: false,
          endpoints: ["POST /seal", "GET /verify?cid="],
        },
      },
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.map((check) => check.id)).toEqual([
      "production-health-response",
      "seal-lifecycle-routes",
    ]);
    expect(report.checks.find((check) => check.id === "seal-lifecycle-routes")?.detail).toContain("POST /seal?async=1");
  });

  it("blocks mock mode, weak tokens, wildcard CORS and missing public endpoint", () => {
    const report = buildFilecoinSealApiReadinessReport(
      {
        ...readyEnv,
        FILECOIN_SEAL_MOCK: "1",
        FILECOIN_SEAL_TOKEN: "short",
        VITE_FILECOIN_SEAL_TOKEN: "different",
        ALLOW_ORIGIN: "*",
        VITE_FILECOIN_SEAL_API: "http://localhost:8787/seal",
      },
      { proofStoreWritable: true },
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.map((check) => check.id)).toEqual([
      "mock-disabled",
      "server-upload-token",
      "browser-token-match",
      "cors-origin",
      "browser-seal-endpoint",
    ]);
  });

  it("treats truthy mock flags as production blockers", () => {
    const report = buildFilecoinSealApiReadinessReport(
      {
        ...readyEnv,
        FILECOIN_SEAL_MOCK: "true",
      },
      { proofStoreWritable: true },
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.find((check) => check.id === "mock-disabled")).toMatchObject({
      detail: "FILECOIN_SEAL_MOCK=true",
    });
  });

  it("requires the browser seal endpoint to be a deployed HTTPS /seal URL", () => {
    const localReport = buildFilecoinSealApiReadinessReport(
      {
        ...readyEnv,
        VITE_FILECOIN_SEAL_API: "https://localhost:8787/seal",
      },
      { proofStoreWritable: true },
    );
    const wrongPathReport = buildFilecoinSealApiReadinessReport(
      {
        ...readyEnv,
        VITE_FILECOIN_SEAL_API: "https://seal.example.com/status",
      },
      { proofStoreWritable: true },
    );

    expect(localReport.ready).toBe(false);
    expect(localReport.blockers.map((check) => check.id)).toContain("browser-seal-endpoint");
    expect(wrongPathReport.ready).toBe(false);
    expect(wrongPathReport.blockers.map((check) => check.id)).toContain("browser-seal-endpoint");
    expect(publicSealApiReady("https://seal.example.com/seal")).toBe(true);
    expect(filecoinSealApiEndpointProblem("https://seal.example.com/status")).toBe(
      "VITE_FILECOIN_SEAL_API must point to the deployed /seal endpoint",
    );
  });

  it("accepts a same-origin browser seal endpoint when public app URL is deployed HTTPS", () => {
    const env = {
      ...readyEnv,
      VITE_FILECOIN_SEAL_API: "",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      FILECOIN_SEAL_UPSTREAM_URL: "https://seal-origin.example/seal",
    };
    const report = buildFilecoinSealApiReadinessReport(env, { proofStoreWritable: true });

    expect(resolvedPublicSealApi(env)).toBe("https://example.com/seal");
    expect(report.ready).toBe(true);
    expect(report.masked.publicSealApi).toBe("https://example.com/seal");
    expect(report.checks.find((check) => check.id === "browser-seal-endpoint")).toMatchObject({
      passed: true,
      detail: "https://example.com/seal (same-origin)",
    });
    expect(report.checks.find((check) => check.id === "same-origin-seal-upstream")).toMatchObject({
      passed: true,
      detail: "https://seal-origin.example/seal",
    });
  });

  it("auto-selects same-origin seal proxy in Cloudflare Pages builds", () => {
    const env = {
      ...readyEnv,
      VITE_FILECOIN_SEAL_API: "",
      VITE_FILECOIN_SEAL_TOKEN: "",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "",
      VITE_PUBLIC_APP_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      CF_PAGES: "1",
      CF_PAGES_URL: "https://kickoff-lock-agent.pages.dev/",
      FILECOIN_SEAL_UPSTREAM_URL: "https://seal-origin.example/seal",
      ALLOW_ORIGIN: "https://kickoff-lock-agent.pages.dev",
    };
    const report = buildFilecoinSealApiReadinessReport(env, { proofStoreWritable: true });

    expect(resolvedPublicSealApi(env)).toBe("https://kickoff-lock-agent.pages.dev/seal");
    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "browser-token-match")).toMatchObject({
      passed: true,
      label: "Proxy upload token injection",
    });
    expect(report.checks.find((check) => check.id === "browser-seal-endpoint")).toMatchObject({
      passed: true,
      detail: "https://kickoff-lock-agent.pages.dev/seal (same-origin)",
    });
  });

  it("rejects same-origin seal proxy on GitHub Pages because it cannot host Functions", () => {
    const env = {
      ...readyEnv,
      VITE_FILECOIN_SEAL_API: "",
      VITE_FILECOIN_SEAL_TOKEN: "",
      VITE_PUBLIC_APP_URL: "https://olive8882-1996.github.io/kickoff-lock-agent/",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      FILECOIN_SEAL_UPSTREAM_URL: "https://seal-origin.example/seal",
    };
    const report = buildFilecoinSealApiReadinessReport(env, { proofStoreWritable: true });

    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === "browser-seal-endpoint")).toMatchObject({
      passed: false,
      detail:
        "VITE_FILECOIN_SEAL_SAME_ORIGIN cannot use same-origin backend routes on GitHub Pages; deploy Cloudflare Pages Functions or set an external seal API URL.",
    });
  });

  it("does not require exposing VITE_FILECOIN_SEAL_TOKEN when same-origin proxy injects the server token", () => {
    const env = {
      ...readyEnv,
      VITE_FILECOIN_SEAL_API: "",
      VITE_FILECOIN_SEAL_TOKEN: "",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      FILECOIN_SEAL_UPSTREAM_URL: "https://seal-origin.example/seal",
    };
    const report = buildFilecoinSealApiReadinessReport(env, { proofStoreWritable: true });

    expect(report.ready).toBe(true);
    expect(report.checks.find((check) => check.id === "browser-token-match")).toMatchObject({
      passed: true,
      label: "Proxy upload token injection",
      detail: "same-origin proxy injects FILECOIN_SEAL_TOKEN server-side",
    });
  });

  it("requires a trusted upstream when the browser uses a same-origin seal proxy", () => {
    const env = {
      ...readyEnv,
      VITE_FILECOIN_SEAL_API: "",
      VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
      VITE_FILECOIN_SEAL_SAME_ORIGIN: "1",
      FILECOIN_SEAL_UPSTREAM_URL: "",
    };
    const report = buildFilecoinSealApiReadinessReport(env, { proofStoreWritable: true });

    expect(report.ready).toBe(false);
    expect(report.blockers.find((check) => check.id === "same-origin-seal-upstream")).toMatchObject({
      detail: "FILECOIN_SEAL_UPSTREAM_URL missing",
    });
  });

  it("requires a valid 0x private key and writable persistent proof store", () => {
    const report = buildFilecoinSealApiReadinessReport(
      {
        ...readyEnv,
        SYNAPSE_PRIVATE_KEY: "not-a-key",
        FILECOIN_PROOF_STORE_PATH: "./proofs/filecoin-proof-store.json",
      },
      { proofStoreWritable: false },
    );

    expect(report.ready).toBe(false);
    expect(report.blockers.map((check) => check.id)).toContain("synapse-private-key");
    expect(report.blockers.map((check) => check.id)).toContain("proof-store");
  });

  it("masks short and long secrets without leaking the middle", () => {
    expect(maskSecret("short")).toBe("***");
    expect(maskSecret("seal-token-production-123")).toBe("seal...-123");
  });
});
