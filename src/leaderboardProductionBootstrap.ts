import { parseEnvText } from "./productionEvidence";
import type { SupabaseDoctorReport } from "./supabaseProductionDoctor";
import { publicShareImageUrlProblem } from "./publicShareImageUrl";
import { deployedSupabaseProjectUrlProblem } from "./supabaseStorageUrl";

export type LeaderboardProductionBootstrapStatus = "done" | "ready" | "blocked";

export type LeaderboardProductionBootstrapStage = {
  id: "seed" | "doctor" | "verify";
  label: string;
  status: LeaderboardProductionBootstrapStatus;
  command: string;
  executeCommand: string;
  requiredEnv: string[];
  missingEnv: string[];
  outputEnv: string[];
  detail: string;
};

export type LeaderboardProductionBootstrapPlan = {
  ready: boolean;
  execute: boolean;
  stageReadyCount: number;
  totalStages: number;
  blockedStages: number;
  missingEnv: string[];
  stages: LeaderboardProductionBootstrapStage[];
  commands: string[];
  targetQueries: Record<"global" | "friend" | "season", string>;
  boardQueries: Record<"global" | "friend" | "season", string>;
  queryContracts: LeaderboardProductionQueryContract[];
  readBackCommands: LeaderboardProductionReadBackCommand[];
  nextAction: string;
  copyText: string;
};

export type LeaderboardProductionQueryContract = {
  scope: "global" | "friend" | "season";
  passed: boolean;
  targetQueryReady: boolean;
  boardQueryReady: boolean;
  targetQuery: string;
  boardQuery: string;
  detail: string;
};

export type LeaderboardProductionReadBackCommand = {
  id: string;
  scope: "global" | "friend" | "season";
  kind: "current-user" | "board";
  label: string;
  queryPath: string;
  authMode: "anon";
  expectedUserId?: string;
  expectedFriendCode?: string;
  expectedSeasonKey?: string;
  expectedOrder: string;
  minRows: number;
  command: string;
  url: string;
  ready: boolean;
  responseExpectation: {
    responseType: "supabase-array";
    table: "kickoff_leaderboard";
    scope: "global" | "friend" | "season";
    kind: "current-user" | "board";
    minRows: number;
    requiredFields: string[];
    expectedOrder: string;
    expectedUserId?: string;
    expectedFriendCode?: string;
    expectedSeasonKey?: string;
    requiredRankFields: string[];
  };
};

export type LeaderboardProductionBootstrapEnv = Record<string, string | undefined>;

export type LeaderboardProductionArtifact = LeaderboardProductionBootstrapPlan & {
  generatedAt: string;
  envFiles: string[];
  artifactVersion: 1;
  targets: {
    userId: string;
    friendCode: string;
    seasonKey: string;
    leaderboardScopes: string[];
  };
  doctor?: {
    ready: boolean;
    requiredPassed: number;
    requiredTotal: number;
    leaderboardCheckIds: string[];
    passedLeaderboardCheckIds: string[];
    failedLeaderboardCheckIds: string[];
  };
  acceptance: {
    globalCurrentUser: boolean;
    friendCurrentUser: boolean;
    seasonCurrentUser: boolean;
    globalBoardRows: boolean;
    friendBoardRows: boolean;
    seasonBoardRows: boolean;
    passedScopeCount: number;
    requiredScopeCount: 3;
    passedBoardCount: number;
    requiredBoardCount: 3;
    targetEnvReady: boolean;
    queryContractsReady: boolean;
    scopeClaims: LeaderboardProductionScopeClaim[];
    outputEnvKeys: string[];
  };
};

export type LeaderboardProductionScopeClaim = {
  scope: "global" | "friend" | "season";
  doctorCheckId: string;
  boardCheckId: string;
  currentUser: boolean;
  boardRows: boolean;
  doctorPassed: boolean;
  boardPassed: boolean;
  targetQueryReady: boolean;
  boardQueryReady: boolean;
  targetQuery: string;
  boardQuery: string;
  blockers: string[];
};

