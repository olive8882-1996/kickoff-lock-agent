import type { MemoryRecord } from "./types";

export const generateShareCard = async (record: MemoryRecord): Promise<string> => {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");

  const { capsule, result } = record;
  const gradient = ctx.createLinearGradient(0, 0, 1200, 675);
  gradient.addColorStop(0, "#061112");
  gradient.addColorStop(0.52, "#102d24");
  gradient.addColorStop(1, "#05090b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 675);

  ctx.fillStyle = "rgba(241, 201, 77, 0.16)";
  ctx.fillRect(0, 0, 1200, 10);
  ctx.fillStyle = "#f1c94d";
  ctx.fillRect(0, 0, 480, 10);
  ctx.fillStyle = "#ff4d40";
  ctx.fillRect(480, 0, 320, 10);
  ctx.fillStyle = "#1aa6ff";
  ctx.fillRect(800, 0, 400, 10);

  ctx.fillStyle = "#eef7f3";
  ctx.font = "900 46px Inter, Arial, sans-serif";
  ctx.fillText("KICKOFF LOCK AGENT", 70, 92);
  ctx.fillStyle = "#ff5b4e";
  ctx.font = "800 24px Inter, Arial, sans-serif";
  ctx.fillText("LOCKED BEFORE KICKOFF", 70, 132);

  ctx.strokeStyle = "rgba(238, 247, 243, 0.22)";
  ctx.lineWidth = 2;
  ctx.strokeRect(70, 172, 1060, 330);

  ctx.fillStyle = "#f1c94d";
  ctx.font = "900 58px Inter, Arial, sans-serif";
  ctx.fillText(capsule.matchLabel.toUpperCase(), 104, 250);

  ctx.fillStyle = "#eef7f3";
  ctx.font = "900 104px Inter, Arial, sans-serif";
  ctx.fillText(`${capsule.prediction.homeScore} - ${capsule.prediction.awayScore}`, 104, 382);

  ctx.fillStyle = "rgba(238, 247, 243, 0.72)";
  ctx.font = "700 26px Inter, Arial, sans-serif";
  ctx.fillText(`Confidence ${capsule.prediction.confidence}%`, 106, 430);
  ctx.fillText(result ? `Actual ${result.homeScore}-${result.awayScore} · Score ${result.totalScore}/100` : "Actual pending · Proof ready", 106, 470);

  ctx.fillStyle = "rgba(238, 247, 243, 0.9)";
  ctx.font = "700 22px Inter, Arial, sans-serif";
  const cid = capsule.filecoinProof.cid;
  ctx.fillText(`CID ${cid.slice(0, 48)}`, 70, 574);
  ctx.fillText(`${cid.slice(48)}`, 70, 606);

  ctx.fillStyle = capsule.filecoinProof.mode === "real" ? "#d8ffd9" : "#ffe8a8";
  ctx.font = "900 28px Inter, Arial, sans-serif";
  ctx.fillText(`${capsule.filecoinProof.mode.toUpperCase()} PROOF`, 870, 574);
  ctx.fillText(capsule.filecoinProof.proofStatus.toUpperCase(), 870, 612);

  return canvas.toDataURL("image/png");
};

export const downloadDataUrl = (dataUrl: string, fileName: string) => {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
};
