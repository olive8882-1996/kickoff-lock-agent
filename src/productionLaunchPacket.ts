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

export type ProductionLaunchCommandStatus = "done" | "ready" | "blocked";

export type ProductionLaunchCommandQueueItem = {
  id: string;
  workstreamId: string;
  label: string;
  command: string;
  status: ProductionLaunchCommandStatus;
  runtimeEnv: string[];
  targetEnv: string[];
  reason: string;
};

export type ProductionLaunchPacket = {
  ready: boolean;
  runtime: string;
  evidence: string;
  missingRuntimeEnv: string[];
  targetEnvKeys: string[];
  openSteps: number;
  totalSteps: number;
  openCommands: number;
  blockedCommands: number;
  commands: string[];
  commandQueue: ProductionLaunchCommandQueueItem[];
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
      return "bun run runtime:config && bun run build && bun run deploy:pages";
    case "automation-evidence":
      return "bun run verify:acceptance";
    default:
      return "bun run doctor:production";
  }
};

const runtimeEnvFor = (item: ProductionDoctorItem, missingRuntimeEnv: string[]) =>
  missingRuntimeEnv.filter((key) => item.detail.includes(key) || item.action.includes(key));

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

const commandQueueFor = (step: ProductionLaunchStep): ProductionLaunchCommandQueueItem[] => {
  const status: ProductionLaunchCommandStatus =
    step.status === "done" ? "done" : step.missingEnv.length > 0 ? "blocked" : "ready";
  const base = {
    workstreamId: step.id,
    status,
    runtimeEnv: step.missingEnv,
    targetEnv: step.targetEnv,
    reason: step.action,
  };
  const item = (id: string, label: string, command: string): ProductionLaunchCommandQueueItem => ({
    ...base,
    id,
    label,
    command,
  });

  switch (step.id) {
    case "account-cloud":
      return [
        item("account-cloud-schema", "Apply Supabase schema", "bun run supabase:schema:apply"),
        item("account-cloud-doctor", "Verify cloud account read-back", "bun run doctor:supabase"),
      ];
    case "realtime-data":
      return [
        item("realtime-data-providers", "Check live provider credentials", "bun run data:providers:check"),
        item("realtime-data-targets", "Scout production fixture targets", "bun run scout:data-targets"),
        item("realtime-data-doctor", "Verify realtime data evidence", "bun run doctor:data"),
      ];
    case "filecoin-auto-seal":
      return [
        item("filecoin-api-health", "Check seal API health", "bun run filecoin:api:check"),
        item("filecoin-seal-targets", "Seal production proof targets", "bun run seal:production-targets"),
        item("filecoin-doctor", "Verify Filecoin read-back", "bun run doctor:filecoin"),
      ];
    case "public-sharing":
      return [
        item("public-sharing-record-card", "Generate record share image", "bun run share:production-image"),
        item("public-sharing-mode-card", "Generate mode share image", "bun run share:production-image -- --kind=mode --out=public/generated/kickoff-production-mode-share.png"),
        item("public-sharing-record-upload", "Upload record share image to storage", "bun run share:upload-image"),
        item("public-sharing-mode-upload", "Upload mode share image to storage", "bun run share:upload-image -- --kind=mode --file=public/generated/kickoff-production-mode-share.png"),
        item("public-sharing-channel", "Sync share-channel evidence", "bun run sharing:bootstrap"),
        item("public-sharing-doctor", "Verify public proof and share links", "bun run doctor:sharing"),
      ];
    case "leaderboards":
      return [
        item("leaderboards-doctor", "Verify leaderboard scopes", "bun run doctor:supabase"),
      ];
    case "public-deployment":
      return [
        item("public-deployment-runtime-config", "Generate runtime config", "bun run runtime:config"),
        item("public-deployment-runtime-check", "Check runtime config completeness", "bun run runtime:config:check"),
        item("public-deployment-build", "Build release assets", "bun run build"),
        item("public-deployment-pages", "Deploy public app", "bun run deploy:pages"),
        item("public-deployment-evidence", "Verify live Pages bundle", "bun run deploy:evidence"),
      ];
    case "automation-evidence":
      return [
        item("automation-acceptance", "Publish acceptance evidence", "bun run verify:acceptance"),
        item("automation-runtime-config", "Refresh runtime config before release build", "bun run runtime:config"),
        item("automation-runtime-check", "Check runtime config before release build", "bun run runtime:config:check"),
        item("automation-build", "Rebuild release after evidence and runtime config", "bun run build"),
        item("automation-deploy-before-verify", "Deploy release before production verification", "bun run deploy:pages"),
        item("automation-deploy-evidence-before-verify", "Verify live bundle before production verification", "bun run deploy:evidence"),
        item("automation-production-verify", "Refresh production evidence", "KICKOFF_VERIFY_ALLOW_FAILURES=1 bun run verify:production"),
        item("automation-production-build", "Rebuild release with production evidence", "bun run build"),
        item("automation-production-deploy", "Deploy refreshed production evidence", "bun run deploy:pages"),
        item("automation-production-deploy-evidence", "Verify final live bundle", "bun run deploy:evidence"),
        item("automation-production-doctor", "Run final production doctor", "bun run doctor:production && bun run goal:audit"),
      ];
    default:
      return [
        item(`${step.id}-doctor`, `Verify ${step.label}`, step.command),
      ];
  }
};

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
  const commandQueue = steps.flatMap(commandQueueFor);
  const openCommands = commandQueue.filter((item) => item.status !== "done").length;
  const blockedCommands = commandQueue.filter((item) => item.status === "blocked").length;
  const targetEnvKeys = unique(steps.flatMap((step) => step.targetEnv));
  const commands = unique([
    ...commandQueue.filter((item) => item.status !== "done").map((item) => item.command),
    report.ready ? "" : "KICKOFF_VERIFY_ALLOW_FAILURES=1 bun run verify:production",
    "bun run doctor:production",
  ]);
  const next = steps.find((step) => step.status !== "done");
  const runtime = `${report.runtime.passed}/${report.runtime.total} runtime gates`;
  const evidence = `${report.evidence.passed}/${report.evidence.total || 0} production checks`;
  const summary = report.ready
    ? "Production launch packet is complete."
    : `${openSteps}/${steps.length} launch workstreams still open · ${openCommands} queued commands · ${runtime} · ${evidence}`;
  const nextAction = next
    ? `${next.label}: ${next.action}`
    : "Run final production verification and submit.";
  const copyText = [
    "Kickoff Lock Agent production launch packet",
    `Ready: ${report.ready ? "yes" : "no"}`,
    `Runtime: ${runtime}`,
    `Evidence: ${evidence}`,
    `Missing runtime env: ${report.runtime.missingEnvKeys.join(", ") || "none"}`,
    `Target env keys: ${targetEnvKeys.join(", ") || "none"}`,
    `Open workstreams: ${openSteps}/${steps.length}`,
    `Command queue: ${openCommands} open, ${blockedCommands} blocked by runtime env`,
    `Next action: ${nextAction}`,
    "Commands:",
    ...commands.map((command) => `- ${command}`),
    "Command queue:",
    ...commandQueue.map((item) =>
      [
        `- ${item.label} [${item.status}]`,
        `  command: ${item.command}`,
        `  runtime env: ${item.runtimeEnv.join(", ") || "none"}`,
        `  target env: ${item.targetEnv.join(", ") || "none"}`,
        `  reason: ${item.reason}`,
      ].join("\n"),
    ),
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
    targetEnvKeys,
    openSteps,
    totalSteps: steps.length,
    openCommands,
    blockedCommands,
    commands,
    commandQueue,
    steps,
    summary,
    nextAction,
    copyText,
  };
};
