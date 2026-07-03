import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

let child: ChildProcess | undefined;
let tempDir: string | undefined;

const getPort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });

const stopServer = async () => {
  if (!child) return;
  const processToStop = child;
  child = undefined;
  if (processToStop.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    processToStop.once("exit", () => resolve());
    processToStop.kill("SIGTERM");
    setTimeout(() => {
      if (processToStop.exitCode === null) processToStop.kill("SIGKILL");
      resolve();
    }, 1500);
  });
};

const waitForHealth = async (baseUrl: string) => {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const res = await fetch(`${baseUrl}/health`).catch(() => undefined);
    if (res?.ok) return res.json() as Promise<Record<string, unknown>>;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Filecoin seal API did not become healthy");
};

const startServer = async (port: number, storePath: string, token?: string, maxUploadBytes?: number) => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FILECOIN_SEAL_MOCK: "1",
    FILECOIN_PROOF_STORE_PATH: storePath,
    FILECOIN_SEAL_TOKEN: token ?? "",
    PORT: String(port),
  };
  if (maxUploadBytes) env.FILECOIN_MAX_UPLOAD_BYTES = String(maxUploadBytes);
  child = spawn("bun", ["server/filecoin-seal-api.mjs"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return waitForHealth(`http://127.0.0.1:${port}`);
};

const sealPayload = (id: string, patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    capsule: {
      id,
      payloadHash: "a".repeat(64),
      locked: true,
      sealedAt: "2099-01-01T00:00:00.000Z",
      prediction: {
        homeScore: 1,
        awayScore: 0,
        winner: "Home",
        confidence: 60,
        reasoning: "Locked prediction payload for Filecoin seal API tests.",
      },
      ...patch,
    },
    result: null,
  });

const modeRunPayload = (id: string, patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    modeRun: {
      id,
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
      ...patch,
    },
  });

