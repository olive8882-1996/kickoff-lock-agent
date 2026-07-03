import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

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
  const endpoint = env(values, "VITE_FILECOIN_SEAL_API");
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

const checkProofReadback = async (
  values: FilecoinDoctorEnv,
  fetcher: FetchLike,
  checks: FilecoinDoctorCheck[],
  kind: ProofKind,
) => {
  const title = kind === "record" ? "Record CID proof read-back" : "Mode CID proof read-back";
  const cidKey = kind === "record" ? "KICKOFF_VERIFY_FILECOIN_RECORD_CID" : "KICKOFF_VERIFY_FILECOIN_MODE_CID";
  const hashKey =
    kind === "record" ? "KICKOFF_VERIFY_FILECOIN_RECORD_PAYLOAD_HASH" : "KICKOFF_VERIFY_FILECOIN_MODE_PAYLOAD_HASH";
  const cid = env(values, cidKey);
  const expectedPayloadHash = env(values, hashKey);
  if (!has(values, "VITE_FILECOIN_SEAL_API")) {
    addCheck(checks, {
      id: `${kind}-proof-readback`,
      label: title,
      required: true,
      detail: "Missing VITE_FILECOIN_SEAL_API",
      action: "Deploy the seal API and configure VITE_FILECOIN_SEAL_API.",
    });
    return;
  }
  if (!cid) {
    addCheck(checks, {
      id: `${kind}-proof-readback`,
      label: title,
      required: true,
      detail: `${cidKey} missing`,
      action: `Run a production one-click ${kind === "record" ? "prediction capsule" : "mode proof"} seal and set ${cidKey}.`,
    });
    return;
  }
  if (!validHash(expectedPayloadHash)) {
    addCheck(checks, {
      id: `${kind}-proof-payload-hash-target`,
      label: `${kind === "record" ? "Record" : "Mode"} payload hash target`,
      required: true,
      detail: `${hashKey} must be a 64-character SHA-256 hex digest`,
      action: `Copy the uploadPayloadHash from the verified ${kind === "record" ? "record" : "mode"} seal job into ${hashKey}.`,
      sampleIds: [cid],
    });
  } else {
    addCheck(checks, {
      id: `${kind}-proof-payload-hash-target`,
      label: `${kind === "record" ? "Record" : "Mode"} payload hash target`,
      required: true,
      passed: true,
      detail: `${expectedPayloadHash.slice(0, 12)}...`,
      action: "Configured.",
      sampleIds: [cid],
    });
  }

  const verifyUrl = filecoinDoctorUrl(values, "verify", cid);
  const proofUrl = filecoinDoctorUrl(values, "proof", cid);
  try {
    const [verify, proof] = await Promise.all([
      readJson(fetcher, verifyUrl, { headers: headers(values) }),
      readJson(fetcher, proofUrl, { headers: headers(values) }),
    ]);
    const verifyStatus = String(verify.body?.proofStatus ?? "");
    const verifyOk = verify.response.ok && ["verified", "retrievable"].includes(verifyStatus);
    const proofOk = proof.response.ok && proof.body?.cid === cid;
    const payloadHash = String(proof.body?.payloadHash ?? verify.body?.payloadHash ?? "");
    const byteLength = Number(proof.body?.byteLength ?? verify.body?.byteLength ?? 0);
    const expectedOk = validHash(expectedPayloadHash) && payloadHash === expectedPayloadHash;
    const passed = verifyOk && proofOk && expectedOk && byteLength > 0;
    addCheck(checks, {
      id: `${kind}-proof-readback`,
      label: title,
      required: true,
      passed,
      detail: passed
        ? `${cid} ${verifyStatus}; payload ${payloadHash.slice(0, 12)}...; ${byteLength} bytes`
        : [
            verifyOk ? "" : `verify ${verify.response.status}/${verifyStatus || "missing-status"}`,
            proofOk ? "" : `proof ${proof.response.status}/${proof.body?.cid ?? "missing-cid"}`,
            expectedOk ? "" : "payload hash mismatch or missing",
            byteLength > 0 ? "" : "byte length missing",
          ]
            .filter(Boolean)
            .join("; "),
      action: `Verify ${cid} exists in /verify and /proof registry with a matching payload hash.`,
      url: proofUrl,
      sampleIds: [cid],
    });
  } catch (error) {
    addCheck(checks, {
      id: `${kind}-proof-readback`,
      label: title,
      required: true,
      detail: String(error),
      action: `Verify ${cid} exists in /verify and /proof registry with a matching payload hash.`,
      url: proofUrl,
      sampleIds: [cid],
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
  if (!has(values, "VITE_FILECOIN_SEAL_API")) {
    addCheck(checks, {
      id: "optional-seal-upload-smoke",
      label: "Optional seal upload smoke",
      required: false,
      detail: "Missing VITE_FILECOIN_SEAL_API",
      action: "Configure the seal API before exercising POST /seal.",
    });
    return;
  }
  const sealUrl = filecoinDoctorUrl(values, "seal");
  try {
    const payload = await readFile(payloadPath, "utf8");
    const expectedPayloadHash = createHash("sha256").update(payload).digest("hex");
    const response = await fetcher(sealUrl, {
      method: "POST",
      headers: headers(values, { "Content-Type": "application/json" }),
      body: payload,
    });
    const body = await response.json().catch(() => undefined) as any;
    addCheck(checks, {
      id: "optional-seal-upload-smoke",
      label: "Optional seal upload smoke",
      required: false,
      passed: response.ok && body?.cid && body?.payloadHash === expectedPayloadHash,
      detail: response.ok
        ? body?.payloadHash === expectedPayloadHash
          ? `${body.cid} returned with matching payload hash`
          : `CID ${body?.cid ?? "missing"} returned but payload hash mismatched`
        : `HTTP ${response.status}: ${body?.error ?? "upload failed"}`,
      action: "Use a locked capsule or sealed/scored mode proof payload and a valid bearer token.",
      url: sealUrl,
      sampleIds: body?.cid ? [String(body.cid)] : [],
    });
  } catch (error) {
    addCheck(checks, {
      id: "optional-seal-upload-smoke",
      label: "Optional seal upload smoke",
      required: false,
      detail: String(error),
      action: "Use a readable locked capsule or sealed/scored mode proof payload file.",
      url: sealUrl,
    });
  }
};

export const buildFilecoinProductionDoctorReport = async (
  values: FilecoinDoctorEnv,
  fetcher: FetchLike = fetch,
): Promise<FilecoinDoctorReport> => {
  const checks: FilecoinDoctorCheck[] = [];
  const endpointConfigured = has(values, "VITE_FILECOIN_SEAL_API");
  const tokenConfigured = has(values, "VITE_FILECOIN_SEAL_TOKEN");

  addCheck(checks, {
    id: "seal-api-env",
    label: "Browser seal endpoint",
    required: true,
    passed: endpointConfigured,
    detail: endpointConfigured ? env(values, "VITE_FILECOIN_SEAL_API") : "Missing VITE_FILECOIN_SEAL_API",
    action: "Deploy the seal API and set VITE_FILECOIN_SEAL_API to POST /seal.",
  });
  addCheck(checks, {
    id: "seal-token-env",
    label: "Browser seal token",
    required: true,
    passed: tokenConfigured,
    detail: tokenConfigured ? "Bearer token configured" : "Missing VITE_FILECOIN_SEAL_TOKEN",
    action: "Set VITE_FILECOIN_SEAL_TOKEN to the token expected by FILECOIN_SEAL_TOKEN on the seal API.",
  });

  if (!endpointConfigured) {
    addCheck(checks, {
      id: "seal-api-health",
      label: "Seal API health",
      required: true,
      detail: "Missing VITE_FILECOIN_SEAL_API",
      action: "Deploy the seal API and configure VITE_FILECOIN_SEAL_API.",
    });
  } else {
    const healthUrl = filecoinDoctorUrl(values, "health");
    try {
      const { response, body } = await readJson(fetcher, healthUrl, { headers: headers(values) });
      const ready = Boolean(
        response.ok &&
          body?.ok &&
          body?.productionReady &&
          !body?.mockMode &&
          body?.hasPrivateKey &&
          body?.authRequired &&
          body?.persistence === "file" &&
          Number(body?.maxUploadBytes ?? 0) > 0,
      );
      addCheck(checks, {
        id: "seal-api-health",
        label: "Seal API health",
        required: true,
        passed: ready,
        detail: response.ok
          ? ready
            ? `production-ready; ${body.proofCount ?? 0} proofs; max ${body.maxUploadBytes} bytes`
            : `not production-ready: ${(body?.blockers ?? ["health contract incomplete"]).join(", ")}`
          : `HTTP ${response.status}`,
        action: "Run a non-mock seal API with SYNAPSE_PRIVATE_KEY, FILECOIN_SEAL_TOKEN and FILECOIN_PROOF_STORE_PATH.",
        url: healthUrl,
      });
      addCheck(checks, {
        id: "seal-api-contract",
        label: "Seal API endpoint contract",
        required: true,
        passed:
          response.ok &&
          Array.isArray(body?.endpoints) &&
          ["POST /seal", "GET /verify?cid=", "GET /proof/:cid"].every((endpoint) => body.endpoints.includes(endpoint)),
        detail: response.ok ? (Array.isArray(body?.endpoints) ? body.endpoints.join(", ") : "endpoints missing") : `HTTP ${response.status}`,
        action: "Expose POST /seal, GET /verify?cid= and GET /proof/:cid from the same seal API deployment.",
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
        action: "Expose POST /seal, GET /verify?cid= and GET /proof/:cid from the same seal API deployment.",
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

