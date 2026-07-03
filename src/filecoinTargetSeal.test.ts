import { describe, expect, it, vi } from "vitest";
import {
  buildFilecoinTargetPayloads,
  buildFilecoinTargetSealReport,
  filecoinTargetUrl,
} from "./filecoinTargetSeal";

const env = {
  VITE_PUBLIC_APP_URL: "https://example.com/kickoff-lock-agent/",
  VITE_FILECOIN_SEAL_API: "https://seal.example/seal",
  VITE_FILECOIN_SEAL_TOKEN: "seal-token",
  KICKOFF_SEED_USER_ID: "user-prod",
  KICKOFF_SEED_PROOF_ID: "cap-prod",
  KICKOFF_SEED_MODE_ID: "mode-prod",
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

describe("Filecoin production target seal", () => {
  it("builds seal API URLs from the browser endpoint", () => {
    expect(filecoinTargetUrl(env, "health")).toBe("https://seal.example/health");
    expect(filecoinTargetUrl(env, "seal")).toBe("https://seal.example/seal");
    expect(filecoinTargetUrl(env, "verify", "bafy-1")).toBe("https://seal.example/verify?cid=bafy-1");
    expect(filecoinTargetUrl(env, "proof", "bafy-1")).toBe("https://seal.example/proof/bafy-1");
  });

  it("builds deterministic record and mode payloads accepted by the seal API contract", async () => {
    const payloads = await buildFilecoinTargetPayloads(env, "2026-07-03T00:00:00.000Z");

    expect(payloads.record).toMatchObject({ kind: "record", id: "cap-prod" });
    expect(payloads.record.payload).toContain('"capsule"');
    expect(payloads.record.payload).toContain('"result"');
    expect(payloads.record.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(payloads.record.byteLength).toBeGreaterThan(1000);
    expect(payloads.mode).toMatchObject({ kind: "mode", id: "mode-prod" });
    expect(payloads.mode.payload).toContain('"modeRun"');
    expect(payloads.mode.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(payloads.mode.byteLength).toBeGreaterThan(1000);
  });

  it("dry-runs without contacting the seal API and emits payload hashes", async () => {
    const fetcher = vi.fn();
    const report = await buildFilecoinTargetSealReport(
      { VITE_PUBLIC_APP_URL: env.VITE_PUBLIC_APP_URL },
      { dryRun: true, fetcher: fetcher as any, now: "2026-07-03T00:00:00.000Z" },
    );

    expect(report.ready).toBe(false);
    expect(report.blockers).toEqual(expect.arrayContaining(["VITE_FILECOIN_SEAL_API missing", "VITE_FILECOIN_SEAL_TOKEN missing"]));
    expect(report.targets.map((target) => target.kind)).toEqual(["record", "mode"]);
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH=");
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH=");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("seals record and mode targets, verifies registry read-back and emits production env", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body?.toString() });
      expect(init?.headers).toMatchObject({ Authorization: "Bearer seal-token" });
      if (url === "https://seal.example/health") return jsonResponse(productionHealth);
      if (url === "https://seal.example/seal") {
        const kind = init?.body?.toString().includes('"modeRun"') ? "mode" : "record";
        const cid = kind === "mode" ? "bafy-mode-real" : "bafy-record-real";
        return jsonResponse({ cid, proofStatus: "retrievable" });
      }
      if (url === "https://seal.example/verify?cid=bafy-record-real") {
        return jsonResponse({ cid: "bafy-record-real", proofStatus: "verified" });
      }
      if (url === "https://seal.example/proof/bafy-record-real") {
        const body = calls.find((call) => call.method === "POST" && call.body?.includes('"capsule"'))?.body ?? "";
        const { sha256 } = await import("./proof");
        return jsonResponse({
          cid: "bafy-record-real",
          proofStatus: "verified",
          payloadHash: await sha256(body),
          byteLength: new TextEncoder().encode(body).byteLength,
        });
      }
      if (url === "https://seal.example/verify?cid=bafy-mode-real") {
        return jsonResponse({ cid: "bafy-mode-real", proofStatus: "verified" });
      }
      if (url === "https://seal.example/proof/bafy-mode-real") {
        const body = calls.find((call) => call.method === "POST" && call.body?.includes('"modeRun"'))?.body ?? "";
        const { sha256 } = await import("./proof");
        return jsonResponse({
          cid: "bafy-mode-real",
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
    });

    expect(report.ready).toBe(true);
    expect(report.productionReady).toBe(true);
    expect(report.targets.find((target) => target.kind === "record")?.cid).toBe("bafy-record-real");
    expect(report.targets.find((target) => target.kind === "mode")?.cid).toBe("bafy-mode-real");
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FILECOIN_RECORD_CID=bafy-record-real");
    expect(report.verifyEnv).toContain("KICKOFF_VERIFY_FILECOIN_MODE_CID=bafy-mode-real");
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://seal.example/health",
      "POST https://seal.example/seal",
      "POST https://seal.example/seal",
      "GET https://seal.example/verify?cid=bafy-record-real",
      "GET https://seal.example/verify?cid=bafy-mode-real",
      "GET https://seal.example/proof/bafy-record-real",
      "GET https://seal.example/proof/bafy-mode-real",
    ]);
  });

  it("keeps the report unready when health is mock or memory-only", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
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
    expect(report.blockers).toEqual(
      expect.arrayContaining(["FILECOIN_SEAL_MOCK is enabled", "FILECOIN_PROOF_STORE_PATH is missing"]),
    );
  });
});