const runtimeKeys = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];
const writeKeys = ["VITE_PUBLIC_APP_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const targetKeys = [
  "KICKOFF_VERIFY_USER_ID",
  "KICKOFF_VERIFY_FRIEND_CODE",
  "KICKOFF_VERIFY_SEASON_KEY",
  "KICKOFF_VERIFY_LEADERBOARD_SCOPES",
];

const value = (env: LeaderboardProductionBootstrapEnv, key: string) => env[key]?.trim() ?? "";

const present = (env: LeaderboardProductionBootstrapEnv, key: string) => Boolean(value(env, key));

const missing = (env: LeaderboardProductionBootstrapEnv, keys: string[]) =>
  keys.filter((key) => !present(env, key));

const runtimeSupabaseProblems = (env: LeaderboardProductionBootstrapEnv) =>
  unique([
    ...missing(env, runtimeKeys),
    deployedSupabaseProjectUrlProblem(value(env, "VITE_SUPABASE_URL")),
  ]);

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const parsedEnv = (env: LeaderboardProductionBootstrapEnv) =>
  parseEnvText(
    Object.entries(env)
      .map(([key, item]) => `${key}=${item ?? ""}`)
      .join("\n"),
  );

const encoded = (text: string) => encodeURIComponent(text);
const shellSingleQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;
const supabaseRestUrl = (supabaseUrl: string, path: string) => `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`;
const supabaseAnonCurl = (supabaseUrl: string, path: string) =>
  [
    "curl -sS",
    shellSingleQuote(supabaseRestUrl(supabaseUrl, path)),
    "-H",
    shellSingleQuote("apikey: $VITE_SUPABASE_ANON_KEY"),
    "-H",
    shellSingleQuote("Authorization: Bearer $VITE_SUPABASE_ANON_KEY"),
  ].join(" ");

const leaderboardSelect =
  "select=id,display_name,location,friend_code,season_key,locks,revealed,average_score,best_score,xp,streak,exact_hits,verified_proofs,mode_proofs,global_rank,friend_rank,season_rank,rank,updated_at";
const leaderboardOrder = "order=xp.desc";
const leaderboardBoardSelect = leaderboardSelect;
const rankRequirements = "global_rank, friend_rank and season_rank must be positive scoped ranks";
const leaderboardScopes = ["global", "friend", "season"] as const;
const leaderboardTargetQueryRequiredFields = [
  "id",
  "display_name",
  "location",
  "friend_code",
  "season_key",
  "locks",
  "revealed",
  "average_score",
  "best_score",
  "xp",
  "streak",
  "exact_hits",
  "verified_proofs",
  "mode_proofs",
  "global_rank",
  "friend_rank",
  "season_rank",
  "rank",
  "updated_at",
];

const leaderboardRankFields = ["global_rank", "friend_rank", "season_rank", "rank"];

const shareImageProblem = (
  env: LeaderboardProductionBootstrapEnv,
  keys: string[],
  label: string,
) => {
  const imageUrl = keys.map((key) => value(env, key)).find(Boolean) ?? "";
  if (!imageUrl) return `${keys.join(" or ")} missing`;
  return publicShareImageUrlProblem(imageUrl, label);
};

const targetQueriesFor = (env: LeaderboardProductionBootstrapEnv) => {
  const userId = value(env, "KICKOFF_VERIFY_USER_ID");
  const friendCode = value(env, "KICKOFF_VERIFY_FRIEND_CODE");
  const seasonKey = value(env, "KICKOFF_VERIFY_SEASON_KEY");
  return {
    global: userId
      ? `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&id=eq.${encoded(userId)}&limit=1`
      : `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&limit=1`,
    friend:
      userId && friendCode
        ? `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&id=eq.${encoded(userId)}&friend_code=eq.${encoded(friendCode)}&limit=1`
        : `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&limit=1`,
    season:
      userId && seasonKey
        ? `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&id=eq.${encoded(userId)}&season_key=eq.${encoded(seasonKey)}&limit=1`
        : `kickoff_leaderboard?${leaderboardSelect}&${leaderboardOrder}&limit=1`,
  };
};

