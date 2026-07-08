import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeEvidenceOutput } from "./evidenceOutput";

const exists = async (path: string) => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

describe("evidence output script helper", () => {
  it("mirrors evidence into dist when a release build already exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "kickoff-evidence-output-"));
    try {
      const publicPath = join(root, "public", "acceptance-evidence.json");
      const distDir = join(root, "dist");
      await writeEvidenceOutput(join(distDir, ".keep"), "build exists\n", { mirrorToDist: false });

      const written = await writeEvidenceOutput(publicPath, "{\"ok\":true}\n", { distDir });

      expect(written).toEqual([publicPath, join(distDir, "acceptance-evidence.json")]);
      expect(await readFile(publicPath, "utf8")).toBe("{\"ok\":true}\n");
      expect(await readFile(join(distDir, "acceptance-evidence.json"), "utf8")).toBe("{\"ok\":true}\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not create dist before the first build", async () => {
    const root = await mkdtemp(join(tmpdir(), "kickoff-evidence-output-"));
    try {
      const publicPath = join(root, "public", "production-evidence.json");
      const distDir = join(root, "dist");

      const written = await writeEvidenceOutput(publicPath, "{\"ok\":false}\n", { distDir });

      expect(written).toEqual([publicPath]);
      expect(await exists(distDir)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