describe("Filecoin seal API", () => {
  afterEach(async () => {
    await stopServer();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("persists sealed CID proof metadata across server restarts", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kickoff-filecoin-proof-"));
    const storePath = join(tempDir, "proof-store.json");
    const port = await getPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const payload = sealPayload("cap-api-test");
    const payloadHash = createHash("sha256").update(payload).digest("hex");

    const initialHealth = await startServer(port, storePath);
    expect(initialHealth.persistence).toBe("file");
    expect(initialHealth.maxUploadBytes).toBe(262_144);
    expect(initialHealth.proofCount).toBe(0);
    expect(initialHealth.productionReady).toBe(false);
    expect(initialHealth.blockers).toContain("FILECOIN_SEAL_MOCK is enabled");
    expect(initialHealth.blockers).toContain("SYNAPSE_PRIVATE_KEY is missing");
    expect(initialHealth.blockers).toContain("FILECOIN_SEAL_TOKEN is missing");

    const sealRes = await fetch(`${baseUrl}/seal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    expect(sealRes.ok).toBe(true);
    const proof = (await sealRes.json()) as { cid: string; payloadHash: string; proofStatus: string };
    expect(proof.cid).toContain("bafy-mock-");
    expect(proof.payloadHash).toBe(payloadHash);
    expect(proof.proofStatus).toBe("verified");
    expect(await readFile(storePath, "utf8")).toContain(proof.cid);

    await stopServer();
    const restartedHealth = await startServer(port, storePath);
    expect(restartedHealth.proofCount).toBe(1);

    const lookupRes = await fetch(`${baseUrl}/proof/${encodeURIComponent(proof.cid)}`);
    expect(lookupRes.ok).toBe(true);
    const persistedProof = (await lookupRes.json()) as { cid: string; payloadHash: string };
    expect(persistedProof.cid).toBe(proof.cid);
    expect(persistedProof.payloadHash).toBe(payloadHash);

    const missingRes = await fetch(`${baseUrl}/verify?cid=bafy-not-registered`);
    expect(missingRes.status).toBe(404);
  }, 15_000);

  it("requires the configured bearer token before accepting seal uploads", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kickoff-filecoin-auth-"));
    const storePath = join(tempDir, "proof-store.json");
    const port = await getPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const payload = sealPayload("cap-api-auth-test", { payloadHash: "b".repeat(64) });

    const health = await startServer(port, storePath, "seal-secret");
    expect(health.authRequired).toBe(true);
    expect(health.productionReady).toBe(false);
    expect(health.blockers).not.toContain("FILECOIN_SEAL_TOKEN is missing");
    expect(health.blockers).toContain("FILECOIN_SEAL_MOCK is enabled");

    const unauthorized = await fetch(`${baseUrl}/seal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(`${baseUrl}/seal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer seal-secret",
      },
      body: payload,
    });
    expect(authorized.ok).toBe(true);
    const proof = (await authorized.json()) as { cid: string };
    expect(proof.cid).toContain("bafy-mock-");
  }, 15_000);

  it("rejects invalid or oversized seal payloads before spending backend work", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kickoff-filecoin-guard-"));
    const storePath = join(tempDir, "proof-store.json");
    const port = await getPort();
    const baseUrl = `http://127.0.0.1:${port}`;

    const health = await startServer(port, storePath, undefined, 96);
    expect(health.maxUploadBytes).toBe(96);

    const invalidJson = await fetch(`${baseUrl}/seal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    expect(invalidJson.status).toBe(400);
    await expect(invalidJson.json()).resolves.toMatchObject({ error: "Seal payload must be valid JSON." });

    const invalidCapsule = await fetch(`${baseUrl}/seal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capsule: { id: "missing-hash" }, result: null }),
    });
    expect(invalidCapsule.status).toBe(400);
    await expect(invalidCapsule.json()).resolves.toMatchObject({
      error: "Seal payload capsule.payloadHash must be a 64-character SHA-256 hex digest.",
    });

    const oversized = await fetch(`${baseUrl}/seal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: sealPayload("too-large", { payloadHash: "c".repeat(64), filler: "x".repeat(120) }),
    });
    expect(oversized.status).toBe(413);
  }, 15_000);

  it("rejects unlocked draft capsules before spending backend work", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kickoff-filecoin-locked-"));
    const storePath = join(tempDir, "proof-store.json");
    const port = await getPort();
    const baseUrl = `http://127.0.0.1:${port}`;

    await startServer(port, storePath);

    const unlockedCapsule = await fetch(`${baseUrl}/seal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: sealPayload("unlocked-draft", { locked: false }),
    });
    expect(unlockedCapsule.status).toBe(400);
    await expect(unlockedCapsule.json()).resolves.toMatchObject({
      error: "Seal payload capsule.locked must be true.",
    });

    const health = await fetch(`${baseUrl}/health`).then((res) => res.json() as Promise<{ proofCount: number }>);
    expect(health.proofCount).toBe(0);
  }, 15_000);

  it("accepts sealed mode proof runs and rejects draft mode payloads", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kickoff-filecoin-mode-"));
    const storePath = join(tempDir, "proof-store.json");
    const port = await getPort();
    const baseUrl = `http://127.0.0.1:${port}`;

    await startServer(port, storePath);

    const invalidMode = await fetch(`${baseUrl}/seal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: modeRunPayload("mode-draft", { status: "draft" }),
    });
    expect(invalidMode.status).toBe(400);
    await expect(invalidMode.json()).resolves.toMatchObject({
      error: "Seal payload modeRun.status must be sealed or scored.",
    });

    const validPayload = modeRunPayload("mode-api-test");
    const payloadHash = createHash("sha256").update(validPayload).digest("hex");
    const validMode = await fetch(`${baseUrl}/seal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: validPayload,
    });
    expect(validMode.ok).toBe(true);
    const proof = (await validMode.json()) as { cid: string; payloadHash: string; proofStatus: string };
    expect(proof.cid).toContain("bafy-mock-");
    expect(proof.payloadHash).toBe(payloadHash);
    expect(proof.proofStatus).toBe("verified");

    const lookup = await fetch(`${baseUrl}/proof/${encodeURIComponent(proof.cid)}`).then((res) => res.json() as Promise<{ payloadHash: string }>);
    expect(lookup.payloadHash).toBe(payloadHash);
  }, 15_000);
});