const boardQueriesFor = (env: LeaderboardProductionBootstrapEnv) => {
  const friendCode = value(env, "KICKOFF_VERIFY_FRIEND_CODE");
  const seasonKey = value(env, "KICKOFF_VERIFY_SEASON_KEY");
  return {
    global: `kickoff_leaderboard?${leaderboardBoardSelect}&order=global_rank.asc&limit=20`,
    friend: friendCode
      ? `kickoff_leaderboard?${leaderboardBoardSelect}&order=friend_rank.asc&friend_code=eq.${encoded(friendCode)}&limit=20`
      : `kickoff_leaderboard?${leaderboardBoardSelect}&order=friend_rank.asc&limit=20`,
    season: seasonKey
      ? `kickoff_leaderboard?${leaderboardBoardSelect}&order=season_rank.asc&season_key=eq.${encoded(seasonKey)}&limit=20`
      : `kickoff_leaderboard?${leaderboardBoardSelect}&order=season_rank.asc&limit=20`,
  };
};

const queryParams = (query: string) => new URLSearchParams(query.includes("?") ? query.slice(query.indexOf("?") + 1) : "");

const selectHasRequiredFields = (params: URLSearchParams) => {
  const fields = new Set((params.get("select") ?? "").split(",").map((field) => field.trim()).filter(Boolean));
  return leaderboardTargetQueryRequiredFields.every((field) => fields.has(field));
};

const targetQueryReadyFor = (
  scope: (typeof leaderboardScopes)[number],
  query: string,
  env: LeaderboardProductionBootstrapEnv,
) => {
  const params = queryParams(query);
  return Boolean(
    query.startsWith("kickoff_leaderboard?") &&
      params.get("id") === `eq.${value(env, "KICKOFF_VERIFY_USER_ID")}` &&
      params.get("order") === "xp.desc" &&
      params.get("limit") === "1" &&
      selectHasRequiredFields(params) &&
      (scope !== "friend" || params.get("friend_code") === `eq.${value(env, "KICKOFF_VERIFY_FRIEND_CODE")}`) &&
      (scope !== "season" || params.get("season_key") === `eq.${value(env, "KICKOFF_VERIFY_SEASON_KEY")}`),
  );
};

const boardQueryReadyFor = (
  scope: (typeof leaderboardScopes)[number],
  query: string,
  env: LeaderboardProductionBootstrapEnv,
) => {
  const params = queryParams(query);
  const expectedOrder = {
    global: "global_rank.asc",
    friend: "friend_rank.asc",
    season: "season_rank.asc",
  }[scope];
  const limit = Number(params.get("limit"));
  return Boolean(
    query.startsWith("kickoff_leaderboard?") &&
      params.get("order") === expectedOrder &&
      Number.isInteger(limit) &&
      limit >= 10 &&
      selectHasRequiredFields(params) &&
      (scope !== "friend" || params.get("friend_code") === `eq.${value(env, "KICKOFF_VERIFY_FRIEND_CODE")}`) &&
      (scope !== "season" || params.get("season_key") === `eq.${value(env, "KICKOFF_VERIFY_SEASON_KEY")}`),
  );
};

const queryContractsFor = (
  env: LeaderboardProductionBootstrapEnv,
  targetQueries: Record<(typeof leaderboardScopes)[number], string>,
  boardQueries: Record<(typeof leaderboardScopes)[number], string>,
): LeaderboardProductionQueryContract[] =>
  leaderboardScopes.map((scope) => {
    const targetQueryReady = targetQueryReadyFor(scope, targetQueries[scope], env);
    const boardQueryReady = boardQueryReadyFor(scope, boardQueries[scope], env);
    const missing = [
      targetQueryReady ? "" : "current-user target query",
      boardQueryReady ? "" : "ranked board query",
    ].filter(Boolean);
    return {
      scope,
      passed: targetQueryReady && boardQueryReady,
      targetQueryReady,
      boardQueryReady,
      targetQuery: targetQueries[scope],
      boardQuery: boardQueries[scope],
      detail: missing.length === 0 ? `${scope} target and board queries are complete` : `${scope} missing ${missing.join(", ")}`,
    };
  });

