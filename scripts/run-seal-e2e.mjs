import { spawn } from "node:child_process";
import { get } from "node:http";

const appUrl = "http://127.0.0.1:4174/kickoff-lock-agent/";
const sealHealthUrl = "http://127.0.0.1:8788/health";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ping = (url) =>
  new Promise((resolve) => {
    const req = get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });

const waitFor = async (url, label) => {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (await ping(url)) return;
    await sleep(500);
  }
  throw new Error(`${label} did not become ready at ${url}`);
};

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      ...options,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
    child.on("error", reject);
  });

const env = {
  ...process.env,
  FILECOIN_SEAL_MOCK: "1",
  PORT: "8788",
  VITE_FILECOIN_SEAL_API: "http://127.0.0.1:8788/seal",
  E2E_BASE_URL: appUrl,
  E2E_TEST_MATCH: "seal.spec.ts",
};

const sealApi = spawn("bun", ["server/filecoin-seal-api.mjs"], {
  env,
  stdio: "inherit",
});

let preview;

try {
  await waitFor(sealHealthUrl, "Mock Filecoin seal API");
  await run("bun", ["run", "build"], { env });
  preview = spawn("bunx", ["vite", "preview", "--host", "127.0.0.1", "--port", "4174"], {
    env,
    stdio: "inherit",
  });
  await waitFor(appUrl, "Preview");
  await run("bunx", ["playwright", "test"], { env });
} finally {
  preview?.kill("SIGTERM");
  sealApi.kill("SIGTERM");
}
