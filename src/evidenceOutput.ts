import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const pathExists = async (path: string) => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

export const writeEvidenceOutput = async (
  outputPath: string,
  text: string,
  {
    distDir = "dist",
    distFileName = basename(outputPath),
    mirrorToDist = process.env.EVIDENCE_MIRROR_DIST !== "0",
  }: {
    distDir?: string;
    distFileName?: string;
    mirrorToDist?: boolean;
  } = {},
) => {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, text, "utf8");

  const written = [outputPath];
  const resolvedDistDir = resolve(distDir);
  if (!mirrorToDist || !(await pathExists(resolvedDistDir))) return written;

  const distOutputPath = resolve(resolvedDistDir, distFileName);
  const existing = await readFile(distOutputPath, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if (existing !== text) {
    await mkdir(dirname(distOutputPath), { recursive: true });
    await writeFile(distOutputPath, text, "utf8");
  }
  written.push(distOutputPath);
  return written;
};
