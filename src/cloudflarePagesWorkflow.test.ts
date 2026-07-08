import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = "docs/deploy-cloudflare-pages.workflow.yml";

const stepBlock = (workflow: string, stepName: string) => {
  const start = workflow.indexOf(`- name: ${stepName}`);
  if (start < 0) return "";
  const next = workflow.indexOf("\n      - name:", start + 1);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, next);
};

describe("Cloudflare Pages deployment workflow", () => {
  it("keeps server provider secrets out of the browser runtime config step", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const runtimeConfig = stepBlock(workflow, "Generate browser runtime config");
    const deploy = stepBlock(workflow, "Deploy Cloudflare Pages with Functions");
    const diagnostics = stepBlock(workflow, "Generate diagnostic production evidence");

    expect(runtimeConfig).toContain("VITE_DATA_PROXY_SAME_ORIGIN");
    expect(runtimeConfig).toContain("VITE_FILECOIN_SEAL_SAME_ORIGIN");
    expect(runtimeConfig).not.toContain("secrets.VITE_APIFOOTBALL_KEY");
    expect(runtimeConfig).not.toContain("secrets.VITE_ODDS_API_KEY");
    expect(runtimeConfig).not.toContain("secrets.VITE_FILECOIN_SEAL_TOKEN");

    expect(deploy).toContain("APIFOOTBALL_KEY: ${{ secrets.APIFOOTBALL_KEY }}");
    expect(deploy).toContain("ODDS_API_KEY: ${{ secrets.ODDS_API_KEY }}");
    expect(deploy).toContain("FILECOIN_SEAL_TOKEN: ${{ secrets.FILECOIN_SEAL_TOKEN }}");
    expect(diagnostics).toContain("APIFOOTBALL_KEY: ${{ secrets.APIFOOTBALL_KEY }}");
    expect(diagnostics).toContain("FILECOIN_SEAL_TOKEN: ${{ secrets.FILECOIN_SEAL_TOKEN }}");
  });
});
