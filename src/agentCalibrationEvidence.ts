import type { GameModeRun } from "./types";

export type AgentCalibrationSampleStatus = "calibrated" | "overconfident" | "underconfident" | "human-edge";

export type AgentCalibrationEvidenceItem = {
  capsuleId: string;
  matchLabel: string;
  confidence: number;
  totalScore: number;
  calibrationError: number;
  status: AgentCalibrationSampleStatus;
  insight: string;
};

export type AgentCalibrationEvidencePacket = {
  ready: boolean;
  runId?: string;
  samples: number;
  averageCalibrationError: number;
  calibratedSamples: number;
  overconfidentSamples: number;
  underconfidentSamples: number;
  humanEdgeSamples: number;
  agentEdgeSamples: number;
  passedChecks: number;
  totalChecks: number;
  checks: Array<{
    key: string;
    label: string;
    passed: boolean;
    detail: string;
  }>;
  items: AgentCalibrationEvidenceItem[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const classifySample = (sample: {
  confidence: number;
  totalScore: number;
  calibrationError: number;
}): AgentCalibrationSampleStatus => {
  if (sample.calibrationError <= 15) return "calibrated";
  if (sample.confidence >= 70 && sample.totalScore < 60) return "overconfident";
  if (sample.confidence <= 50 && sample.totalScore >= 70) return "underconfident";
  return sample.totalScore < 60 ? "human-edge" : "calibrated";
};

const insightFor = (status: AgentCalibrationSampleStatus) => {
  if (status === "overconfident") return "Agent confidence ran ahead of the settled score; require a human override note next time.";
  if (status === "underconfident") return "Agent was too cautious on a strong result; promote this pattern into future confidence hints.";
  if (status === "human-edge") return "Human review should challenge this pick before the next lock.";
  return "Agent confidence matched the settled score band.";
};

const emptyPacket = (reason: string): AgentCalibrationEvidencePacket => {
  const checks = [
    { key: "run", label: "Agent proof run", passed: false, detail: "missing" },
    { key: "samples", label: "Revealed samples", passed: false, detail: "0 samples" },
    { key: "calibration", label: "Calibration score", passed: false, detail: "not available" },
    { key: "review", label: "Human override signal", passed: false, detail: "no samples" },
  ];
  return {
    ready: false,
    samples: 0,
    averageCalibrationError: 0,
    calibratedSamples: 0,
    overconfidentSamples: 0,
    underconfidentSamples: 0,
    humanEdgeSamples: 0,
    agentEdgeSamples: 0,
    passedChecks: 0,
    totalChecks: checks.length,
    checks,
    items: [],
    summary: reason,
    nextAction: "Reveal one locked prediction, then create an Agent vs Human mode proof.",
    copyText: [
      "Kickoff Lock Agent Agent vs Human calibration",
      "Ready: no",
      `Summary: ${reason}`,
      "Next action: Reveal one locked prediction, then create an Agent vs Human mode proof.",
    ].join("\n"),
  };
};

export const buildAgentCalibrationEvidencePacket = (
  runs: GameModeRun[],
): AgentCalibrationEvidencePacket => {
  const run = runs
    .filter((item) => item.modeId === "agent-vs-human")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  if (!run) return emptyPacket("No Agent vs Human proof run has been created yet.");
  if (run.artifact?.kind !== "agent-calibration") {
    return {
      ...emptyPacket("Latest Agent vs Human run is missing a calibration artifact."),
      runId: run.id,
      nextAction: "Recreate the Agent vs Human proof after at least one prediction has been revealed.",
    };
  }

  const items = run.artifact.samples.map<AgentCalibrationEvidenceItem>((sample) => {
    const status = classifySample(sample);
    return {
      capsuleId: sample.capsuleId,
      matchLabel: sample.matchLabel,
      confidence: sample.confidence,
      totalScore: sample.totalScore,
      calibrationError: sample.calibrationError,
      status,
      insight: insightFor(status),
    };
  });
  const calibratedSamples = items.filter((item) => item.status === "calibrated").length;
  const overconfidentSamples = items.filter((item) => item.status === "overconfident").length;
  const underconfidentSamples = items.filter((item) => item.status === "underconfident").length;
  const humanEdgeSamples = items.filter((item) => item.status === "human-edge" || item.status === "overconfident").length;
  const agentEdgeSamples = calibratedSamples + underconfidentSamples;
  const averageCalibrationError = run.artifact.averageCalibrationError;
  const checks = [
    { key: "run", label: "Agent proof run", passed: true, detail: run.id },
    {
      key: "samples",
      label: "Revealed samples",
      passed: items.length > 0,
      detail: `${items.length} sample${items.length === 1 ? "" : "s"}`,
    },
    {
      key: "calibration",
      label: "Calibration score",
      passed: items.length > 0 && averageCalibrationError <= 25,
      detail: `avg error ${averageCalibrationError}`,
    },
    {
      key: "review",
      label: "Human override signal",
      passed: items.length > 0 && humanEdgeSamples + agentEdgeSamples === items.length,
      detail: `${humanEdgeSamples} human edge · ${agentEdgeSamples} agent edge`,
    },
  ];
  const passedChecks = checks.filter((check) => check.passed).length;
  const ready = passedChecks === checks.length;
  const nextAction = ready
    ? "Publish this calibration packet with the Agent vs Human mode proof."
    : overconfidentSamples > 0
      ? "Add a human challenge note before trusting high-confidence agent picks."
      : "Add more revealed samples until calibration error is below 25.";
  const summary =
    items.length === 0
      ? "Agent vs Human proof exists, but no revealed samples are attached."
      : `${items.length} revealed sample${items.length === 1 ? "" : "s"} · avg error ${averageCalibrationError} · ${humanEdgeSamples} human-edge flag${humanEdgeSamples === 1 ? "" : "s"}.`;
  const copyText = [
    "Kickoff Lock Agent Agent vs Human calibration",
    `Ready: ${ready ? "yes" : "no"}`,
    `Run: ${run.id}`,
    `Samples: ${items.length}`,
    `Average calibration error: ${averageCalibrationError}`,
    `Calibrated samples: ${calibratedSamples}`,
    `Overconfident samples: ${overconfidentSamples}`,
    `Underconfident samples: ${underconfidentSamples}`,
    `Human edge samples: ${humanEdgeSamples}`,
    `Agent edge samples: ${agentEdgeSamples}`,
    `Checks: ${passedChecks}/${checks.length}`,
    `Next action: ${nextAction}`,
    ...items.map(
      (item) =>
        `${item.matchLabel}: confidence ${item.confidence}, score ${item.totalScore}, error ${item.calibrationError}, ${item.status}`,
    ),
  ].join("\n");

  return {
    ready,
    runId: run.id,
    samples: items.length,
    averageCalibrationError,
    calibratedSamples,
    overconfidentSamples,
    underconfidentSamples,
    humanEdgeSamples,
    agentEdgeSamples,
    passedChecks,
    totalChecks: checks.length,
    checks,
    items,
    summary,
    nextAction,
    copyText,
  };
};
