import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("seal E2E runner", () => {
  it("builds the mock seal app into an isolated dist directory", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/run-seal-e2e.mjs"), "utf8");

    expect(script).toContain('resolve(".e2e-dist/seal")');
    expect(script).toContain('"vite", "build", "--outDir", sealDistDir');
    expect(script).toContain('"vite", "preview"');
    expect(script).toContain('"--outDir", sealDistDir');
    expect(script).not.toContain('["run", "build"]');
  });
});
