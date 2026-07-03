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

const waitForPreview = async (previewUrl) => {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (await ping(previewUrl)) return;
    await sleep(500);
  }
  throw new Error(`Preview did not become ready at ${previewUrl}`);
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

let preview;

try {
  await run("bun", ["run", "build"]);
  const previewPort = await findOpenPort(4173);
  const previewUrl = `http://127.0.0.1:${previewPort}/kickoff-lock-agent/`;
  const env = { ...process.env, E2E_BASE_URL: previewUrl };
  preview = spawn("bunx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(previewPort), "--strictPort"], {
    env,
    stdio: "inherit",
  });
  await waitForPreview(previewUrl);
  await run("bunx", ["playwright", "test"], { env });
} finally {
  preview?.kill("SIGTERM");
}
