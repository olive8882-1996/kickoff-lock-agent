import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { filecoinSealApiEndpointProblem, resolvedPublicSealApi } from "./filecoinSealApiReadiness";
import { filecoinProofMetadataProblems } from "./filecoinProofValidation";
import { requiredProductionModeIds } from "./productionVerifyTargets";

export type FilecoinDoctorStatus = "passed" | "failed" | "skipped";

export type FilecoinDoctorCheck = {
  id: string;
  label: string;
  required: boolean;
  status: FilecoinDoctorStatus;
  detail: string;
  action: string;
  url?: string;
  sampleIds?: string[];
};

export type FilecoinDoctorReport = {
  ready: boolean;
  requiredPassed: number;
  requiredTotal: number;
  checks: FilecoinDoctorCheck[];
  nextActions: FilecoinDoctorCheck[];
};

export type FilecoinDoctorEnv = Record<string, string | undefined>;

type FetchLike = typeof fetch;
type ProofKind = "record" | "mode";

const env = (values: FilecoinDoctorEnv, key: string) => values[key]?.trim() ?? "";
const has = (values: FilecoinDoctorEnv, key: string) => env(values, key).length > 0;
const truthyFlag = (value: string) => /^(1|true|yes|on)$/i.test(value.trim());
const listEnv = (values: FilecoinDoctorEnv, key: string) =>
  env(values, key).split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);

const addCheck = (
  checks: FilecoinDoctorCheck[],
  check: Omit<FilecoinDoctorCheck, "status"> & { passed?: boolean; skipped?: boolean },
) => {
  const { passed, skipped, ...rest } = check;
  checks.push({
    ...rest,
    status: skipped ? "skipped" : passed ? "passed" : "failed",
  });
};

export const filecoinDoctorUrl = (
  values: FilecoinDoctorEnv,
  path: "health" | "seal" | "verify" | "proof",
  cid?: string,
) => {
  const endpoint = resolvedPublicSealApi(values);
  if (!endpoint) return "";
  const url = new URL(endpoint, env(values, "VITE_PUBLIC_APP_URL") || "http://127.0.0.1/");
  if (path === "health") {
    url.pathname = url.pathname
      .replace(/\/seal\/?$/, "/health")
      .replace(/\/verify\/?$/, "/health")
      .replace(/\/proof\/?.*$/, "/health");
    url.search = "";
    return url.toString();
  }
  if (path === "seal") {
    url.pathname = url.pathname
      .replace(/\/verify\/?$/, "/seal")
      .replace(/\/proof\/?.*$/, "/seal")
      .replace(/\/health\/?$/, "/seal");
    url.search = "";
    return url.toString();
  }
  if (path === "verify") {
    url.pathname = url.pathname
      .replace(/\/seal\/?$/, "/verify")
      .replace(/\/proof\/?.*$/, "/verify")
      .replace(/\/health\/?$/, "/verify");
    url.search = "";
    url.searchParams.set("cid", cid ?? "");
    return url.toString();
  }
  url.pathname = url.pathname
    .replace(/\/seal\/?$/, `/proof/${encodeURIComponent(cid ?? "")}`)
    .replace(/\/verify\/?$/, `/proof/${encodeURIComponent(cid ?? "")}`)
    .replace(/\/health\/?$/, `/proof/${encodeURIComponent(cid ?? "")}`);
  url.search = "";
  return url.toString();
};

const headers = (values: FilecoinDoctorEnv, base: Record<string, string> = {}) => ({
  ...base,
  ...(has(values, "VITE_FILECOIN_SEAL_TOKEN")
    ? { Authorization: `Bearer ${env(values, "VITE_FILECOIN_SEAL_TOKEN")}` }
    : {}),
});

const readJson = async (fetcher: FetchLike, url: string, init?: RequestInit) => {
  const response = await fetcher(url, init);
  const text = await response.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  return { response, body, text };
};

const validHash = (value: string) => /^[a-f0-9]{64}$/i.test(value);
const requiredModeProofCount = requiredProductionModeIds.length;

