import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error The deployed Worker is authored as ESM for Cloudflare Pages/Workers.
import worker from "../server/filecoin-seal-proxy-worker.mjs";
// @ts-expect-error Cloudflare Pages function entry is JavaScript and reuses the deployed Worker.
import { onRequest as onSealRequest } from "../functions/seal/[[path]].js";
// @ts-expect-error Cloudflare Pages function entry is JavaScript and reuses the deployed Worker.
import { onRequest as onHealthRequest } from "../functions/health.js";
// @ts-expect-error Cloudflare Pages function entry is JavaScript and reuses the deployed Worker.
import { onRequest as onVerifyRequest } from "../functions/verify.js";
// @ts-expect-error Cloudflare Pages function entry is JavaScript and reuses the deployed Worker.
import { onRequest as onProofRequest } from "../functions/proof/[[path]].js";
// @ts-expect-error Cloudflare Pages function entry is JavaScript and reuses the deployed Worker.
import { onRequest as onJobsRequest } from "../functions/jobs/[[path]].js";

const env = {
  FILECOIN_SEAL_UPSTREAM_URL: "https://seal-upstream.example/seal",
  FILECOIN_SEAL_TOKEN: "seal-token",
  ALLOW_ORIGIN: "https://app.example.com",
};

const requestFor = (url: string, init?: RequestInit) => new Request(url, init);

