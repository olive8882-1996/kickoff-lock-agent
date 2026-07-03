import { spawn } from "node:child_process";
import { get } from "node:http";
import { createServer } from "node:net";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const findOpenPort = (startPort) =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") resolve(findOpenPort(startPort + 1));
      else reject(error);
    });
    server.listen(startPort, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });

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

let sealApi;
let preview;

try {
  const appPort = await findOpenPort(4174);
  const sealPort = await findOpenPort(8788);
  const appUrl = `http://127.0.0.1:${appPort}/kickoff-lock-agent/`;
  const sealHealthUrl = `http://127.0.0.1:${sealPort}/health`;
  const env = {
    ...process.env,
    FILECOIN_SEAL_MOCK: "1",
    PORT: String(sealPort),
    VITE_FILECOIN_SEAL_API: `http://127.0.0.1:${sealPort}/seal`,
    E2E_BASE_URL: appUrl,
    E2E_TEST_MATCH: "seal.spec.ts",
  };

  sealApi = spawn("bun", ["server/filecoin-seal-api.mjs"], {
    env,
    stdio: "inherit",
  });
  await waitFor(sealHealthUrl, "Mock Filecoin seal API");
  await run("bun", ["run", "build"], { env });
  preview = spawn("bunx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(appPort), "--strictPort"], {
    env,
    stdio: "inherit",
  });
  await waitFor(appUrl, "Preview");
  await run("bunx", ["playwright", "test"], { env });
} finally {
  preview?.kill("SIGTERM");
  sealApi.kill("SIGTERM");
}