const proofTargets = (values: FilecoinDoctorEnv, kind: ProofKind) => {
  if (kind === "record") {
    return [
      {
        cid: env(values, "KICKOFF_VERIFY_FILECOIN_RECORD_CID"),
        expectedPayloadHash: env(values, "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH"),
        cidKey: "KICKOFF_VERIFY_FILECOIN_RECORD_CID",
        hashKey: "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH",
      },
    ];
  }
  const cids = listEnv(values, "KICKOFF_VERIFY_FILECOIN_MODE_CIDS");
  const hashes = listEnv(values, "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES");
  const count = Math.max(cids.length, hashes.length);
  return Array.from({ length: count }, (_, index) => ({
    cid: cids[index] ?? "",
    expectedPayloadHash: hashes[index] ?? "",
    cidKey: "KICKOFF_VERIFY_FILECOIN_MODE_CIDS",
    hashKey: "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES",
  }));
};

const modeProofTargetProblem = (values: FilecoinDoctorEnv) => {
  const cids = listEnv(values, "KICKOFF_VERIFY_FILECOIN_MODE_CIDS");
  const hashes = listEnv(values, "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES");
  const cidProblems: string[] = [];
  const hashProblems: string[] = [];
  if (cids.length < requiredModeProofCount) {
    cidProblems.push(
      cids.length > 0
        ? `KICKOFF_VERIFY_FILECOIN_MODE_CIDS needs ${requiredModeProofCount} mode CIDs; got ${cids.length}`
        : has(values, "KICKOFF_VERIFY_FILECOIN_MODE_CID")
          ? `KICKOFF_VERIFY_FILECOIN_MODE_CIDS needs ${requiredModeProofCount} mode CIDs; legacy KICKOFF_VERIFY_FILECOIN_MODE_CID is not enough`
          : "KICKOFF_VERIFY_FILECOIN_MODE_CIDS missing",
    );
  }
  if (hashes.length < requiredModeProofCount) {
    hashProblems.push(
      hashes.length > 0
        ? `KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES needs ${requiredModeProofCount} mode payload hashes; got ${hashes.length}`
        : has(values, "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH")
          ? `KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES needs ${requiredModeProofCount} mode payload hashes; legacy KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH is not enough`
          : "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES missing",
    );
  }
  if (cids.length >= requiredModeProofCount && hashes.length >= requiredModeProofCount && cids.length !== hashes.length) {
    return "KICKOFF_VERIFY_FILECOIN_MODE_CIDS and KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES counts must match";
  }
  return [...cidProblems, ...hashProblems].join("; ");
};

