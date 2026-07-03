import { spawnSync } from "node:child_process";

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

const remoteUrl = process.env.PAGES_REPO ?? output("git", ["remote", "get-url", "origin"]);
const match = remoteUrl.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/.]+)(?:\.git)?$/);
if (!match?.groups) {
  throw new Error(`Could not parse GitHub owner/repo from ${remoteUrl}`);
}

const repo = `${match.groups.owner}/${match.groups.repo}`;
const endpoint = `repos/${repo}/pages/builds`;

if (process.env.PAGES_BUILD_DRY_RUN === "1") {
  console.log(`Would request GitHub Pages build for ${repo}`);
} else {
  const response = output("gh", ["api", "--method", "POST", endpoint, "--jq", "{status,commit,created_at,updated_at}"]);
  console.log(response);
}