describe("Filecoin seal same-origin proxy worker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects missing or unsafe upstream configuration before forwarding seal traffic", async () => {
    const missing = await worker.fetch(requestFor("https://app.example.com/health"), {}, {});
    const insecure = await worker.fetch(
      requestFor("https://app.example.com/health"),
      { FILECOIN_SEAL_UPSTREAM_URL: "http://localhost:8787/seal" },
      {},
    );
    const wrongPath = await worker.fetch(
      requestFor("https://app.example.com/health"),
      { FILECOIN_SEAL_UPSTREAM_URL: "https://seal-upstream.example/status" },
      {},
    );

    expect(missing.status).toBe(503);
    await expect(missing.json()).resolves.toMatchObject({ service: "kickoff-lock-filecoin-seal-proxy", error: "missing_upstream" });
    expect(insecure.status).toBe(503);
    await expect(insecure.json()).resolves.toMatchObject({ error: "invalid_upstream" });
    expect(wrongPath.status).toBe(503);
    await expect(wrongPath.json()).resolves.toMatchObject({ error: "invalid_upstream", detail: expect.stringContaining("/seal") });
  });

  it("forwards every same-origin Filecoin endpoint to the configured upstream path", async () => {
    const calls: Array<{ url: string; method: string; authorization: string | null; body: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          method: init?.method ?? "GET",
          authorization: (init?.headers as Headers)?.get("Authorization") ?? null,
          body: init?.body ? await new Response(init.body).text() : "",
        });
        return new Response(JSON.stringify({ ok: true, upstream: url }), {
          status: url.includes("/seal?async=1") ? 202 : 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const health = await onHealthRequest({ request: requestFor("https://app.example.com/health"), env, ctx: {} });
    const verify = await onVerifyRequest({
      request: requestFor("https://app.example.com/verify?cid=bafy-record"),
      env,
      ctx: {},
    });
    const proof = await onProofRequest({
      request: requestFor("https://app.example.com/proof/bafy-record", { headers: { Authorization: "Bearer seal-token" } }),
      env,
      ctx: {},
    });
    const job = await onJobsRequest({ request: requestFor("https://app.example.com/jobs/seal-job-1"), env, ctx: {} });
    const seal = await onSealRequest({
      request: requestFor("https://app.example.com/seal?async=1", {
        method: "POST",
        headers: { Authorization: "Bearer seal-token", "Content-Type": "application/json" },
        body: JSON.stringify({ capsule: { id: "cap-1" } }),
      }),
      env,
      ctx: {},
    });

    expect([health.status, verify.status, proof.status, job.status, seal.status]).toEqual([200, 200, 200, 200, 202]);
    expect(calls).toEqual([
      { url: "https://seal-upstream.example/health", method: "GET", authorization: "Bearer seal-token", body: "" },
      { url: "https://seal-upstream.example/verify?cid=bafy-record", method: "GET", authorization: "Bearer seal-token", body: "" },
      { url: "https://seal-upstream.example/proof/bafy-record", method: "GET", authorization: "Bearer seal-token", body: "" },
      { url: "https://seal-upstream.example/jobs/seal-job-1", method: "GET", authorization: "Bearer seal-token", body: "" },
      {
        url: "https://seal-upstream.example/seal?async=1",
        method: "POST",
        authorization: "Bearer seal-token",
        body: JSON.stringify({ capsule: { id: "cap-1" } }),
      },
    ]);
    expect(seal.headers.get("x-kickoff-seal-proxy")).toBe("kickoff-lock-filecoin-seal-proxy");
    expect(seal.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
  });

  it("injects the server-side upload token instead of requiring a browser token", async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url,
          authorization: (init?.headers as Headers)?.get("Authorization") ?? null,
        });
        return new Response(JSON.stringify({ ok: true, service: "kickoff-lock-filecoin-seal-api" }), {
          status: url.endsWith("/health") ? 200 : 202,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const proxyEnv = { ...env, FILECOIN_SEAL_TOKEN: "server-secret-token" };
    const health = await onHealthRequest({ request: requestFor("https://app.example.com/health"), env: proxyEnv, ctx: {} });
    const seal = await onSealRequest({
      request: requestFor("https://app.example.com/seal?async=1", {
        method: "POST",
        headers: { Authorization: "Bearer stale-browser-token", "Content-Type": "application/json" },
        body: JSON.stringify({ capsule: { id: "cap-1" } }),
      }),
      env: proxyEnv,
      ctx: {},
    });

    expect([health.status, seal.status]).toEqual([200, 202]);
    await expect(health.json()).resolves.toMatchObject({
      service: "kickoff-lock-filecoin-seal-proxy",
      upstreamService: "kickoff-lock-filecoin-seal-api",
      tokenInjected: true,
      proxyCapabilities: {
        service: "kickoff-lock-filecoin-seal-proxy",
        upstreamConfigured: true,
        tokenInjected: true,
        protectedUpload: true,
        allowedRoutes: expect.arrayContaining([
          "POST /seal?async=1",
          "GET /jobs/:id",
          "GET /verify?cid=",
          "GET /proof/:cid",
        ]),
        asyncUpload: expect.objectContaining({
          available: true,
          statusUrlRequired: true,
        }),
        uploadStatus: expect.objectContaining({ available: true }),
        cidQuery: expect.objectContaining({ available: true }),
        verificationPolling: expect.objectContaining({ available: true }),
      },
    });
    expect(calls).toEqual([
      { url: "https://seal-upstream.example/health", authorization: "Bearer server-secret-token" },
      { url: "https://seal-upstream.example/seal?async=1", authorization: "Bearer server-secret-token" },
    ]);
  });

  it("rejects seal uploads when the same-origin proxy token is missing", async () => {
    const upstream = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 202 }));
    vi.stubGlobal("fetch", upstream);

    const response = await onSealRequest({
      request: requestFor("https://app.example.com/seal?async=1", {
        method: "POST",
        headers: { Authorization: "Bearer browser-token", "Content-Type": "application/json" },
        body: JSON.stringify({ capsule: { id: "cap-1" } }),
      }),
      env: {
        FILECOIN_SEAL_UPSTREAM_URL: "https://seal-upstream.example/seal",
        ALLOW_ORIGIN: "https://app.example.com",
      },
      ctx: {},
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      service: "kickoff-lock-filecoin-seal-proxy",
      error: "missing_proxy_token",
      detail: "Set FILECOIN_SEAL_TOKEN so same-origin seal uploads are authenticated server-side.",
    });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("also accepts Cloudflare Pages /seal/* catch-all paths for health, jobs, verify and proof", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify({ ok: true, upstream: url }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const health = await onSealRequest({ request: requestFor("https://app.example.com/seal/health"), env, ctx: {} });
    const verify = await onSealRequest({
      request: requestFor("https://app.example.com/seal/verify?cid=bafy-record"),
      env,
      ctx: {},
    });
    const proof = await onSealRequest({
      request: requestFor("https://app.example.com/seal/proof/bafy-record"),
      env,
      ctx: {},
    });
    const job = await onSealRequest({
      request: requestFor("https://app.example.com/seal/jobs/seal-job-1"),
      env,
      ctx: {},
    });

    expect([health.status, verify.status, proof.status, job.status]).toEqual([200, 200, 200, 200]);
    expect(calls).toEqual([
      "https://seal-upstream.example/health",
      "https://seal-upstream.example/verify?cid=bafy-record",
      "https://seal-upstream.example/proof/bafy-record",
      "https://seal-upstream.example/jobs/seal-job-1",
    ]);
  });

  it("rejects arbitrary paths and wrong methods on the public same-origin surface", async () => {
    const badRoute = await worker.fetch(requestFor("https://app.example.com/admin"), env, {});
    const badSealMethod = await worker.fetch(requestFor("https://app.example.com/seal"), env, {});
    const badHealthMethod = await worker.fetch(requestFor("https://app.example.com/health", { method: "POST" }), env, {});
    const preflight = await worker.fetch(requestFor("https://app.example.com/seal", { method: "OPTIONS" }), env, {});

    expect(badRoute.status).toBe(404);
    await expect(badRoute.json()).resolves.toMatchObject({ error: "route_not_allowed" });
    expect(badSealMethod.status).toBe(405);
    await expect(badSealMethod.json()).resolves.toMatchObject({ error: "method_not_allowed" });
    expect(badHealthMethod.status).toBe(405);
    await expect(badHealthMethod.json()).resolves.toMatchObject({ error: "method_not_allowed" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