const checkProofReadback = async (
  values: FilecoinDoctorEnv,
  fetcher: FetchLike,
  checks: FilecoinDoctorCheck[],
  kind: ProofKind,
) => {
  const title = kind === "record" ? "Record CID proof read-back" : "Mode CID proof read-back";
  const targets = proofTargets(values, kind);
  const targetLabel = kind === "mode" && targets.length > 1 ? "Mode CID proof read-backs" : title;
  const cidKey = targets[0]?.cidKey ?? (kind === "record" ? "KICKOFF_VERIFY_FILECOIN_RECORD_CID" : "KICKOFF_VERIFY_FILECOIN_MODE_CID");
  const hashKey = targets[0]?.hashKey ?? (kind === "record" ? "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH" : "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH");
  const missingCidTargets = targets.filter((target) => !target.cid);
  const endpointProblem = filecoinSealApiEndpointProblem(resolvedPublicSealApi(values));
  if (endpointProblem) {
    addCheck(checks, {
      id: `${kind}-proof-readback`,
      label: targetLabel,
      required: true,
      detail: endpointProblem,
      action: "Deploy the seal API and configure VITE_FILECOIN_SEAL_API.",
    });
    return;
  }
  if (kind === "mode") {
    const problem = modeProofTargetProblem(values);
    if (problem) {
      addCheck(checks, {
        id: `${kind}-proof-readback`,
        label: "Mode CID proof read-backs",
        required: true,
        detail: problem,
        action: `Run production one-click seals for all ${requiredModeProofCount} required mode proofs and set KICKOFF_VERIFY_FILECOIN_MODE_CIDS plus KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASHES.`,
        sampleIds: targets.map((target) => target.cid).filter(Boolean),
      });
      return;
    }
  }
  if (targets.length === 0 || missingCidTargets.length > 0) {
    addCheck(checks, {
      id: `${kind}-proof-readback`,
      label: targetLabel,
      required: true,
      detail: `${cidKey} missing`,
      action: `Run a production one-click ${kind === "record" ? "prediction capsule" : "mode proof"} seal and set ${cidKey}.`,
    });
    return;
  }
  const invalidHashTargets = targets.filter((target) => !validHash(target.expectedPayloadHash));
  if (invalidHashTargets.length > 0) {
    addCheck(checks, {
      id: `${kind}-proof-payload-hash-target`,
      label: `${kind === "record" ? "Record" : "Mode"} payload hash target`,
      required: true,
      detail: `${hashKey} must contain ${targets.length} 64-character SHA-256 hex digest${targets.length === 1 ? "" : "s"}`,
      action: `Copy the uploadPayloadHash from the verified ${kind === "record" ? "record" : "mode"} seal job into ${hashKey}.`,
      sampleIds: targets.map((target) => target.cid),
    });
  } else {
    addCheck(checks, {
      id: `${kind}-proof-payload-hash-target`,
      label: `${kind === "record" ? "Record" : "Mode"} payload hash target`,
      required: true,
      passed: true,
      detail: targets.length === 1 ? `${targets[0]!.expectedPayloadHash.slice(0, 12)}...` : `${targets.length}/${targets.length} hashes configured`,
      action: "Configured.",
      sampleIds: targets.map((target) => target.cid),
    });
  }

  try {
    const results = await Promise.all(
      targets.map(async (target) => {
        const verifyUrl = filecoinDoctorUrl(values, "verify", target.cid);
        const proofUrl = filecoinDoctorUrl(values, "proof", target.cid);
        const [verify, proof] = await Promise.all([
          readJson(fetcher, verifyUrl, { headers: headers(values) }),
          readJson(fetcher, proofUrl, { headers: headers(values) }),
        ]);
        const verifyStatus = String(verify.body?.proofStatus ?? "");
        const verifyCid = String(verify.body?.cid ?? "");
        const verifyOk = verify.response.ok && verifyCid === target.cid && ["verified", "retrievable"].includes(verifyStatus);
        const proofOk = proof.response.ok && proof.body?.cid === target.cid;
        const proofPayloadHash = String(proof.body?.payloadHash ?? "");
        const verifyPayloadHash = String(verify.body?.payloadHash ?? "");
        const payloadHash = proofPayloadHash || verifyPayloadHash;
        const payloadHashesConsistent = Boolean(
          !proofPayloadHash || !verifyPayloadHash || proofPayloadHash === verifyPayloadHash,
        );
        const byteLength = Number(proof.body?.byteLength ?? verify.body?.byteLength ?? 0);
        const expectedOk = validHash(target.expectedPayloadHash) && payloadHash === target.expectedPayloadHash && payloadHashesConsistent;
        const metadataProblems = filecoinProofMetadataProblems(proof.body, {
          cid: target.cid,
          expectedPayloadHash: target.expectedPayloadHash,
          label: `${kind} proof`,
        });
        const passed = verifyOk && proofOk && expectedOk && byteLength > 0 && metadataProblems.length === 0;
        return {
          ...target,
          passed,
          verifyStatus,
          payloadHash,
          byteLength,
          proofUrl,
          detail: passed
            ? `${target.cid} ${verifyStatus}; payload ${payloadHash.slice(0, 12)}...; ${byteLength} bytes`
            : [
                verifyOk ? "" : `verify ${verify.response.status}/${verifyCid || "missing-cid"}/${verifyStatus || "missing-status"}`,
                proofOk ? "" : `proof ${proof.response.status}/${proof.body?.cid ?? "missing-cid"}`,
                payloadHashesConsistent ? "" : "verify/proof payload hashes differ",
                expectedOk ? "" : "payload hash mismatch or missing",
                byteLength > 0 ? "" : "byte length missing",
                ...metadataProblems,
              ]
                .filter(Boolean)
                .join("; "),
        };
      }),
    );
    const failed = results.filter((result) => !result.passed);
    const passed = failed.length === 0;
    addCheck(checks, {
      id: `${kind}-proof-readback`,
      label: targetLabel,
      required: true,
      passed,
      detail: passed
        ? targets.length === 1
          ? results[0]!.detail
          : `${results.length}/${targets.length} mode CIDs verified with matching payload hashes`
        : failed.map((result) => `${result.cid}: ${result.detail}`).join(" | "),
      action: `Verify ${targets.length === 1 ? targets[0]!.cid : "all mode CIDs"} exists in /verify and /proof registry with a matching payload hash.`,
      url: results[0]?.proofUrl,
      sampleIds: targets.map((target) => target.cid),
    });
  } catch (error) {
    addCheck(checks, {
      id: `${kind}-proof-readback`,
      label: targetLabel,
      required: true,
      detail: String(error),
      action: `Verify ${targets.length === 1 ? targets[0]!.cid : "all mode CIDs"} exists in /verify and /proof registry with a matching payload hash.`,
      sampleIds: targets.map((target) => target.cid),
    });
  }
};

