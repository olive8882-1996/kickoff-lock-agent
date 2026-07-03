import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const distDir = resolve(process.env.DEPLOY_DIST_DIR ?? "dist");
const branch = process.env.DEPLOY_BRANCH ?? "gh-pages";
const remote = process.env.DEPLOY_REMOTE ?? "origin";
const message = process.env.DEPLOY_MESSAGE ?? "Deploy Kickoff Lock Agent";
const dryRun = process.env.DEPLOY_DRY_RUN === "1";

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
  }
};

const output = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}: ${result.stderr}`);
  }
  return result.stdout.trim();
};

const hasChanges = (worktree) => output("git", ["status", "--porcelain"], { cwd: worktree }).length > 0;

const tempRoot = await mkdtemp(join(tmpdir(), "kickoff-lock-gh-pages-"));

try {
  run("git", ["fetch", remote, `${branch}:${branch}`]);
  run("git", ["worktree", "add", tempRoot, branch]);
  run("rsync", ["-a", "--delete", "--exclude=.git", `${distDir}/`, `${tempRoot}/`]);
  run("touch", [join(tempRoot, ".nojekyll")]);

  const status = output("git", ["status", "--short"], { cwd: tempRoot });
  if (status) console.log(status);

  if (!hasChanges(tempRoot)) {
    console.log(`No ${branch} changes to deploy.`);
  } else if (dryRun) {
    console.log(`DEPLOY_DRY_RUN=1; ${branch} changes were not committed.`);
  } else {
    run("git", ["add", "-A"], { cwd: tempRoot });
    run("git", ["commit", "-m", message], { cwd: tempRoot });
    run("git", ["push", remote, branch], { cwd: tempRoot });
  }
} finally {
  try {
    run("git", ["worktree", "remove", "--force", tempRoot]);
  } catch {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