const readBackCommandsFor = (
  env: LeaderboardProductionBootstrapEnv,
  targetQueries: Record<(typeof leaderboardScopes)[number], string>,
  boardQueries: Record<(typeof leaderboardScopes)[number], string>,
  queryContracts: LeaderboardProductionQueryContract[],
): LeaderboardProductionReadBackCommand[] => {
  const supabaseUrl = value(env, "VITE_SUPABASE_URL");
  const runtimeReady = runtimeSupabaseProblems(env).length === 0 && present(env, "VITE_SUPABASE_ANON_KEY");
  const blockedCommand = "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before reading leaderboard REST rows.";
  const responseExpectationFor = (
    scope: (typeof leaderboardScopes)[number],
    kind: "current-user" | "board",
  ): LeaderboardProductionReadBackCommand["responseExpectation"] => ({
    responseType: "supabase-array",
    table: "kickoff_leaderboard",
    scope,
    kind,
    minRows: kind === "current-user" ? 1 : 10,
    requiredFields: leaderboardTargetQueryRequiredFields,
    expectedOrder: kind === "current-user" ? "xp.desc" : { global: "global_rank.asc", friend: "friend_rank.asc", season: "season_rank.asc" }[scope],
    expectedUserId: kind === "current-user" ? value(env, "KICKOFF_VERIFY_USER_ID") || undefined : undefined,
    expectedFriendCode: scope === "friend" ? value(env, "KICKOFF_VERIFY_FRIEND_CODE") || undefined : undefined,
    expectedSeasonKey: scope === "season" ? value(env, "KICKOFF_VERIFY_SEASON_KEY") || undefined : undefined,
    requiredRankFields: leaderboardRankFields,
  });
  return leaderboardScopes.flatMap((scope) => {
    const contract = queryContracts.find((item) => item.scope === scope);
    return [
      {
        scope,
        kind: "current-user" as const,
        id: `leaderboard:${scope}:current-user`,
        label: `${scope} current-user row`,
        queryPath: targetQueries[scope],
        authMode: "anon" as const,
        expectedUserId: value(env, "KICKOFF_VERIFY_USER_ID") || undefined,
        expectedFriendCode: scope === "friend" ? value(env, "KICKOFF_VERIFY_FRIEND_CODE") || undefined : undefined,
        expectedSeasonKey: scope === "season" ? value(env, "KICKOFF_VERIFY_SEASON_KEY") || undefined : undefined,
        expectedOrder: "xp.desc",
        minRows: 1,
        command: runtimeReady ? supabaseAnonCurl(supabaseUrl, targetQueries[scope]) : blockedCommand,
        url: runtimeReady ? supabaseRestUrl(supabaseUrl, targetQueries[scope]) : "",
        ready: Boolean(runtimeReady && contract?.targetQueryReady),
        responseExpectation: responseExpectationFor(scope, "current-user"),
      },
      {
        scope,
        kind: "board" as const,
        id: `leaderboard:${scope}:board`,
        label: `${scope} leaderboard board`,
        queryPath: boardQueries[scope],
        authMode: "anon" as const,
        expectedUserId: undefined,
        expectedFriendCode: scope === "friend" ? value(env, "KICKOFF_VERIFY_FRIEND_CODE") || undefined : undefined,
        expectedSeasonKey: scope === "season" ? value(env, "KICKOFF_VERIFY_SEASON_KEY") || undefined : undefined,
        expectedOrder: { global: "global_rank.asc", friend: "friend_rank.asc", season: "season_rank.asc" }[scope],
        minRows: 10,
        command: runtimeReady ? supabaseAnonCurl(supabaseUrl, boardQueries[scope]) : blockedCommand,
        url: runtimeReady ? supabaseRestUrl(supabaseUrl, boardQueries[scope]) : "",
        ready: Boolean(runtimeReady && contract?.boardQueryReady),
        responseExpectation: responseExpectationFor(scope, "board"),
      },
    ];
  });
};

