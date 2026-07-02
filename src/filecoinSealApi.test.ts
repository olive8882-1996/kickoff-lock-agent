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

const startServer = async (port: number, storePath: string, token?: string) => {
  child = spawn("bun", ["server/filecoin-seal-api.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FILECOIN_SEAL_MOCK: "1",
      FILECOIN_PROOF_STORE_PATH: storePath,
      FILECOIN_SEAL_TOKEN: token ?? "",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return waitForHealth(`http://127.0.0.1:${port}`);
};

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
    const payload = JSON.stringify({ capsule: { id: "cap-api-test" }, result: null });
    const payloadHash = createHash("sha256").update(payload).digest("hex");

    const initialHealth = await startServer(port, storePath);
    expect(initialHealth.persistence).toBe("file");
    expect(initialHealth.proofCount).toBe(0);

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
    const payload = JSON.stringify({ capsule: { id: "cap-api-auth-test" }, result: null });

    const health = await startServer(port, storePath, "seal-secret");
    expect(health.authRequired).toBe(true);

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
});