const runOptionalSealSmoke = async (
  values: FilecoinDoctorEnv,
  fetcher: FetchLike,
  checks: FilecoinDoctorCheck[],
) => {
  const payloadPath = env(values, "KICKOFF_FILECOIN_DOCTOR_SEAL_PAYLOAD");
  if (!payloadPath) {
    addCheck(checks, {
      id: "optional-seal-upload-smoke",
      label: "Optional seal upload smoke",
      required: false,
      skipped: true,
      detail: "KICKOFF_FILECOIN_DOCTOR_SEAL_PAYLOAD missing",
      action: "Optionally point KICKOFF_FILECOIN_DOCTOR_SEAL_PAYLOAD to a locked capsule or sealed mode proof JSON payload when you intentionally want to exercise POST /seal.",
    });
    return;
  }
  if (!resolvedPublicSealApi(values)) {
    addCheck(checks, {
      id: "optional-seal-upload-smoke",
      label: "Optional seal upload smoke",
      required: false,
      detail: "Missing VITE_FILECOIN_SEAL_API or VITE_FILECOIN_SEAL_SAME_ORIGIN=1",
      action: "Configure the seal API before exercising POST /seal.",
    });
    return;
  }
  const sealUrl = filecoinDoctorUrl(values, "seal");
  const asyncSealUrl = new URL(sealUrl);
  asyncSealUrl.searchParams.set("async", "1");
  try {
    const payload = await readFile(payloadPath, "utf8");
    const expectedPayloadHash = createHash("sha256").update(payload).digest("hex");
    const response = await fetcher(asyncSealUrl.toString(), {
      method: "POST",
      headers: headers(values, { "Content-Type": "application/json" }),
      body: payload,
    });
    const body = await response.json().catch(() => undefined) as any;
    let result = body;
    let jobPolls = 0;
    const statusUrl = body?.statusUrl
      ? new URL(String(body.statusUrl), sealUrl).toString()
      : body?.jobId
        ? new URL(`/jobs/${encodeURIComponent(String(body.jobId))}`, sealUrl).toString()
        : "";
    if (response.ok && body?.jobId && statusUrl && !body?.cid && !body?.proof?.cid) {
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        jobPolls = attempt;
        const job = await readJson(fetcher, statusUrl, { headers: headers(values) });
        result = job.body;
        if (!job.response.ok) break;
        if (result?.cid || result?.proof?.cid) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    const cid = result?.proof?.cid ?? result?.cid;
    const payloadHash = result?.proof?.payloadHash ?? result?.payloadHash;
    const proofStatus = String(result?.proof?.proofStatus ?? result?.proofStatus ?? result?.status ?? "");
    const byteLength = Number(result?.proof?.byteLength ?? result?.byteLength ?? 0);
    const asyncJobReady = Boolean(body?.jobId && statusUrl && jobPolls > 0);
    const statusReady = ["verified", "retrievable"].includes(proofStatus);
    const byteLengthReady = Number.isFinite(byteLength) && byteLength > 0;
    let registryReady = false;
    let registryProblem = "";
    if (response.ok && asyncJobReady && cid && payloadHash === expectedPayloadHash && statusReady && byteLengthReady) {
      const verifyUrl = filecoinDoctorUrl(values, "verify", String(cid));
      const proofUrl = filecoinDoctorUrl(values, "proof", String(cid));
      const [verify, proof] = await Promise.all([
        readJson(fetcher, verifyUrl, { headers: headers(values) }),
        readJson(fetcher, proofUrl, { headers: headers(values) }),
      ]);
      const verifyCid = String(verify.body?.cid ?? "");
      const proofCid = String(proof.body?.cid ?? "");
      const verifyStatus = String(verify.body?.proofStatus ?? "");
      const verifyPayloadHash = String(verify.body?.payloadHash ?? "");
      const proofPayloadHash = String(proof.body?.payloadHash ?? "");
      const registryPayloadHash = proofPayloadHash || verifyPayloadHash;
      const registryByteLength = Number(proof.body?.byteLength ?? verify.body?.byteLength ?? 0);
      const metadataProblems = filecoinProofMetadataProblems(proof.body, {
        cid: String(cid),
        expectedPayloadHash,
        expectedByteLength: byteLength,
        label: "smoke proof",
      });
      const problems = [
        verify.response.ok ? "" : `verify HTTP ${verify.response.status}`,
        proof.response.ok ? "" : `proof HTTP ${proof.response.status}`,
        verifyCid === cid ? "" : `verify CID ${verifyCid || "missing"} != ${cid}`,
        proofCid === cid ? "" : `proof CID ${proofCid || "missing"} != ${cid}`,
        ["verified", "retrievable"].includes(verifyStatus) ? "" : `verify status ${verifyStatus || "missing"}`,
        registryPayloadHash === expectedPayloadHash ? "" : "registry payload hash mismatch",
        registryByteLength === byteLength ? "" : "registry byte length mismatch",
        ...metadataProblems,
      ].filter(Boolean);
      registryReady = problems.length === 0;
      registryProblem = problems.join("; ");
    }
    const passed =
      response.ok &&
      asyncJobReady &&
      Boolean(cid) &&
      payloadHash === expectedPayloadHash &&
      statusReady &&
      byteLengthReady &&
      registryReady;
    addCheck(checks, {
      id: "optional-seal-upload-smoke",
      label: "Optional async seal upload smoke",
      required: false,
      passed,
      detail: response.ok
        ? !body?.jobId
          ? "POST /seal?async=1 did not return a jobId"
          : !statusUrl
            ? "POST /seal?async=1 did not return a usable statusUrl or job route"
            : jobPolls === 0
              ? "Async seal job was not polled"
              : !cid
                ? "Async seal job completed without a CID"
                : payloadHash !== expectedPayloadHash
                  ? `CID ${cid} returned but payload hash mismatched`
                  : !statusReady
                    ? `CID ${cid} returned with status ${proofStatus || "missing"}`
                    : !byteLengthReady
                      ? `CID ${cid} returned without byte length read-back`
                      : !registryReady
                        ? `CID ${cid} returned but verify/proof registry read-back failed: ${registryProblem || "missing registry response"}`
                        : `${cid} returned with ${proofStatus} status, matching payload hash, registry read-back and ${byteLength} bytes after ${jobPolls} job poll${jobPolls === 1 ? "" : "s"}`
        : `HTTP ${response.status}: ${body?.error ?? "upload failed"}`,
      action: "Use a locked capsule or sealed/scored mode proof payload and a valid bearer token; the doctor exercises POST /seal?async=1 and GET /jobs/:id.",
      url: asyncSealUrl.toString(),
      sampleIds: cid ? [String(cid)] : [],
    });
  } catch (error) {
    addCheck(checks, {
      id: "optional-seal-upload-smoke",
      label: "Optional async seal upload smoke",
      required: false,
      detail: String(error),
      action: "Use a readable locked capsule or sealed/scored mode proof payload file.",
      url: asyncSealUrl.toString(),
    });
  }
};

export const buildFilecoinProductionDoctorReport = async (
  values: FilecoinDoctorEnv,
  fetcher: FetchLike = fetch,
): Promise<FilecoinDoctorReport> => {
  const checks: FilecoinDoctorCheck[] = [];
  const endpoint = resolvedPublicSealApi(values);
  const endpointProblem = filecoinSealApiEndpointProblem(endpoint);
  const endpointConfigured = !endpointProblem;
  const sameOriginSeal = !has(values, "VITE_FILECOIN_SEAL_API") && truthyFlag(env(values, "VITE_FILECOIN_SEAL_SAME_ORIGIN"));
  const tokenConfigured = sameOriginSeal ? has(values, "FILECOIN_SEAL_TOKEN") : has(values, "VITE_FILECOIN_SEAL_TOKEN");

  addCheck(checks, {
    id: "seal-api-env",
    label: "Browser seal endpoint",
    required: true,
    passed: endpointConfigured,
    detail: endpointConfigured ? endpoint : endpointProblem,
    action:
      "Deploy the seal API and set VITE_FILECOIN_SEAL_API to its /seal endpoint, or set VITE_FILECOIN_SEAL_SAME_ORIGIN=1 when it is mounted at /seal on the app origin.",
  });
  addCheck(checks, {
    id: "seal-token-env",
    label: sameOriginSeal ? "Proxy seal token injection" : "Browser seal token",
    required: true,
    passed: tokenConfigured,
    detail: sameOriginSeal
      ? tokenConfigured
        ? "FILECOIN_SEAL_TOKEN configured for same-origin proxy injection"
        : "Missing FILECOIN_SEAL_TOKEN for same-origin proxy injection"
      : tokenConfigured
        ? "Bearer token configured"
        : "Missing VITE_FILECOIN_SEAL_TOKEN",
    action: sameOriginSeal
      ? "Set FILECOIN_SEAL_TOKEN on the Pages/Worker runtime; the browser does not need VITE_FILECOIN_SEAL_TOKEN in same-origin proxy mode."
      : "Set VITE_FILECOIN_SEAL_TOKEN to the token expected by FILECOIN_SEAL_TOKEN on the seal API.",
  });

  if (!endpointConfigured) {
    addCheck(checks, {
      id: "seal-api-health",
      label: "Seal API health",
      required: true,
      detail: endpointProblem,
      action: "Deploy the seal API and configure VITE_FILECOIN_SEAL_API.",
    });
  } else {
    const healthUrl = filecoinDoctorUrl(values, "health");
    try {
      const { response, body } = await readJson(fetcher, healthUrl, { headers: headers(values) });
      const backendReady = Boolean(
        response.ok &&
          body?.ok &&
          body?.productionReady &&
          !body?.mockMode &&
          body?.hasPrivateKey &&
          body?.authRequired &&
          body?.persistence === "file" &&
          body?.corsRestricted === true &&
          Number(body?.maxUploadBytes ?? 0) > 0,
      );
      const sameOriginProxyReady =
        !sameOriginSeal || (body?.service === "kickoff-lock-filecoin-seal-proxy" && body?.tokenInjected === true);
      const proxyCapabilities = body?.proxyCapabilities;
      const expectedProxyRoutes = ["POST /seal?async=1", "GET /jobs/:id", "GET /verify?cid=", "GET /proof/:cid"];
      const sameOriginProxyCapabilitiesReady =
        !sameOriginSeal ||
        Boolean(
          proxyCapabilities &&
            proxyCapabilities.service === "kickoff-lock-filecoin-seal-proxy" &&
            proxyCapabilities.tokenInjected === true &&
            proxyCapabilities.protectedUpload === true &&
            proxyCapabilities.asyncUpload?.available === true &&
            proxyCapabilities.asyncUpload?.statusUrlRequired === true &&
            proxyCapabilities.uploadStatus?.available === true &&
            proxyCapabilities.cidQuery?.available === true &&
            proxyCapabilities.verificationPolling?.available === true &&
            Array.isArray(proxyCapabilities.allowedRoutes) &&
            expectedProxyRoutes.every((route) => proxyCapabilities.allowedRoutes.includes(route)),
        );
      const ready = backendReady && sameOriginProxyReady && sameOriginProxyCapabilitiesReady;
      const healthProblems = [
        ...(Array.isArray(body?.blockers) ? body.blockers : []),
        backendReady ? "" : "health contract incomplete",
        !sameOriginSeal || body?.service === "kickoff-lock-filecoin-seal-proxy"
          ? ""
          : "same-origin seal proxy service missing",
        !sameOriginSeal || body?.tokenInjected === true ? "" : "same-origin FILECOIN_SEAL_TOKEN injection missing",
        sameOriginProxyCapabilitiesReady ? "" : "same-origin seal proxy capability matrix incomplete",
      ].filter(Boolean);
      addCheck(checks, {
        id: "seal-api-health",
        label: "Seal API health",
        required: true,
        passed: ready,
        detail: response.ok
          ? ready
            ? `production-ready; ${body.proofCount ?? 0} proofs; restricted CORS; max ${body.maxUploadBytes} bytes${
                sameOriginSeal ? "; proxy token injection and route capabilities verified" : ""
              }`
            : `not production-ready: ${healthProblems.join(", ")}`
          : `HTTP ${response.status}`,
        action: "Run a non-mock seal API with SYNAPSE_PRIVATE_KEY, FILECOIN_SEAL_TOKEN, FILECOIN_PROOF_STORE_PATH and restricted ALLOW_ORIGIN.",
        url: healthUrl,
      });
      addCheck(checks, {
        id: "seal-api-contract",
        label: "Seal API endpoint contract",
        required: true,
        passed:
          response.ok &&
          Array.isArray(body?.endpoints) &&
          ["POST /seal", "POST /seal?async=1", "GET /jobs/:id", "GET /verify?cid=", "GET /proof/:cid"].every((endpoint) =>
            body.endpoints.includes(endpoint),
          ),
        detail: response.ok ? (Array.isArray(body?.endpoints) ? body.endpoints.join(", ") : "endpoints missing") : `HTTP ${response.status}`,
        action: "Expose POST /seal?async=1, GET /jobs/:id, GET /verify?cid= and GET /proof/:cid from the same seal API deployment.",
        url: healthUrl,
      });
    } catch (error) {
      addCheck(checks, {
        id: "seal-api-health",
        label: "Seal API health",
        required: true,
        detail: String(error),
        action: "Deploy the seal API and configure VITE_FILECOIN_SEAL_API.",
        url: healthUrl,
      });
      addCheck(checks, {
        id: "seal-api-contract",
        label: "Seal API endpoint contract",
        required: true,
        detail: "Health request failed",
        action: "Expose POST /seal?async=1, GET /jobs/:id, GET /verify?cid= and GET /proof/:cid from the same seal API deployment.",
        url: healthUrl,
      });
    }
  }

  await Promise.all([
    checkProofReadback(values, fetcher, checks, "record"),
    checkProofReadback(values, fetcher, checks, "mode"),
  ]);
  await runOptionalSealSmoke(values, fetcher, checks);

  const required = checks.filter((check) => check.required);
  const requiredPassed = required.filter((check) => check.status === "passed").length;
  return {
    ready: required.length > 0 && requiredPassed === required.length,
    requiredPassed,
    requiredTotal: required.length,
    checks,
    nextActions: checks.filter((check) => check.required && check.status !== "passed"),
  };
};