export const buildLeaderboardProductionBootstrapPlan = (
  env: LeaderboardProductionBootstrapEnv,
  options: { execute?: boolean } = {},
): LeaderboardProductionBootstrapPlan => {
  const execute = Boolean(options.execute);
  const parsed = parsedEnv(env);
  const targetMissing = targetKeys.filter((key) => !parsed[key]);
  const seedMissing = unique([
    ...missing(env, writeKeys),
    shareImageProblem(env, ["KICKOFF_SEED_SHARE_IMAGE_URL", "KICKOFF_VERIFY_SHARE_IMAGE_URL"], "Record share image URL"),
    shareImageProblem(
      env,
      ["KICKOFF_SEED_MODE_SHARE_IMAGE_URL", "KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL"],
      "Mode share image URL",
    ),
  ]);
  const doctorMissing = [...runtimeSupabaseProblems(env), ...targetMissing];
  const targetQueries = targetQueriesFor(env);
  const boardQueries = boardQueriesFor(env);
  const queryContracts = queryContractsFor(env, targetQueries, boardQueries);
  const readBackCommands = readBackCommandsFor(env, targetQueries, boardQueries, queryContracts);

  const stages: LeaderboardProductionBootstrapStage[] = [
    {
      id: "seed",
      label: "Seed leaderboard target rows",
      status: targetMissing.length === 0 && seedMissing.length === 0 ? "done" : seedMissing.length === 0 ? "ready" : "blocked",
      command: "bun run seed:production-targets --dry-run",
      executeCommand: "bun run seed:production-targets --upload-share-image --upload-mode-share-image",
      requiredEnv: [
        ...writeKeys,
        "KICKOFF_SEED_SHARE_IMAGE_URL or KICKOFF_VERIFY_SHARE_IMAGE_URL",
        "KICKOFF_SEED_MODE_SHARE_IMAGE_URL or KICKOFF_VERIFY_MODE_SHARE_IMAGE_URL",
      ],
      missingEnv: seedMissing,
      outputEnv: targetKeys,
      detail:
        targetMissing.length === 0
          ? seedMissing.length === 0
            ? `${targetKeys.length}/${targetKeys.length} leaderboard target env keys collected and write prerequisites are configured.`
            : `${targetKeys.length}/${targetKeys.length} leaderboard target env keys collected; waiting for write prerequisites.`
          : "Upsert production profile, record and mode rows so kickoff_leaderboard has global, friend and season scopes.",
    },
    {
      id: "doctor",
      label: "Verify leaderboard backend scopes",
      status: doctorMissing.length === 0 ? "ready" : "blocked",
      command: "bun run doctor:supabase",
      executeCommand: "bun run doctor:supabase",
      requiredEnv: [...runtimeKeys, ...targetKeys],
      missingEnv: doctorMissing,
      outputEnv: [
        "global leaderboard current user",
        "friend leaderboard current user",
        "season leaderboard current user",
        "global leaderboard board rows",
        "friend leaderboard board rows",
        "season leaderboard board rows",
      ],
      detail: `Read kickoff_leaderboard through anon REST and require current-user plus board rows in global, friend and season filtered queries; ${rankRequirements}.`,
    },
    {
      id: "verify",
      label: "Verify production leaderboard evidence",
      status: doctorMissing.length === 0 ? "ready" : "blocked",
      command: "bun run verify:production",
      executeCommand: "bun run verify:production",
      requiredEnv: [...runtimeKeys, ...targetKeys],
      missingEnv: doctorMissing,
      outputEnv: [
        "leaderboard-global-current-user",
        "leaderboard-friend-current-user",
        "leaderboard-season-current-user",
        "leaderboard-global-board",
        "leaderboard-friend-board",
        "leaderboard-season-board",
      ],
      detail: `Run the strict production evidence checks that gate current-user and board-row leaderboard evidence; ${rankRequirements}.`,
    },
  ];

  const blockedStages = stages.filter((stage) => stage.status === "blocked").length;
  const stageReadyCount = stages.filter((stage) => stage.status === "ready" || stage.status === "done").length;
  const missingEnv = unique(stages.flatMap((stage) => stage.missingEnv));
  const commands = stages.filter((stage) => stage.status !== "done").map((stage) => (execute ? stage.executeCommand : stage.command));
  const next = stages.find((stage) => stage.status !== "done");
  const nextAction = next
    ? next.status === "ready"
      ? `${next.label}: run ${execute ? next.executeCommand : next.command}.`
      : `${next.label}: set ${next.missingEnv.join(", ")} first.`
    : "Leaderboard backend bootstrap targets are ready. Run bun run doctor:supabase.";
  const copyText = [
    "Kickoff Lock Agent leaderboard production bootstrap",
    `Mode: ${execute ? "execute" : "plan"}`,
    `Stages: ${stageReadyCount}/${stages.length} ready or done`,
    `Missing env: ${missingEnv.join(", ") || "none"}`,
    `Next action: ${nextAction}`,
    "Target queries:",
    `- global: ${targetQueries.global}`,
    `- friend: ${targetQueries.friend}`,
    `- season: ${targetQueries.season}`,
    "Board queries:",
    `- global: ${boardQueries.global}`,
    `- friend: ${boardQueries.friend}`,
    `- season: ${boardQueries.season}`,
    "Query contracts:",
    ...queryContracts.map((contract) =>
      `- ${contract.scope}: ${contract.passed ? "passed" : "blocked"} · target=${contract.targetQueryReady ? "ok" : "missing"} · board=${contract.boardQueryReady ? "ok" : "missing"}`,
    ),
    "Leaderboard read-back commands:",
    ...readBackCommands.map((item) => `- ${item.label}: ${item.command}`),
    `Rank requirement: ${rankRequirements}.`,
    "Commands:",
    ...commands.map((command) => `- ${command}`),
    "Stages:",
    ...stages.map((stage) =>
      [
        `- ${stage.label} [${stage.status}]`,
        `  command: ${stage.command}`,
        `  execute: ${stage.executeCommand}`,
        `  requires: ${stage.requiredEnv.join(", ")}`,
        `  missing: ${stage.missingEnv.join(", ") || "none"}`,
        `  outputs: ${stage.outputEnv.join(", ")}`,
        `  detail: ${stage.detail}`,
      ].join("\n"),
    ),
  ].join("\n");

  return {
    ready: blockedStages === 0,
    execute,
    stageReadyCount,
    totalStages: stages.length,
    blockedStages,
    missingEnv,
    stages,
    commands,
    targetQueries,
    boardQueries,
    queryContracts,
    readBackCommands,
    nextAction,
    copyText,
  };
};

