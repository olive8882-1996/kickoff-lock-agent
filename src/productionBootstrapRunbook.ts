export type ProductionBootstrapRunbookStepStatus = "passed" | "failed" | "skipped";

export type ProductionBootstrapRunbookStep = {
  id: string;
  label: string;
  command: string;
  status: ProductionBootstrapRunbookStepStatus;
  exitCode?: number | null;
  parsedReady?: boolean;
  parsedNextAction?: string;
  parsedCommands?: string[];
  parsedMissingEnv?: string[];
  parsedStageReadyCount?: number;
  parsedTotalStages?: number;
  parsedProgressLabel?: string;
  parsedBlockedStage?: {
    id?: string;
    label?: string;
    status?: string;
    command?: string;
    missingEnv?: string[];
    detail?: string;
  };
  stdoutTail?: string;
  stderrTail?: string;
};

export type ProductionBootstrapAcceptanceChecklistItem = {
  id:
    | "env"
    | "access"
    | "secrets"
    | "public-deployment"
    | "same-origin-backend"
    | "account"
    | "realtime-data"
    | "filecoin"
    | "sharing"
    | "leaderboard"
    | "final-evidence";
  label: string;
  status: "passed" | "blocked";
  command: string;
  passedSteps: number;
  totalSteps: number;
  missingEnv: string[];
  evidence: string;
  nextAction: string;
};

export type ProductionBootstrapRunbook = {
  artifactVersion?: number;
  generatedAt?: string;
  source?: string;
  execute?: boolean;
  ready: boolean;
  passedSteps: number;
  totalSteps: number;
  failedSteps: number;
  nextAction: string;
  steps: ProductionBootstrapRunbookStep[];
  acceptanceChecklist?: ProductionBootstrapAcceptanceChecklistItem[];
  outputPath?: string;
  wrote?: boolean;
};

export type ProductionBootstrapRunbookSummary = {
  ready: boolean;
  mode: "execute" | "plan";
  passedSteps: number;
  totalSteps: number;
  failedSteps: number;
  blockedSteps: ProductionBootstrapRunbookStep[];
  firstBlockedStep?: ProductionBootstrapRunbookStep;
  acceptanceChecklist: ProductionBootstrapAcceptanceChecklistItem[];
  commands: string[];
  copyText: string;
  nextAction: string;
};

