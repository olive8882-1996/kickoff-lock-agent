import type { ProductionDoctorItem, ProductionDoctorReport } from "./productionDoctor";

export type ProductionLaunchStep = {
  id: string;
  label: string;
  status: ProductionDoctorItem["status"];
  missingEnv: string[];
  targetEnv: string[];
  command: string;
  action: string;
};

export type ProductionLaunchPacket = {
  ready: boolean;
  runtime: string;
  evidence: string;
  missingRuntimeEnv: string[];
  openSteps: number;
  totalSteps: number;
  commands: string[];
  steps: ProductionLaunchStep[];
  summary: string;
  nextAction: string;
  copyText: string;
};

const commandFor = (id: string) => {
  switch (id) {
    case "account-cloud":
      return "bun run doctor:supabase";
    case "realtime-data":
      return "bun run doctor:data";
    case "filecoin-auto-seal":
      return "bun run doctor:filecoin";
    case "public-sharing":
      return "bun run doctor:sharing";
    case "leaderboards":
      return "bun run doctor:supabase";
    case "public-deployment":
      return "bun run build && bun run deploy:pages";
    case "automation-evidence":
      return "bun run verify:acceptance";
    default:
      return "bun run doctor:production";
  }
};

const runtimeEnvFor = (item: ProductionDoctorItem, missingRuntimeEnv: string[]) =>
  missingRuntimeEnv.filter((key) => item.detail.includes(key) || item.action.includes(key));

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

export const buildProductionLaunchPacket = (report: ProductionDoctorReport): ProductionLaunchPacket => {
  const steps = report.items.map<ProductionLaunchStep>((item) => ({
    id: item.id,
    label: item.label,
    status: item.status,
    missingEnv: runtimeEnvFor(item, report.runtime.missingEnvKeys),
    targetEnv: item.envKeys,
    command: commandFor(item.id),
    action: item.status === "done" ? "External evidence is already green." : item.action,
  }));
  const openSteps = steps.filter((step) => step.status !== "done").length;
  const commands = unique([
    ...steps.filter((step) => step.status !== "done").map((step) => step.command),
    report.ready ? "" : "KICKOFF_VERIFY_ALLOW_FAILURES=1 bun run verify:production",
    report.ready ? "" : "bun run doctor:production",
  ]);
  const next = steps.find((step) => step.status !== "done");
  const runtime = `${report.runtime.passed}/${report.runtime.total} runtime gates`;
  const evidence = `${report.evidence.passed}/${report.evidence.total || 0} production checks`;
  const summary = report.ready
    ? "Production launch packet is complete."
    : `${openSteps}/${steps.length} launch workstreams still open · ${runtime} · ${evidence}`;
  const nextAction = next
    ? `${next.label}: ${next.action}`
    : "Run final production verification and submit.";
  const copyText = [
    "Kickoff Lock Agent production launch packet",
    `Ready: ${report.ready ? "yes" : "no"}`,
    `Runtime: ${runtime}`,
    `Evidence: ${evidence}`,
    `Missing runtime env: ${report.runtime.missingEnvKeys.join(", ") || "none"}`,
    `Open workstreams: ${openSteps}/${steps.length}`,
    `Next action: ${nextAction}`,
    "Commands:",
    ...commands.map((command) => `- ${command}`),
    "Workstreams:",
    ...steps.map((step) =>
      [
        `- ${step.label} [${step.status}]`,
        `  command: ${step.command}`,
        `  runtime env: ${step.missingEnv.join(", ") || "none"}`,
        `  target env: ${step.targetEnv.join(", ") || "none"}`,
        `  action: ${step.action}`,
      ].join("\n"),
    ),
  ].join("\n");

  return {
    ready: report.ready,
    runtime,
    evidence,
    missingRuntimeEnv: report.runtime.missingEnvKeys,
    openSteps,
    totalSteps: steps.length,
    commands,
    steps,
    summary,
    nextAction,
    copyText,
  };
};
