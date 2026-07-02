import { spawn } from "node:child_process";
import { get } from "node:http";

const previewUrl = "http://127.0.0.1:4173/kickoff-lock-agent/";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ping = () =>
  new Promise((resolve) => {
    const req = get(previewUrl, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });

const waitForPreview = async () => {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (await ping()) return;
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

const preview = spawn("bunx", ["vite", "preview", "--host", "127.0.0.1", "--port", "4173"], {
  stdio: "inherit",
});

try {
  await waitForPreview();
  await run("bunx", ["playwright", "test"]);
} finally {
  preview.kill("SIGTERM");
}