const truncateText = (text: string, maxLength = 260) =>
  text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}...` : text;

const compactLogTail = (tail = "") =>
  truncateText(tail
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4)
    .join(" · "));

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));
const checklistMissing = (items: string[]) => unique(items).slice(0, 12);
const stepSatisfied = (step: ProductionBootstrapRunbookStep) =>
  step.status === "passed" && step.parsedReady !== false && !step.parsedBlockedStage;

const stepEvidence = (step: ProductionBootstrapRunbookStep) => {
  const blocked = step.parsedBlockedStage;
  if (blocked?.detail) return truncateText(blocked.detail);
  if (step.parsedNextAction) return truncateText(step.parsedNextAction);
  const stderr = compactLogTail(step.stderrTail);
  const stdout = compactLogTail(step.stdoutTail);
  if (stderr) return stderr;
  if (stdout) return stdout;
  return step.status === "passed" ? "Step completed." : "No log tail captured.";
};

const gateDefinitions: Array<{
  id: ProductionBootstrapAcceptanceChecklistItem["id"];
  label: string;
  stepIds: string[];
  command: string;
  fallbackAction: string;
}> = [
  {
    id: "env",
    label: "Production runtime env",
    stepIds: ["env-plan", "runtime-config"],
    command: "bun run env:production:plan && bun run runtime:config:check",
    fallbackAction: "Fill the missing production env values, then regenerate runtime-config.js.",
  },
  {
    id: "access",
    label: "Production account access",
    stepIds: ["access-preflight"],
    command: "bun run access:preflight",
    fallbackAction: "Authenticate Cloudflare/Supabase CLI access or set deploy tokens before executing production bootstrap.",
  },
  {
    id: "secrets",
    label: "Production secrets handoff",
    stepIds: ["secrets-handoff"],
    command: "bun run secrets:handoff",
    fallbackAction: "Fill manual production secrets and run the generated Cloudflare Pages secret commands.",
  },
  {
    id: "public-deployment",
    label: "Public deployment evidence",
    stepIds: ["public-deployment"],
    command: "bun run deploy:pages && bun run deploy:evidence",
    fallbackAction: "Publish the latest dist build and deployment evidence, then re-run bun run deploy:evidence.",
  },
  {
    id: "same-origin-backend",
    label: "Same-origin backend routes",
    stepIds: ["cloudflare-pages"],
    command: "bun run pages:cf:preflight",
    fallbackAction: "Finish Cloudflare Pages Functions auth or configure external Worker URLs.",
  },
  {
    id: "account",
    label: "Real account and cloud history",
    stepIds: ["supabase"],
    command: "bun run supabase:bootstrap",
    fallbackAction: "Apply Supabase schema, seed account targets and verify cloud read-back.",
  },
  {
    id: "realtime-data",
    label: "Realtime match data",
    stepIds: ["data"],
    command: "bun run data:bootstrap",
    fallbackAction: "Deploy the data proxy, preflight providers, scout fixture targets and run doctor:data.",
  },
  {
    id: "filecoin",
    label: "Filecoin one-click seal",
    stepIds: ["filecoin"],
    command: "bun run filecoin:bootstrap",
    fallbackAction: "Preflight the seal API, seal record/mode targets and verify CID read-back.",
  },
  {
    id: "sharing",
    label: "Public share cards",
    stepIds: ["sharing"],
    command: "bun run sharing:bootstrap",
    fallbackAction: "Upload record/mode share images, sync manifests and verify public proof pages.",
  },
  {
    id: "leaderboard",
    label: "Backend leaderboards",
    stepIds: ["leaderboard"],
    command: "bun run leaderboard:bootstrap",
    fallbackAction: "Verify the current user in global, friend and season leaderboard scopes.",
  },
  {
    id: "final-evidence",
    label: "Final production audit",
    stepIds: ["collector", "production-evidence", "goal-audit"],
    command: "bun run collect:production && bun run verify:production && bun run goal:audit",
    fallbackAction: "Collect final evidence and rerun the original goal audit.",
  },
];

export const buildProductionBootstrapAcceptanceChecklist = (
  runbook?: Pick<ProductionBootstrapRunbook, "steps">,
): ProductionBootstrapAcceptanceChecklistItem[] => {
  const steps = runbook?.steps ?? [];
  return gateDefinitions.map((gate) => {
    const gateSteps = gate.stepIds.map((id) => steps.find((step) => step.id === id)).filter(Boolean) as ProductionBootstrapRunbookStep[];
    const failed = gateSteps.find((step) => !stepSatisfied(step));
    const passedSteps = gateSteps.filter(stepSatisfied).length;
    const totalSteps = gate.stepIds.length;
    const missingEnv = checklistMissing(gateSteps.flatMap((step) => step.parsedMissingEnv ?? step.parsedBlockedStage?.missingEnv ?? []));
    return {
      id: gate.id,
      label: gate.label,
      status: gateSteps.length === totalSteps && !failed ? "passed" : "blocked",
      command: failed?.parsedBlockedStage?.command || failed?.command || gate.command,
      passedSteps,
      totalSteps,
      missingEnv,
      evidence: failed
        ? stepEvidence(failed)
        : gateSteps.length === totalSteps
          ? `${passedSteps}/${totalSteps} bootstrap step${totalSteps === 1 ? "" : "s"} passed.`
          : "Bootstrap step evidence has not been generated yet.",
      nextAction: failed?.parsedNextAction || failed?.parsedBlockedStage?.detail || gate.fallbackAction,
    };
  });
};

export const summarizeProductionBootstrapRunbook = (
  runbook?: ProductionBootstrapRunbook,
  fallbackStatus = "Run bun run production:bootstrap -- --json to publish production-bootstrap-runbook.json.",
): ProductionBootstrapRunbookSummary => {
  if (!runbook) {
    return {
      ready: false,
      mode: "plan",
      passedSteps: 0,
      totalSteps: 0,
      failedSteps: 0,
      blockedSteps: [],
      acceptanceChecklist: buildProductionBootstrapAcceptanceChecklist(),
      commands: ["bun run production:bootstrap -- --json"],
      nextAction: fallbackStatus,
      copyText: [
        "Kickoff Lock Agent production bootstrap runbook",
        "Ready: no",
        "Mode: plan",
        "Steps: 0/0",
        `Next action: ${fallbackStatus}`,
        "Commands:",
        "- bun run production:bootstrap -- --json",
      ].join("\n"),
    };
  }

  const blockedSteps = runbook.steps.filter((step) => !stepSatisfied(step));
  const acceptanceChecklist = runbook.acceptanceChecklist ?? buildProductionBootstrapAcceptanceChecklist(runbook);
  const commands = Array.from(
    new Set(runbook.steps.flatMap((step) => [step.command, ...(step.parsedCommands ?? [])]).filter(Boolean)),
  );
  const firstBlockedStep = blockedSteps[0];
  const nextAction = runbook.ready
    ? "Production bootstrap is complete; run bun run verify:production and bun run goal:audit for final evidence."
    : firstBlockedStep?.parsedNextAction || runbook.nextAction || firstBlockedStep?.command || fallbackStatus;
  const copyText = [
    "Kickoff Lock Agent production bootstrap runbook",
    `Ready: ${runbook.ready ? "yes" : "no"}`,
    `Mode: ${runbook.execute ? "execute" : "plan"}`,
    `Steps: ${runbook.passedSteps}/${runbook.totalSteps}`,
    `Failed: ${runbook.failedSteps}`,
    `Next action: ${nextAction}`,
    "Commands:",
    ...commands.map((command) => `- ${command}`),
    "Acceptance checklist:",
    ...acceptanceChecklist.map((item) =>
      [
        `- ${item.label} [${item.status}]`,
        `  command: ${item.command}`,
        `  progress: ${item.passedSteps}/${item.totalSteps}`,
        `  missing: ${item.missingEnv.join(", ") || "none"}`,
        `  next: ${item.nextAction}`,
      ].join("\n"),
    ),
    "Blocked steps:",
    ...(blockedSteps.length > 0
      ? blockedSteps.map((step) => {
          const missing = step.parsedMissingEnv?.length ? ` · missing: ${step.parsedMissingEnv.join(", ")}` : "";
          const detail = step.parsedBlockedStage?.detail || compactLogTail(step.stderrTail || step.stdoutTail);
          return `- ${step.label} [${step.status}] ${step.command}${missing}${detail ? ` · ${detail}` : ""}`;
        })
      : ["- none"]),
  ].join("\n");

  return {
    ready: runbook.ready,
    mode: runbook.execute ? "execute" : "plan",
    passedSteps: runbook.passedSteps,
    totalSteps: runbook.totalSteps,
    failedSteps: runbook.failedSteps,
    blockedSteps,
    firstBlockedStep,
    acceptanceChecklist,
    commands,
    copyText,
    nextAction,
  };
};

export const productionBootstrapStepDetail = (step: ProductionBootstrapRunbookStep) => {
  const blocked = step.parsedBlockedStage;
  if (blocked) {
    const missing = blocked.missingEnv?.length ? ` Missing: ${blocked.missingEnv.join(", ")}.` : "";
    return truncateText(`${blocked.detail || step.parsedNextAction || "Blocked stage needs attention."}${missing}`);
  }
  if (step.parsedNextAction) return truncateText(step.parsedNextAction);
  const stderr = compactLogTail(step.stderrTail);
  const stdout = compactLogTail(step.stdoutTail);
  if (stderr) return stderr;
  if (stdout) return stdout;
  return step.status === "passed" ? "Step completed." : "No log tail captured.";
};

export const productionBootstrapStepProgress = (step: ProductionBootstrapRunbookStep) => {
  if (typeof step.parsedStageReadyCount === "number" && typeof step.parsedTotalStages === "number") {
    return `${step.parsedStageReadyCount}/${step.parsedTotalStages} ${step.parsedProgressLabel || "stages"}`;
  }
  if (typeof step.parsedReady === "boolean") return step.parsedReady ? "ready" : "not ready";
  return step.exitCode === undefined || step.exitCode === null ? "not run" : `exit ${step.exitCode}`;
};