const leaderboardCurrentUserCheckIds = ["leaderboard-global-user", "leaderboard-friend-user", "leaderboard-season-user"];
const leaderboardBoardCheckIds = ["leaderboard-global-board", "leaderboard-friend-board", "leaderboard-season-board"];
const leaderboardCheckIds = [...leaderboardCurrentUserCheckIds, ...leaderboardBoardCheckIds];
const leaderboardCheckIdFor = {
  global: "leaderboard-global-user",
  friend: "leaderboard-friend-user",
  season: "leaderboard-season-user",
} as const;
const leaderboardBoardCheckIdFor = {
  global: "leaderboard-global-board",
  friend: "leaderboard-friend-board",
  season: "leaderboard-season-board",
} as const;

export const buildLeaderboardProductionArtifact = (
  plan: LeaderboardProductionBootstrapPlan,
  options: {
    env: LeaderboardProductionBootstrapEnv;
    envFiles?: string[];
    doctor?: SupabaseDoctorReport;
    generatedAt?: string;
  },
): LeaderboardProductionArtifact => {
  const passedLeaderboardCheckIds =
    options.doctor?.checks
      .filter((check) => leaderboardCheckIds.includes(check.id) && check.status === "passed")
      .map((check) => check.id) ?? [];
  const failedLeaderboardCheckIds =
    options.doctor?.checks
      .filter((check) => leaderboardCheckIds.includes(check.id) && check.status !== "passed")
      .map((check) => check.id) ?? leaderboardCheckIds;
  const passed = (id: string) => passedLeaderboardCheckIds.includes(id);
  const targetEnvReady = targetKeys.every((key) => Boolean(value(options.env, key)));
  const passedScopeCount = leaderboardCurrentUserCheckIds.filter((id) => passed(id)).length;
  const passedBoardCount = leaderboardBoardCheckIds.filter((id) => passed(id)).length;
  const queryContracts = queryContractsFor(options.env, plan.targetQueries, plan.boardQueries);
  const queryContractsReady = queryContracts.every((contract) => contract.passed);
  const scopeClaims = leaderboardScopes.map((scope): LeaderboardProductionScopeClaim => {
    const contract = queryContracts.find((item) => item.scope === scope);
    const doctorCheckId = leaderboardCheckIdFor[scope];
    const boardCheckId = leaderboardBoardCheckIdFor[scope];
    const doctorPassed = passed(doctorCheckId);
    const boardPassed = passed(boardCheckId);
    const blockers = [
      doctorPassed ? "" : `${doctorCheckId} did not pass`,
      boardPassed ? "" : `${boardCheckId} did not pass`,
      contract?.targetQueryReady ? "" : "target query incomplete",
      contract?.boardQueryReady ? "" : "board query incomplete",
    ].filter(Boolean);
    return {
      scope,
      doctorCheckId,
      boardCheckId,
      currentUser: doctorPassed && Boolean(contract?.targetQueryReady),
      boardRows: boardPassed && Boolean(contract?.boardQueryReady),
      doctorPassed,
      boardPassed,
      targetQueryReady: Boolean(contract?.targetQueryReady),
      boardQueryReady: Boolean(contract?.boardQueryReady),
      targetQuery: plan.targetQueries[scope],
      boardQuery: plan.boardQueries[scope],
      blockers,
    };
  });

  return {
    ...plan,
    queryContracts,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    envFiles: options.envFiles ?? [],
    artifactVersion: 1,
    targets: {
      userId: value(options.env, "KICKOFF_VERIFY_USER_ID"),
      friendCode: value(options.env, "KICKOFF_VERIFY_FRIEND_CODE"),
      seasonKey: value(options.env, "KICKOFF_VERIFY_SEASON_KEY"),
      leaderboardScopes: leaderboardScopes.filter((scope) =>
        value(options.env, "KICKOFF_VERIFY_LEADERBOARD_SCOPES").split(/[,\s]+/).map((item) => item.trim().toLowerCase()).includes(scope),
      ),
    },
    doctor: options.doctor
      ? {
          ready: options.doctor.ready,
          requiredPassed: options.doctor.requiredPassed,
          requiredTotal: options.doctor.requiredTotal,
          leaderboardCheckIds,
          passedLeaderboardCheckIds,
          failedLeaderboardCheckIds,
        }
      : undefined,
    acceptance: {
      globalCurrentUser: passed("leaderboard-global-user"),
      friendCurrentUser: passed("leaderboard-friend-user"),
      seasonCurrentUser: passed("leaderboard-season-user"),
      globalBoardRows: passed("leaderboard-global-board"),
      friendBoardRows: passed("leaderboard-friend-board"),
      seasonBoardRows: passed("leaderboard-season-board"),
      passedScopeCount,
      requiredScopeCount: 3,
      passedBoardCount,
      requiredBoardCount: 3,
      targetEnvReady,
      queryContractsReady,
      scopeClaims,
      outputEnvKeys: targetKeys,
    },
    ready:
      plan.ready &&
      targetEnvReady &&
      queryContractsReady &&
      passedScopeCount === leaderboardCurrentUserCheckIds.length &&
      passedBoardCount === leaderboardBoardCheckIds.length,
  };
};
