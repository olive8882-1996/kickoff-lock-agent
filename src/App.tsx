import {
  Activity,
  Bot,
  CheckCircle2,
  Clock3,
  Cloud,
  Database,
  Download,
  FileCheck2,
  Flame,
  Gauge,
  HelpCircle,
  ImageDown,
  Link2,
  LockKeyhole,
  Medal,
  Radar,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TableProperties,
  Timer,
  Trophy,
  UploadCloud,
  UserCircle2,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  buildBracketPathFromMatches,
  createBracketModeRun,
  createEmptyBracketPath,
  isBracketPathReady,
} from "./bracket";
import {
  buildPublicProfile,
  buildLocalLeaderboard,
  consumeSupabaseHash,
  getCloudState,
  hydrateProfileFromAuth,
  loadLeaderboard,
  loadProfile,
  loadPublicProfile,
  loadPublicRecord,
  loadRecordsFromCloud,
  mergeMemoryRecords,
  saveProfile,
  sendMagicLink,
  signOutCloud,
  syncRecordsToCloud,
  syncProfileToCloud,
} from "./cloud";
import { filecoinSealConfigured, lookupFilecoinProof, runSealJob } from "./filecoinSeal";
import { createGameModeRun, getModeReadiness } from "./modes";
import { applyRealProof, createCapsule, stableJson } from "./proof";
import { buildDataCoverage, enrichMatchWithDataProviders, loadMatchesWithFallback, sourceLabel } from "./providers";
import { scorePrediction } from "./scoring";
import { downloadDataUrl, generateShareCard } from "./shareCard";
import type {
  AppView,
  BracketPath,
  CloudSyncState,
  FilecoinLookupState,
  GameMode,
  GameModeRun,
  LeaderboardEntry,
  LeaderboardScope,
  Match,
  MemoryRecord,
  PredictionDraft,
  PublicProfile,
} from "./types";

const STORAGE_KEY = "kickoff-lock-agent-records-v1";
const MODE_RUNS_KEY = "kickoff-lock-agent-mode-runs-v1";
const BRACKET_PATH_KEY = "kickoff-lock-agent-bracket-path-v1";

const gameModes: GameMode[] = [
  {
    id: "bracket",
    title: "Bracket path",
    status: "playable",
    description: "Pick quarterfinal, semifinal and final paths as a sealed tournament tree.",
    progress: 62,
    reward: "Pathfinder badge",
  },
  {
    id: "parlay",
    title: "Multi-match parlay",
    status: "playable",
    description: "Bundle three locks into one higher-risk proof capsule.",
    progress: 48,
    reward: "Accumulator XP",
  },
  {
    id: "agent-vs-human",
    title: "Agent vs Human",
    status: "playable",
    description: "Lock your instinct against the agent model and compare calibration after reveal.",
    progress: 74,
    reward: "Calibration score",
  },
  {
    id: "upset",
    title: "Upset challenge",
    status: "planned",
    description: "Hunt one underdog call per matchday with a public leaderboard multiplier.",
    progress: 35,
    reward: "Underdog multiplier",
  },
];

const assetUrl = (fileName: string) => `${import.meta.env.BASE_URL}assets/${fileName}`;

const imageLayer = (fileName: string, overlay: string) => ({
  backgroundImage: `${overlay}, url("${assetUrl(fileName)}")`,
});

const defaultDraft: PredictionDraft = {
  homeScore: 2,
  awayScore: 1,
  winner: "Home",
  keyPlayers: ["No. 10"],
  confidence: 68,
  style: "analysis",
  reasoning:
    "The home side should control territory early, but the away side has enough transition threat to keep the match close.",
  agentSummary:
    "Agent sees a narrow match: tempo control matters more than raw possession, and the first goal changes the risk profile.",
  markets: [
    {
      id: "winner",
      label: "1X2",
      pick: "Home",
      confidence: 68,
      rationale: "Baseline result market follows the projected scoreline.",
    },
    {
      id: "total-goals",
      label: "Total goals",
      pick: "Over 2.5",
      confidence: 56,
      rationale: "Knockout pressure still leaves room for late transitions.",
    },
    {
      id: "both-score",
      label: "Both teams score",
      pick: "Yes",
      confidence: 61,
      rationale: "The away side has enough counter threat to find one chance.",
    },
    {
      id: "first-goal",
      label: "First goal signal",
      pick: "No. 10",
      confidence: 52,
      rationale: "Creative central player is the most likely swing factor.",
    },
  ],
};

const loadRecords = (): MemoryRecord[] => {
  try {
    if (new URLSearchParams(window.location.search).get("reset") === "1") {
      localStorage.removeItem(STORAGE_KEY);
      window.history.replaceState({}, "", window.location.pathname);
      return [];
    }
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as MemoryRecord[];
  } catch {
    return [];
  }
};

const saveRecords = (records: MemoryRecord[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
};

const loadModeRuns = (): GameModeRun[] => {
  try {
    return JSON.parse(localStorage.getItem(MODE_RUNS_KEY) ?? "[]") as GameModeRun[];
  } catch {
    return [];
  }
};

const saveModeRuns = (runs: GameModeRun[]) => {
  localStorage.setItem(MODE_RUNS_KEY, JSON.stringify(runs));
};

const loadBracketPath = (): BracketPath => {
  try {
    return JSON.parse(localStorage.getItem(BRACKET_PATH_KEY) ?? "null") ?? createEmptyBracketPath();
  } catch {
    return createEmptyBracketPath();
  }
};

const saveBracketPath = (path: BracketPath) => {
  localStorage.setItem(BRACKET_PATH_KEY, JSON.stringify(path));
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const matchLabel = (match: Match) => `${match.homeTeam} vs ${match.awayTeam}`;

const proofUrl = (capsuleId: string) => {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("proof", capsuleId);
  return url.toString();
};

const profileUrl = (profileId: string) => {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("profile", profileId);
  return url.toString();
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
};

const deriveWinner = (home: number, away: number, match: Match) => {
  if (home === away) return "Draw";
  return home > away ? match.homeTeam : match.awayTeam;
};

const buildAgentDraft = (match: Match, prompt: string, previous: PredictionDraft): PredictionDraft => {
  const seed = `${match.homeTeam}${match.awayTeam}${prompt}`.split("").reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const homeScore = seed % 4;
  const awayScore = Math.floor(seed / 7) % 4;
  const confidence = 48 + (seed % 42);
  const winner = deriveWinner(homeScore, awayScore, match);
  const style: PredictionDraft["style"] =
    confidence > 76 ? "bold-call" : prompt.toLowerCase().includes("feel") ? "fan-instinct" : "analysis";
  const keyPlayers =
    prompt
      .split(/[,.;\n]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 2 && item.length < 32)
      .slice(0, 2) || previous.keyPlayers;
  const safeKeyPlayers = keyPlayers.length > 0 ? keyPlayers : [`${match.homeTeam} creator`];
  const totalPick = homeScore + awayScore >= 3 ? "Over 2.5" : "Under 2.5";
  const bothScorePick = homeScore > 0 && awayScore > 0 ? "Yes" : "No";
  const winnerPick = winner === match.homeTeam ? match.homeTeam : winner === match.awayTeam ? match.awayTeam : "Draw";
  return {
    homeScore,
    awayScore,
    winner,
    keyPlayers: safeKeyPlayers,
    confidence,
    style,
    reasoning:
      prompt.trim().length > 0
        ? `${prompt.trim()} Agent converts that into a ${homeScore}-${awayScore} lock because ${match.homeTeam} can shape the first phase while ${match.awayTeam} still carries counter-pressure.`
        : `Agent projects ${match.homeTeam} vs ${match.awayTeam} as a tactical pressure test. The locked call favors ${winner} with a ${homeScore}-${awayScore} scoreline and a confidence level of ${confidence}%.`,
    agentSummary: `Prediction agent sealed a ${winner} call at ${confidence}% confidence, with ${safeKeyPlayers.join(
      " and ",
    )} marked as the swing factor.`,
    markets: [
      {
        id: "winner",
        label: "1X2",
        pick: winnerPick,
        confidence,
        rationale: `Result market follows the ${homeScore}-${awayScore} model and current matchup pressure.`,
      },
      {
        id: "total-goals",
        label: "Total goals",
        pick: totalPick,
        confidence: Math.max(45, confidence - 12),
        rationale: `${match.insights?.marketLine ?? "Fallback market line"} supports a totals check before sealing.`,
      },
      {
        id: "both-score",
        label: "Both teams score",
        pick: bothScorePick,
        confidence: Math.max(42, confidence - 7),
        rationale: `${match.awayTeam} transition profile drives the both-score call.`,
      },
      {
        id: "first-goal",
        label: "First goal signal",
        pick: safeKeyPlayers[0],
        confidence: Math.max(38, confidence - 18),
        rationale: "First-goal market is tied to the named swing player/signal.",
      },
    ],
  };
};

const statusText = (match: Match, record?: MemoryRecord) => {
  if (record?.result) return "revealed";
  if (record?.capsule.locked) return "locked";
  return match.status;
};

const getLockState = (match: Match, locked: boolean, now: number) => {
  if (locked) return { state: "locked", label: "Locked", secondsLeft: 0 };
  const kickoffTime = new Date(match.kickoffAt).getTime();
  const secondsLeft = Math.max(0, Math.floor((kickoffTime - now) / 1000));
  if (!Number.isFinite(kickoffTime) || secondsLeft <= 0 || match.status !== "upcoming") {
    return { state: "closed", label: "Closed after kickoff", secondsLeft: 0 };
  }
  if (secondsLeft <= 15 * 60) return { state: "closing", label: "Final lock window", secondsLeft };
  return { state: "open", label: "Open before kickoff", secondsLeft };
};

const formatCountdown = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${hours}h ${minutes}m`;
};

function App() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [providerWarning, setProviderWarning] = useState("");
  const [providerSource, setProviderSource] = useState("loading");
  const [providerEvidence, setProviderEvidence] = useState<string[]>([]);
  const [forceFallback, setForceFallback] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [matchFilter, setMatchFilter] = useState<"all" | "live" | "today" | "upcoming">("all");
  const [view, setView] = useState<AppView>("matches");
  const [records, setRecords] = useState<MemoryRecord[]>(loadRecords);
  const [modeRuns, setModeRuns] = useState<GameModeRun[]>(loadModeRuns);
  const [bracketPath, setBracketPath] = useState<BracketPath>(loadBracketPath);
  const [profile, setProfile] = useState(loadProfile);
  const [cloudState, setCloudState] = useState<CloudSyncState>(getCloudState);
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardScope, setLeaderboardScope] = useState<LeaderboardScope>("global");
  const [accountEmail, setAccountEmail] = useState(loadProfile().email);
  const [draft, setDraft] = useState<PredictionDraft>(defaultDraft);
  const [now, setNow] = useState(Date.now());
  const [prompt, setPrompt] = useState("I expect a tense knockout match with one late goal.");
  const [actualHome, setActualHome] = useState(1);
  const [actualAway, setActualAway] = useState(0);
  const [actualKeyPlayers, setActualKeyPlayers] = useState("");
  const [proofJson, setProofJson] = useState("");
  const [shareImageUrl, setShareImageUrl] = useState("");
  const [publicShareImageUrl, setPublicShareImageUrl] = useState("");
  const [publicRecord, setPublicRecord] = useState<MemoryRecord | undefined>();
  const [publicProofStatus, setPublicProofStatus] = useState("");
  const [cidLookupInput, setCidLookupInput] = useState("");
  const [cidLookupState, setCidLookupState] = useState<FilecoinLookupState>({
    status: "idle",
    message: "Enter a CID to query the configured Filecoin seal API.",
  });
  const [publicProfile, setPublicProfile] = useState<PublicProfile | undefined>();
  const [publicProfileStatus, setPublicProfileStatus] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void bootstrapApp();
  }, []);

  useEffect(() => {
    saveRecords(records);
  }, [records]);

  useEffect(() => {
    saveModeRuns(modeRuns);
  }, [modeRuns]);

  useEffect(() => {
    saveBracketPath(bracketPath);
  }, [bracketPath]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshMatches = async (forced = forceFallback) => {
    setProviderSource("loading");
    const result = await loadMatchesWithFallback(forced);
    const sorted = result.matches
      .filter((match) => match.kickoffAt)
      .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
    setMatches(sorted);
    setProviderSource(sourceLabel(result.source));
    setProviderWarning(result.warning ?? "");
    setProviderEvidence(result.evidence ?? [`${sourceLabel(result.source)} feed loaded`, `${sorted.length} matches available`]);
    setSelectedMatchId((current) => current || sorted.find((match) => match.status === "upcoming")?.id || sorted[0]?.id || "");
    setBracketPath((current) => buildBracketPathFromMatches(sorted, current));
  };

  const refreshLeaderboard = async (scope = leaderboardScope, nextProfile = profile) => {
    try {
      const remoteLeaderboard = await loadLeaderboard(scope, nextProfile);
      setGlobalLeaderboard(remoteLeaderboard);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const fetchPublicProof = async (capsuleId: string) => {
    setPublicProofStatus("Loading public proof from cloud...");
    try {
      const record = await loadPublicRecord(capsuleId);
      setPublicRecord(record);
      setPublicProofStatus(record ? "Cloud proof loaded." : "No cloud proof found for this link.");
    } catch (error) {
      setPublicProofStatus((error as Error).message);
    }
  };

  const fetchPublicProfile = async (profileId: string) => {
    setPublicProfileStatus("Loading public profile from cloud...");
    try {
      const nextProfile = await loadPublicProfile(profileId);
      setPublicProfile(nextProfile);
      setPublicProfileStatus(nextProfile ? "Cloud profile loaded." : "No cloud profile found for this link.");
    } catch (error) {
      setPublicProfileStatus((error as Error).message);
    }
  };

  const reconcileCloudHistory = async (
    nextProfile: typeof profile,
    localRecords: MemoryRecord[],
    reason: string,
  ) => {
    const baseState = getCloudState();
    setCloudState({ ...baseState, status: "syncing", message: `${reason} Reconciling cloud history...` });
    const remoteRecords = await loadRecordsFromCloud(nextProfile);
    const merged = mergeMemoryRecords(localRecords, remoteRecords);
    setRecords(merged);
    const result = await syncRecordsToCloud(nextProfile, merged);
    await refreshLeaderboard(leaderboardScope, nextProfile);
    const message =
      remoteRecords.length > 0
        ? `${reason} merged ${remoteRecords.length} cloud records and synced ${merged.length} total records.`
        : `${reason} no cloud records found; local history is ready to sync.`;
    setCloudState({
      ...getCloudState(),
      status: result.status === "synced" ? "synced" : "offline",
      message,
      lastSyncedAt: new Date().toISOString(),
    });
    setNotice(message);
    return merged;
  };

  const bootstrapApp = async () => {
    await refreshMatches(false);
    void refreshLeaderboard("global", loadProfile());
    const params = new URLSearchParams(window.location.search);
    const proofId = params.get("proof");
    const profileId = params.get("profile");
    if (proofId) {
      setView("verify");
      void fetchPublicProof(proofId);
    } else if (profileId) {
      setView("profile");
      void fetchPublicProfile(profileId);
    }
    const session = consumeSupabaseHash();
    setCloudState(getCloudState());
    if (!session) return;
    try {
      const nextProfile = await hydrateProfileFromAuth(loadProfile());
      setProfile(nextProfile);
      setAccountEmail(nextProfile.email);
      await reconcileCloudHistory(nextProfile, records, "Signed in.");
    } catch (error) {
      setCloudState({ ...getCloudState(), status: "error", message: (error as Error).message });
    }
  };

  const selectedMatch = matches.find((match) => match.id === selectedMatchId) ?? matches[0];
  const selectedRecord = selectedMatch
    ? records.find((record) => record.capsule.matchId === selectedMatch.id)
    : undefined;
  const shownDraft = { ...defaultDraft, ...(selectedRecord?.capsule.prediction ?? draft) };
  const lockState = selectedMatch ? getLockState(selectedMatch, !!selectedRecord?.capsule.locked, now) : undefined;
  const filteredMatches = matches.filter((match) => {
    if (matchFilter === "all") return true;
    if (matchFilter === "live") return match.status === "live";
    if (matchFilter === "upcoming") return match.status === "upcoming";
    const kickoff = new Date(match.kickoffAt);
    const today = new Date(now);
    return kickoff.toDateString() === today.toDateString();
  });
  const revealedRecords = records.filter((record) => record.result);
  const averageScore =
    revealedRecords.length > 0
      ? Math.round(
          revealedRecords.reduce((sum, record) => sum + (record.result?.totalScore ?? 0), 0) /
            revealedRecords.length,
        )
      : 0;
  const bestRecord = [...revealedRecords].sort(
    (a, b) => (b.result?.totalScore ?? 0) - (a.result?.totalScore ?? 0),
  )[0];
  const localLeaderboard = buildLocalLeaderboard(profile, records);
  const remoteLeaderboardIds = new Set(globalLeaderboard.map((entry) => entry.id));
  const leaderboardEntries = [
    ...globalLeaderboard,
    ...localLeaderboard.filter((entry) => !remoteLeaderboardIds.has(entry.id)),
  ].sort((a, b) => b.xp - a.xp);

  const localRankIndex = leaderboardEntries.findIndex((entry) => entry.id === profile.id);
  const currentRank =
    localRankIndex >= 0 ? localRankIndex + 1 : Math.min(99, 1 + Math.floor(records.length * 1.8 + averageScore / 8));
  const currentXp = localLeaderboard[0]?.xp ?? 0;
  const currentStreak = localLeaderboard[0]?.streak ?? 0;
  const routeProfileId = new URLSearchParams(window.location.search).get("profile");
  const localPublicProfile = buildPublicProfile(profile, records);
  const shownPublicProfile =
    publicProfile ??
    (routeProfileId && routeProfileId !== profile.id
      ? {
          ...localPublicProfile,
          id: routeProfileId,
          email: undefined,
          displayName: "Profile unavailable",
          location: "Cloud profile",
          friendCode: "not-loaded",
          records: [],
          locks: 0,
          revealed: 0,
          averageScore: 0,
          bestScore: 0,
          xp: 0,
        }
      : localPublicProfile);
  const canLock = !!selectedMatch && !selectedRecord?.capsule.locked && lockState?.state !== "closed";

  const syncRecordsInBackground = (nextRecords: MemoryRecord[], reason: string) => {
    const state = getCloudState();
    if (!state.configured || !state.authenticated) return;
    setCloudState({ ...state, status: "syncing", message: `${reason} Syncing cloud history...` });
    void syncRecordsToCloud(profile, nextRecords)
      .then(async (result) => {
        await refreshLeaderboard(leaderboardScope, profile);
        setCloudState({
          ...getCloudState(),
          status: result.status === "synced" ? "synced" : "offline",
          message: result.message,
          lastSyncedAt: new Date().toISOString(),
        });
        setNotice(`${reason} ${result.message}`);
      })
      .catch((error) => {
        setCloudState({ ...getCloudState(), status: "error", message: (error as Error).message });
        setNotice((error as Error).message);
      });
  };

  const commitRecords = (nextRecords: MemoryRecord[], message: string) => {
    setRecords(nextRecords);
    setNotice(message);
    syncRecordsInBackground(nextRecords, message);
  };

  const generatePrediction = () => {
    if (!selectedMatch) return;
    setDraft(buildAgentDraft(selectedMatch, prompt, draft));
    setNotice("Agent draft generated. Review it, edit if needed, then lock before kickoff.");
  };

  const lockPrediction = async () => {
    if (!selectedMatch || !canLock) return;
    const currentLockState = getLockState(selectedMatch, !!selectedRecord?.capsule.locked, Date.now());
    if (currentLockState.state === "closed") {
      setNotice("Lock window is closed. Predictions can only be sealed before kickoff.");
      return;
    }
    const capsule = await createCapsule(selectedMatch, {
      ...shownDraft,
      winner: deriveWinner(shownDraft.homeScore, shownDraft.awayScore, selectedMatch),
    });
    const next = records.filter((record) => record.capsule.matchId !== selectedMatch.id);
    commitRecords([{ capsule }, ...next], "Prediction locked before kickoff. Public proof link is ready in the proof panel.");
  };

  const revealPrediction = () => {
    if (!selectedMatch || !selectedRecord) return;
    const result = scorePrediction(
      selectedRecord.capsule,
      selectedMatch,
      actualHome,
      actualAway,
      actualKeyPlayers
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );
    commitRecords(
      records.map((record) =>
        record.capsule.id === selectedRecord.capsule.id ? { ...record, result } : record,
      ),
      "Revealed and scored. Proof card and tournament memory are updated.",
    );
  };

  const importRealProof = () => {
    if (!selectedRecord) return;
    try {
      const updated = applyRealProof(selectedRecord.capsule, proofJson);
      commitRecords(
        records.map((record) =>
          record.capsule.id === updated.id ? { ...record, capsule: updated } : record,
        ),
        "Real proof imported and applied to this capsule.",
      );
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const copyShareText = async () => {
    if (!selectedRecord) return;
    const result = selectedRecord.result;
    const text = `Kickoff Lock Agent sealed my ${selectedRecord.capsule.matchLabel} prediction before kickoff.\nPrediction: ${selectedRecord.capsule.prediction.homeScore}-${selectedRecord.capsule.prediction.awayScore}${result ? `\nActual: ${result.homeScore}-${result.awayScore}\nScore: ${result.totalScore}/100` : ""}\nCID: ${selectedRecord.capsule.filecoinProof.cid}\n\n@Filecoin @FilecoinTLDR`;
    const copied = await copyToClipboard(text);
    setNotice(copied ? "Share text copied." : "Clipboard blocked. Share text is still visible in the proof payload.");
  };

  const syncToCloud = async () => {
    setCloudState({ ...getCloudState(), status: "syncing", message: "Syncing records to cloud..." });
    try {
      const result = await syncRecordsToCloud(profile, records);
      await refreshLeaderboard(leaderboardScope, profile);
      setCloudState({
        ...getCloudState(),
        status: result.status === "synced" ? "synced" : "offline",
        message: result.message,
        lastSyncedAt: new Date().toISOString(),
      });
      setNotice(result.message);
    } catch (error) {
      setCloudState({ ...getCloudState(), status: "error", message: (error as Error).message });
      setNotice((error as Error).message);
    }
  };

  const pullCloudHistory = async () => {
    setCloudState({ ...getCloudState(), status: "syncing", message: "Pulling cloud history..." });
    try {
      const remoteRecords = await loadRecordsFromCloud(profile);
      const merged = mergeMemoryRecords(records, remoteRecords);
      setRecords(merged);
      await syncRecordsToCloud(profile, merged);
      await refreshLeaderboard(leaderboardScope, profile);
      setCloudState({
        ...getCloudState(),
        status: "synced",
        message: `Pulled ${remoteRecords.length} cloud records and synced ${merged.length} merged records.`,
        lastSyncedAt: new Date().toISOString(),
      });
      setNotice(`Pulled ${remoteRecords.length} cloud records and synced ${merged.length} merged records.`);
    } catch (error) {
      setCloudState({ ...getCloudState(), status: "error", message: (error as Error).message });
      setNotice((error as Error).message);
    }
  };

  const requestMagicLink = async () => {
    try {
      await sendMagicLink(accountEmail);
      setNotice(`Magic link sent to ${accountEmail}. Open it to enable cloud sync.`);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const updateProfile = (patch: Partial<typeof profile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    saveProfile(next);
    setNotice("Profile updated.");
  };

  const saveCloudProfile = async () => {
    setCloudState({ ...getCloudState(), status: "syncing", message: "Saving cloud profile..." });
    try {
      await syncProfileToCloud(profile);
      setCloudState({ ...getCloudState(), status: "synced", message: "Cloud profile saved.", lastSyncedAt: new Date().toISOString() });
      setNotice("Cloud profile saved.");
      void refreshLeaderboard(leaderboardScope, profile);
    } catch (error) {
      setCloudState({ ...getCloudState(), status: "error", message: (error as Error).message });
      setNotice((error as Error).message);
    }
  };

  const signOut = async () => {
    await signOutCloud();
    setCloudState(getCloudState());
    setNotice("Signed out of Supabase on this device.");
  };

  const changeLeaderboardScope = (scope: LeaderboardScope) => {
    setLeaderboardScope(scope);
    void refreshLeaderboard(scope, profile);
  };

  const createModeRun = async (mode: GameMode) => {
    try {
      const run = await createGameModeRun(mode, records);
      setModeRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      setNotice(`${mode.title} proof run created.`);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const updateBracketPick = (pickId: string, patch: Partial<BracketPath["picks"][number]>) => {
    setBracketPath((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      picks: current.picks.map((pick) => (pick.id === pickId ? { ...pick, ...patch } : pick)),
    }));
  };

  const sealBracketPath = async () => {
    try {
      const run = await createBracketModeRun(bracketPath);
      setModeRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      setBracketPath(run.artifact?.bracketPath ?? bracketPath);
      setNotice("Bracket path sealed as a tournament mode proof.");
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const startFilecoinSeal = async () => {
    if (!selectedRecord) return;
    setNotice(filecoinSealConfigured ? "Starting Filecoin seal workflow..." : "Seal backend is not configured yet.");
    const updated = await runSealJob(selectedRecord);
    commitRecords(
      records.map((record) => (record.capsule.id === updated.capsule.id ? updated : record)),
      updated.sealJob?.status === "verified"
        ? "Real Filecoin proof attached and verification state saved."
        : "Seal workflow status saved. Configure the seal API for real uploads.",
    );
  };

  const generateShareImageForRecord = async (
    record: MemoryRecord,
    options: { download?: boolean; publicPreview?: boolean } = {},
  ) => {
    const dataUrl = await generateShareCard(record);
    if (options.publicPreview) setPublicShareImageUrl(dataUrl);
    else setShareImageUrl(dataUrl);
    if (options.download) downloadDataUrl(dataUrl, `${record.capsule.id}-share-card.png`);
    setNotice("Share image generated.");
  };

  const generateShareImage = async () => {
    if (!selectedRecord) return;
    await generateShareImageForRecord(selectedRecord, { download: true });
  };

  const shareRecordToTwitter = (record: MemoryRecord) => {
    const result = record.result;
    const text = `I locked ${record.capsule.matchLabel} before kickoff: ${record.capsule.prediction.homeScore}-${record.capsule.prediction.awayScore}${result ? ` · scored ${result.totalScore}/100` : ""}. Proof: ${record.capsule.filecoinProof.cid}`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(proofUrl(record.capsule.id))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareToTwitter = () => {
    if (!selectedRecord) return;
    shareRecordToTwitter(selectedRecord);
  };

  const queryFilecoinCid = async () => {
    setCidLookupState({ status: "checking", message: "Querying Filecoin seal API..." });
    const result = await lookupFilecoinProof(cidLookupInput);
    setCidLookupState(result);
    setNotice(result.message);
  };

  const copyProofLink = async () => {
    if (!selectedRecord) return;
    const copied = await copyToClipboard(proofUrl(selectedRecord.capsule.id));
    setNotice(copied ? "Public proof link copied." : "Clipboard blocked. Public proof link is visible in the proof panel.");
  };

  const openProofView = () => {
    if (!selectedRecord) return;
    window.history.replaceState({}, "", `?proof=${selectedRecord.capsule.id}`);
    setView("verify");
  };

  const openPublicProfile = () => {
    setPublicProfile(undefined);
    setPublicProfileStatus("Local public profile preview. Sync cloud history to make this link resolvable from another device.");
    window.history.replaceState({}, "", `?profile=${profile.id}`);
    setView("profile");
  };

  const copyProfileLink = async (profileId = profile.id) => {
    const copied = await copyToClipboard(profileUrl(profileId));
    setNotice(copied ? "Public profile link copied." : "Clipboard blocked. Public profile link is visible on the profile page.");
  };

  const updateMarket = (index: number, patch: Partial<PredictionDraft["markets"][number]>) => {
    const nextMarkets = shownDraft.markets.map((market, itemIndex) =>
      itemIndex === index ? { ...market, ...patch } : market,
    );
    setDraft({ ...shownDraft, markets: nextMarkets });
  };

  const enrichSelectedMatch = async () => {
    if (!selectedMatch) return;
    try {
      const enriched = await enrichMatchWithDataProviders(selectedMatch);
      setMatches(matches.map((match) => (match.id === enriched.id ? enriched : match)));
      setNotice("Match intelligence enriched from configured live data providers.");
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  return (
    <main className="shell">
      <aside className="side-rail" aria-label="Tournament controls">
        <div className="rail-mark">
          <img src={assetUrl("kickoff-lock-icon.png")} alt="" />
        </div>
        <button className={view === "matches" ? "active" : ""} onClick={() => setView("matches")} title="Match board">
          <TableProperties size={20} />
          <span>Match board</span>
        </button>
        <button className={view === "predict" ? "active" : ""} onClick={() => setView("predict")} title="Agent flow">
          <Bot size={20} />
          <span>Agent flow</span>
        </button>
        <button title="Proof capsule" onClick={() => setView("predict")}>
          <FileCheck2 size={20} />
          <span>Proof capsule</span>
        </button>
        <button className={view === "memory" ? "active" : ""} onClick={() => setView("memory")} title="Memory wall">
          <Database size={20} />
          <span>Memory wall</span>
        </button>
        <button className={view === "verify" ? "active" : ""} onClick={() => setView("verify")} title="Verify proof">
          <ShieldCheck size={20} />
          <span>Verify</span>
        </button>
        <button className={view === "modes" ? "active" : ""} onClick={() => setView("modes")} title="Game modes">
          <Flame size={20} />
          <span>Modes</span>
        </button>
        <button className={view === "profile" ? "active" : ""} onClick={openPublicProfile} title="Public profile">
          <Medal size={20} />
          <span>Profile</span>
        </button>
        <button className={view === "account" ? "active" : ""} onClick={() => setView("account")} title="Account">
          <UserCircle2 size={20} />
          <span>Account</span>
        </button>
        <div className="rail-spacer" />
        <button title="Settings">
          <SlidersHorizontal size={20} />
          <span>Settings</span>
        </button>
        <button title="Help">
          <HelpCircle size={20} />
          <span>Help</span>
        </button>
      </aside>
      <section
        className="hero"
        style={imageLayer(
          "stadium-hero.jpg",
          "linear-gradient(90deg, rgba(3, 10, 11, 0.94) 0%, rgba(3, 10, 11, 0.72) 52%, rgba(3, 10, 11, 0.16) 100%)",
        )}
      >
        <div className="hero-copy-block">
          <div className="brand-lockup" aria-label="Kickoff Lock Agent brand">
            <img src={assetUrl("kickoff-lock-icon.png")} alt="" />
            <span>World Cup proof agent</span>
          </div>
          <h1><span>Kickoff</span><span>Lock</span><span>Agent</span></h1>
          <p className="hero-copy">
            Lock before kickoff <i /> reveal after final whistle
          </p>
          <div className="hero-signals" aria-label="Core workflow">
            <span><ShieldCheck size={18} /> Lock before kickoff</span>
            <span><Clock3 size={18} /> Reveal after final whistle</span>
            <span><FileCheck2 size={18} /> Keep the proof card</span>
          </div>
        </div>
        <div className="hero-panel">
          <div>
            <span className="label">Locks</span>
            <span className="metric">{records.length}</span>
          </div>
          <div>
            <span className="label">Accuracy</span>
            <span className="metric">{averageScore}%</span>
          </div>
          <div>
            <span className="label">Rank</span>
            <span className="metric">#{currentRank}</span>
          </div>
          <div>
            <span className="label">XP</span>
            <span className="metric source-metric">{currentXp}</span>
          </div>
        </div>
        <div className="cloud-strip">
          <Cloud size={16} />
          <span>{profile.displayName}</span>
          <b>{cloudState.mode.toUpperCase()} · {cloudState.status}</b>
        </div>
      </section>

      <nav className="tabs" aria-label="Main views">
        <button className={view === "matches" ? "active" : ""} onClick={() => setView("matches")}>
          <Trophy size={18} /> Match board
        </button>
        <button className={view === "predict" ? "active" : ""} onClick={() => setView("predict")}>
          <Bot size={18} /> Agent flow
        </button>
        <button className={view === "memory" ? "active" : ""} onClick={() => setView("memory")}>
          <Database size={18} /> Memory
        </button>
        <button className={view === "verify" ? "active" : ""} onClick={() => setView("verify")}>
          <ShieldCheck size={18} /> Verify
        </button>
        <button className={view === "modes" ? "active" : ""} onClick={() => setView("modes")}>
          <Flame size={18} /> Modes
        </button>
        <button className={view === "profile" ? "active" : ""} onClick={openPublicProfile}>
          <Medal size={18} /> Profile
        </button>
        <button className={view === "account" ? "active" : ""} onClick={() => setView("account")}>
          <UserCircle2 size={18} /> Account
        </button>
      </nav>

      {notice && <div className="notice">{notice}</div>}
      {providerWarning && <div className="warning">{providerWarning}</div>}

      <section className="workspace">
        <aside className="panel match-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Data provider</p>
              <h2>Matches</h2>
            </div>
            <button
              className="icon-button"
              title="Refresh match data"
              onClick={() => void refreshMatches()}
            >
              <RefreshCcw size={18} />
            </button>
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={forceFallback}
              onChange={(event) => setForceFallback(event.target.checked)}
            />
            Force fallback test
          </label>
          <div className="provider-health">
            <div>
              <strong>{providerSource}</strong>
              <span>{matches.length} matches loaded</span>
            </div>
            {providerEvidence.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
          <div className="filter-row" aria-label="Match filters">
            {(["all", "live", "today", "upcoming"] as const).map((filter) => (
              <button
                key={filter}
                className={matchFilter === filter ? "active" : ""}
                onClick={() => setMatchFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
          <div className="match-list">
            {filteredMatches.length === 0 && <p className="empty-inline">No matches in this filter.</p>}
            {filteredMatches.map((match) => {
              const record = records.find((item) => item.capsule.matchId === match.id);
              const state = statusText(match, record);
              return (
                <button
                  key={match.id}
                  className={`match-card ${selectedMatchId === match.id ? "selected" : ""}`}
                  style={imageLayer(
                    "match-pitch.jpg",
                    "linear-gradient(90deg, rgba(3, 14, 14, 0.9) 0%, rgba(3, 14, 14, 0.72) 56%, rgba(3, 14, 14, 0.38) 100%)",
                  )}
                  onClick={() => {
                    setSelectedMatchId(match.id);
                    setView("predict");
                    if (match.homeScore !== undefined) setActualHome(match.homeScore);
                    if (match.awayScore !== undefined) setActualAway(match.awayScore);
                  }}
                >
                  <span className={`status ${state}`}>{state}</span>
                  <strong>{matchLabel(match)}</strong>
                  <span>{match.stage} · {formatDate(match.kickoffAt)}</span>
                  <span className="source">{sourceLabel(match.dataSource)}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section
          className="panel flow-panel"
          style={imageLayer(
            "agent-desk.jpg",
            "linear-gradient(180deg, rgba(3, 8, 10, 0.9) 0%, rgba(3, 8, 10, 0.82) 45%, rgba(3, 8, 10, 0.94) 100%)",
          )}
        >
          {selectedMatch ? (
            <>
              <div
                className="match-spotlight"
                style={imageLayer(
                  "match-pitch.jpg",
                  "linear-gradient(90deg, rgba(3, 14, 14, 0.88) 0%, rgba(3, 14, 14, 0.56) 58%, rgba(3, 14, 14, 0.2) 100%)",
                )}
              >
                <div>
                  <span>{selectedMatch.stage}</span>
                  <strong>{matchLabel(selectedMatch)}</strong>
                </div>
                <b>{formatDate(selectedMatch.kickoffAt)}</b>
              </div>
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Agent flow</p>
                  <h2>Lock window</h2>
                </div>
                <span className={`pill lock-${lockState?.state ?? "open"}`}>{lockState?.label}</span>
              </div>

              <LockWindow match={selectedMatch} lockState={lockState} />
              <MatchIntelligence match={selectedMatch} onEnrich={enrichSelectedMatch} />

              <div className="scoreboard-lock">
                <div className="team-tile home">{selectedMatch.homeTeam}</div>
                <div className="score-tile">
                  <strong>{shownDraft.homeScore} - {shownDraft.awayScore}</strong>
                  <span>{shownDraft.confidence}% confidence</span>
                </div>
                <div className="team-tile away">{selectedMatch.awayTeam}</div>
              </div>

              <div className="agent-tabs" aria-label="Prediction sections">
                <span className="active">Prediction</span>
                <span>Markets</span>
                <span>Notes</span>
              </div>

              <div className="agent-grid">
                <label>
                  <span>Intent for the agent</span>
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    disabled={!!selectedRecord?.capsule.locked}
                  />
                </label>
                <div className="score-inputs">
                  <label>
                    <span>{selectedMatch.homeTeam}</span>
                  <input
                    type="number"
                    min="0"
                      value={shownDraft.homeScore}
                      disabled={!!selectedRecord?.capsule.locked}
                      onChange={(event) =>
                        setDraft({ ...shownDraft, homeScore: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>{selectedMatch.awayTeam}</span>
                  <input
                    type="number"
                    min="0"
                      value={shownDraft.awayScore}
                      disabled={!!selectedRecord?.capsule.locked}
                      onChange={(event) =>
                        setDraft({ ...shownDraft, awayScore: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>Confidence</span>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={shownDraft.confidence}
                      disabled={!!selectedRecord?.capsule.locked}
                      onChange={(event) =>
                        setDraft({ ...shownDraft, confidence: Number(event.target.value) })
                      }
                    />
                    <b>{shownDraft.confidence}%</b>
                  </label>
                </div>
              </div>

              <label>
                <span>Reasoning</span>
                <textarea
                  value={shownDraft.reasoning}
                  disabled={!!selectedRecord?.capsule.locked}
                  onChange={(event) => setDraft({ ...shownDraft, reasoning: event.target.value })}
                />
              </label>
              <label>
                <span>Key players or signals</span>
                <input
                  value={shownDraft.keyPlayers.join(", ")}
                  disabled={!!selectedRecord?.capsule.locked}
                  onChange={(event) =>
                    setDraft({
                      ...shownDraft,
                      keyPlayers: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                    })
                  }
                />
              </label>

              <MarketBuilder
                markets={shownDraft.markets}
                locked={!!selectedRecord?.capsule.locked}
                onUpdate={updateMarket}
              />

              <div className="actions">
                <button onClick={generatePrediction} disabled={!!selectedRecord?.capsule.locked}>
                  <Sparkles size={18} /> Generate prediction
                </button>
                <button className="primary" onClick={() => void lockPrediction()} disabled={!canLock}>
                  <LockKeyhole size={18} /> Lock prediction
                </button>
              </div>

              {selectedRecord && (
                <RevealPanel
                  match={selectedMatch}
                  record={selectedRecord}
                  actualHome={actualHome}
                  actualAway={actualAway}
                  actualKeyPlayers={actualKeyPlayers}
                  onHome={setActualHome}
                  onAway={setActualAway}
                  onKeys={setActualKeyPlayers}
                  onReveal={revealPrediction}
                />
              )}
            </>
          ) : (
            <div className="empty">No match selected.</div>
          )}
        </section>

        <aside
          className="panel proof-panel"
          style={imageLayer(
            "proof-ticket.jpg",
            "linear-gradient(180deg, rgba(3, 14, 14, 0.94) 0%, rgba(3, 14, 14, 0.88) 100%)",
          )}
        >
          {selectedRecord ? (
            <ProofPanel
              record={selectedRecord}
              match={selectedMatch}
              proofJson={proofJson}
              onProofJson={setProofJson}
              onImport={importRealProof}
              onCopy={copyShareText}
              onCopyProofLink={copyProofLink}
              onOpenProofView={openProofView}
              onSeal={startFilecoinSeal}
              onShareImage={generateShareImage}
              onTwitter={shareToTwitter}
              shareImageUrl={shareImageUrl}
            />
          ) : (
            <div className="empty">
              <FileCheck2 size={32} />
              <h2>No capsule yet</h2>
              <p>Generate a prediction and lock it to create a Filecoin-style proof capsule.</p>
            </div>
          )}
        </aside>
      </section>

      {view === "memory" && (
        <MemoryDashboard
          records={records}
          averageScore={averageScore}
          bestRecord={bestRecord}
          currentRank={currentRank}
          currentXp={currentXp}
          currentStreak={currentStreak}
          leaderboardEntries={leaderboardEntries}
          leaderboardScope={leaderboardScope}
          cloudState={cloudState}
          onLeaderboardScope={changeLeaderboardScope}
        />
      )}

      {view === "verify" && (
        <VerifyDashboard
          records={records}
          publicRecord={publicRecord}
          publicProofStatus={publicProofStatus}
          shareImageUrl={publicShareImageUrl}
          onShareImage={(record) => void generateShareImageForRecord(record, { publicPreview: true })}
          onTwitter={shareRecordToTwitter}
          matches={matches}
          cidLookupInput={cidLookupInput}
          cidLookupState={cidLookupState}
          onCidLookupInput={setCidLookupInput}
          onCidLookup={queryFilecoinCid}
        />
      )}

      {view === "modes" && (
        <ModesDashboard
          modes={gameModes}
          records={records}
          bracketPath={bracketPath}
          modeRuns={modeRuns}
          onBracketPick={updateBracketPick}
          onSealBracket={sealBracketPath}
          onCreateModeRun={createModeRun}
        />
      )}

      {view === "profile" && (
        <PublicProfileDashboard
          profile={shownPublicProfile}
          status={publicProfileStatus}
          onCopyProfileLink={copyProfileLink}
          onOpenProof={(capsuleId) => {
            window.history.replaceState({}, "", `?proof=${capsuleId}`);
            setView("verify");
            void fetchPublicProof(capsuleId);
          }}
        />
      )}

      {view === "account" && (
        <AccountDashboard
          profile={profile}
          cloudState={cloudState}
          email={accountEmail}
          records={records}
          onEmail={setAccountEmail}
          onProfile={updateProfile}
          onMagicLink={requestMagicLink}
          onSync={syncToCloud}
          onPull={pullCloudHistory}
          onSaveProfile={saveCloudProfile}
          onSignOut={signOut}
          onOpenProfile={openPublicProfile}
          onCopyProfileLink={() => copyProfileLink()}
        />
      )}
    </main>
  );
}

type RevealPanelProps = {
  match: Match;
  record: MemoryRecord;
  actualHome: number;
  actualAway: number;
  actualKeyPlayers: string;
  onHome: (value: number) => void;
  onAway: (value: number) => void;
  onKeys: (value: string) => void;
  onReveal: () => void;
};

function LockWindow({
  match,
  lockState,
}: {
  match: Match;
  lockState?: ReturnType<typeof getLockState>;
}) {
  const seconds = lockState?.secondsLeft ?? 0;
  return (
    <div className={`lock-window lock-${lockState?.state ?? "open"}`}>
      <div>
        <Timer size={18} />
        <span>Kickoff countdown</span>
        <strong>{seconds > 0 ? formatCountdown(seconds) : "Closed"}</strong>
      </div>
      <div>
        <ShieldCheck size={18} />
        <span>Server-time rule</span>
        <strong>{lockState?.state === "closed" ? "No late seals" : "Pre-kickoff only"}</strong>
      </div>
      <div>
        <Radar size={18} />
        <span>Venue</span>
        <strong>{match.venue ?? "TBD"}</strong>
      </div>
    </div>
  );
}

function MatchIntelligence({ match, onEnrich }: { match: Match; onEnrich: () => void }) {
  const insights = match.insights;
  const dataCoverage = insights?.dataCoverage ?? buildDataCoverage(match);
  return (
    <div className="intel-panel">
      <div className="intel-head">
        <div>
          <p className="eyebrow">Match intelligence</p>
          <h3>{insights ? "Data brief" : "Provider coverage"}</h3>
        </div>
        <div className="intel-actions">
          <span>{insights?.dataFreshness ?? `${sourceLabel(match.dataSource)} basic provider pack`}</span>
          <button onClick={onEnrich}>
            <Radar size={15} /> Enrich
          </button>
        </div>
      </div>
      <div className="coverage-grid" aria-label="Data coverage">
        {dataCoverage.map((item) => (
          <article key={item.key} className={`coverage-${item.status}`}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.status}</span>
            </div>
            <b>{item.source}</b>
            <small>{item.detail}</small>
          </article>
        ))}
      </div>
      {insights ? (
        <>
          <div className="intel-grid">
            <div>
              <strong>{match.homeTeam}</strong>
              <span>Rank signal #{insights.home.fifaRank}</span>
              <b>{insights.home.form.join(" ")}</b>
              <small>GF/GA last five: {insights.home.lastFiveGoalsFor}/{insights.home.lastFiveGoalsAgainst}</small>
              <small>{insights.home.unavailable.join(", ")}</small>
            </div>
            <div>
              <strong>{match.awayTeam}</strong>
              <span>Rank signal #{insights.away.fifaRank}</span>
              <b>{insights.away.form.join(" ")}</b>
              <small>GF/GA last five: {insights.away.lastFiveGoalsFor}/{insights.away.lastFiveGoalsAgainst}</small>
              <small>{insights.away.unavailable.join(", ")}</small>
            </div>
          </div>
          <div className="intel-notes">
            <p><b>H2H</b>{insights.headToHead}</p>
            <p><b>Market</b>{insights.marketLine}</p>
            <p><b>Odds</b>{insights.oddsSnapshot ?? "Waiting for odds source"}</p>
            <p><b>Lineup</b>{insights.lineupSource ?? "Fallback lineup pack"}</p>
            <p><b>Injury</b>{insights.injurySource ?? "Fallback injury pack"}</p>
          </div>
        </>
      ) : (
        <p className="coverage-note">This provider gives enough metadata to lock a capsule, but lineup, injury and odds feeds need configured enrichment.</p>
      )}
    </div>
  );
}

function MarketBuilder({
  markets,
  locked,
  onUpdate,
}: {
  markets: PredictionDraft["markets"];
  locked: boolean;
  onUpdate: (index: number, patch: Partial<PredictionDraft["markets"][number]>) => void;
}) {
  return (
    <div className="market-builder">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Multi-market lock</p>
          <h3>Prediction markets</h3>
        </div>
        <span className="pill">4 picks</span>
      </div>
      <div className="market-grid">
        {markets.map((market, index) => (
          <article key={market.id}>
            <label>
              <span>{market.label}</span>
              <input
                value={market.pick}
                disabled={locked}
                onChange={(event) => onUpdate(index, { pick: event.target.value })}
              />
            </label>
            <label>
              <span>Confidence</span>
              <input
                type="range"
                min="1"
                max="100"
                value={market.confidence}
                disabled={locked}
                onChange={(event) => onUpdate(index, { confidence: Number(event.target.value) })}
              />
              <b>{market.confidence}%</b>
            </label>
            <label>
              <span>Rationale</span>
              <textarea
                value={market.rationale}
                disabled={locked}
                onChange={(event) => onUpdate(index, { rationale: event.target.value })}
              />
            </label>
          </article>
        ))}
      </div>
    </div>
  );
}

function RevealPanel({
  match,
  record,
  actualHome,
  actualAway,
  actualKeyPlayers,
  onHome,
  onAway,
  onKeys,
  onReveal,
}: RevealPanelProps) {
  const result = record.result;
  return (
    <div className="reveal-box">
      <div className="panel-head">
        <div>
          <p className="eyebrow">After the whistle</p>
          <h3>Reveal & score</h3>
        </div>
        {result && <span className="score-badge">{result.totalScore}/100</span>}
      </div>
      <div className="score-inputs">
        <label>
          <span>{match.homeTeam} actual</span>
          <input type="number" min="0" value={actualHome} onChange={(e) => onHome(Number(e.target.value))} />
        </label>
        <label>
          <span>{match.awayTeam} actual</span>
          <input type="number" min="0" value={actualAway} onChange={(e) => onAway(Number(e.target.value))} />
        </label>
      </div>
      <label>
        <span>Result notes / key players</span>
        <input value={actualKeyPlayers} onChange={(e) => onKeys(e.target.value)} placeholder="Comma-separated notes" />
      </label>
      <button className="primary" onClick={onReveal}>
        <Gauge size={18} /> Reveal & score
      </button>
      {result && (
        <div className="breakdown">
          {Object.entries(result.breakdown).map(([key, value]) => (
            <span key={key}>{key}: {value}</span>
          ))}
          {result.explanation.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <div className="agent-review">
            <strong>Agent review</strong>
            {(result.agentReview ?? ["Legacy result: re-run reveal to generate agent review."]).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type ProofPanelProps = {
  record: MemoryRecord;
  match?: Match;
  proofJson: string;
  onProofJson: (value: string) => void;
  onImport: () => void;
  onCopy: () => void;
  onCopyProofLink: () => void;
  onOpenProofView: () => void;
  onSeal: () => void;
  onShareImage: () => void;
  onTwitter: () => void;
  shareImageUrl: string;
};

function ProofPanel({
  record,
  match,
  proofJson,
  onProofJson,
  onImport,
  onCopy,
  onCopyProofLink,
  onOpenProofView,
  onSeal,
  onShareImage,
  onTwitter,
  shareImageUrl,
}: ProofPanelProps) {
  const { capsule, result } = record;
  return (
    <>
      <div className="panel-head">
        <div>
          <p className="eyebrow">Filecoin capsule</p>
          <h2>Proof panel</h2>
        </div>
        <span className={`pill ${capsule.filecoinProof.mode}`}>{capsule.filecoinProof.mode} proof</span>
      </div>
      <div className="proof-lines">
        <p><b>CID</b><span>{capsule.filecoinProof.cid}</span></p>
        <p><b>PieceCID</b><span>{capsule.filecoinProof.pieceCid}</span></p>
        <p><b>Hash</b><span>{capsule.payloadHash}</span></p>
        <p><b>Sealed</b><span>{capsule.sealedAt ? formatDate(capsule.sealedAt) : "Draft"}</span></p>
        <p><b>Status</b><span>{capsule.filecoinProof.proofStatus}</span></p>
        <p><b>Public URL</b><span>{proofUrl(capsule.id)}</span></p>
      </div>
      <div className="proof-card" id="proof-card">
        <div className="proof-card-top">
          <span>Kickoff Lock</span>
          {capsule.lateLock ? <span className="late">Late practice</span> : <span>Sealed before kickoff</span>}
        </div>
        <h3>{capsule.matchLabel}</h3>
        <div className="versus">
          <div>
            <small>Prediction</small>
            <strong>{capsule.prediction.homeScore}-{capsule.prediction.awayScore}</strong>
          </div>
          <div>
            <small>Actual</small>
            <strong>{result ? `${result.homeScore}-${result.awayScore}` : "Pending"}</strong>
          </div>
          <div>
            <small>Score</small>
            <strong>{result ? `${result.totalScore}/100` : "--"}</strong>
          </div>
        </div>
        <div className="proof-markets">
          {(capsule.prediction.markets ?? []).map((market) => (
            <span key={market.id}>{market.label}: {market.pick}</span>
          ))}
        </div>
        <p>{capsule.prediction.agentSummary}</p>
        <code>{capsule.filecoinProof.cid}</code>
      </div>
      <div className="proof-actions">
        <button onClick={onCopy}>
          <Activity size={18} /> Copy share text
        </button>
        <button onClick={onCopyProofLink}>
          <Link2 size={18} /> Copy proof link
        </button>
        <button onClick={onOpenProofView}>
          <ShieldCheck size={18} /> Open verifier
        </button>
        <button onClick={onSeal}>
          <UploadCloud size={18} /> Auto seal to Filecoin
        </button>
        <button onClick={onShareImage}>
          <ImageDown size={18} /> Generate share image
        </button>
        <button onClick={onTwitter}>
          <Users size={18} /> Share to X
        </button>
      </div>
      {record.sealJob && (
        <div className="seal-steps">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Synapse workflow</p>
              <h3>Auto seal status</h3>
            </div>
            <span className={`pill seal-${record.sealJob.status}`}>{record.sealJob.status}</span>
          </div>
          {record.sealJob.steps.map((step) => (
            <article key={step.id}>
              <CheckCircle2 size={16} />
              <div>
                <strong>{step.label}</strong>
                <span>{step.detail}</span>
              </div>
              <b>{step.status}</b>
            </article>
          ))}
        </div>
      )}
      {shareImageUrl && (
        <div className="share-preview">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Generated share card</p>
              <h3>Social image</h3>
            </div>
            <a href={shareImageUrl} download={`${capsule.id}-share-card.png`}>
              <Download size={16} /> Download
            </a>
          </div>
          <img src={shareImageUrl} alt="Generated share card preview" />
        </div>
      )}
      <details>
        <summary>Import real proof JSON</summary>
        <textarea value={proofJson} onChange={(event) => onProofJson(event.target.value)} placeholder='{"cid":"...","pieceCid":"...","provider":"...","dataSetId":"...","proofStatus":"verified"}' />
        <button onClick={onImport}>Apply real proof</button>
      </details>
      <details>
        <summary>Sealed JSON</summary>
        <pre>{stableJson({ capsule, match })}</pre>
      </details>
    </>
  );
}

function MemoryDashboard({
  records,
  averageScore,
  bestRecord,
  currentRank,
  currentXp,
  currentStreak,
  leaderboardEntries,
  leaderboardScope,
  cloudState,
  onLeaderboardScope,
}: {
  records: MemoryRecord[];
  averageScore: number;
  bestRecord?: MemoryRecord;
  currentRank: number;
  currentXp: number;
  currentStreak: number;
  leaderboardEntries: LeaderboardEntry[];
  leaderboardScope: LeaderboardScope;
  cloudState: CloudSyncState;
  onLeaderboardScope: (scope: LeaderboardScope) => void;
}) {
  const revealed = records.filter((record) => record.result);
  const leaderboard = leaderboardEntries.slice(0, 8);
  return (
    <section className="memory panel">
      <div
        className="memory-hero"
        style={imageLayer(
          "memory-wall.jpg",
          "linear-gradient(90deg, rgba(3, 14, 14, 0.86) 0%, rgba(3, 14, 14, 0.62) 55%, rgba(3, 14, 14, 0.18) 100%)",
        )}
      >
        <div>
          <span>Tournament memory</span>
          <strong>Every locked call becomes part of the run.</strong>
        </div>
      </div>
      <div className="panel-head">
        <div>
          <p className="eyebrow">Tournament memory</p>
          <h2>Verifiable prediction archive</h2>
        </div>
        <span className="pill">{revealed.length} revealed</span>
      </div>
      <div className="memory-stats">
        <div><strong>{records.length}</strong><span>sealed</span></div>
        <div><strong>{averageScore}</strong><span>average</span></div>
        <div><strong>{bestRecord?.result?.totalScore ?? "--"}</strong><span>best</span></div>
        <div><strong>{currentStreak}</strong><span>winner streak</span></div>
        <div><strong>#{currentRank}</strong><span>agent rank</span></div>
        <div><strong>{currentXp}</strong><span>XP</span></div>
      </div>
      <div className="leaderboard">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Leaderboard</p>
            <h3>{leaderboardScope} proof cards</h3>
          </div>
          <span className={`pill cloud-${cloudState.status}`}>
            {cloudState.configured ? cloudState.status : "local preview"}
          </span>
        </div>
        <div className="scope-switch" aria-label="Leaderboard scope">
          {(["global", "friend", "season"] as const).map((scope) => (
            <button
              key={scope}
              className={leaderboardScope === scope ? "active" : ""}
              onClick={() => onLeaderboardScope(scope)}
            >
              {scope}
            </button>
          ))}
        </div>
        <div className="leaderboard-summary">
          <div>
            <span>Scope</span>
            <strong>{leaderboardScope}</strong>
          </div>
          <div>
            <span>Rows</span>
            <strong>{leaderboard.length}</strong>
          </div>
          <div>
            <span>Proof source</span>
            <strong>{cloudState.configured ? "Supabase" : "local"}</strong>
          </div>
        </div>
        {leaderboard.length === 0 && <p>No leaderboard rows yet. Sync a revealed proof to populate this scope.</p>}
        {leaderboard.map((entry, index) => (
          <article key={entry.id}>
            <b>#{entry.rank ?? index + 1}</b>
            <div>
              <strong>{entry.displayName}</strong>
              <span>{entry.location} · {entry.source}{entry.friendCode ? ` · ${entry.friendCode}` : ""}</span>
            </div>
            <div className="leaderboard-metrics">
              <span><strong>{entry.xp}</strong> XP</span>
              <span>{entry.locks} locks</span>
              <span>{entry.revealed} revealed</span>
              <span>{entry.averageScore} avg</span>
              <span>{entry.bestScore} best</span>
              <span>{entry.streak} streak</span>
              <span>{entry.exactHits} exact</span>
              <span>{entry.verifiedProofs} real proofs</span>
            </div>
          </article>
        ))}
      </div>
      <div className="memory-list">
        {records.length === 0 && <p>No memory yet. Lock a prediction to start the archive.</p>}
        {records.map((record) => (
          <article key={record.capsule.id}>
            <CheckCircle2 size={18} />
            <div>
              <strong>{record.capsule.matchLabel}</strong>
              <span>
                Prediction {record.capsule.prediction.homeScore}-{record.capsule.prediction.awayScore}
                {record.result ? ` · Score ${record.result.totalScore}/100` : " · waiting for reveal"}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function VerifyDashboard({
  records,
  publicRecord,
  publicProofStatus,
  shareImageUrl,
  onShareImage,
  onTwitter,
  matches,
  cidLookupInput,
  cidLookupState,
  onCidLookupInput,
  onCidLookup,
}: {
  records: MemoryRecord[];
  publicRecord?: MemoryRecord;
  publicProofStatus: string;
  shareImageUrl: string;
  onShareImage: (record: MemoryRecord) => void;
  onTwitter: (record: MemoryRecord) => void;
  matches: Match[];
  cidLookupInput: string;
  cidLookupState: FilecoinLookupState;
  onCidLookupInput: (value: string) => void;
  onCidLookup: () => void;
}) {
  const proofId = new URLSearchParams(window.location.search).get("proof");
  const localRecord = proofId
    ? records.find((item) => item.capsule.id === proofId)
    : records[0];
  const record = localRecord ?? publicRecord;
  const proofSource = localRecord ? "local device" : publicRecord ? "cloud public record" : "unresolved";
  const match = record ? matches.find((item) => item.id === record.capsule.matchId) : undefined;
  const proofLabel = record?.capsule.filecoinProof.mode === "real" ? "Real Filecoin proof" : "Demo proof";
  const sealLabel = record?.capsule.lateLock ? "Late practice lock" : "Sealed before kickoff";
  const proofHeroStatus =
    record?.capsule.filecoinProof.proofStatus === "retrievable"
      ? "ready"
      : record?.capsule.filecoinProof.proofStatus ?? "pending";
  const resultLabel = record?.result
    ? `Actual ${record.result.homeScore}-${record.result.awayScore} · Score ${record.result.totalScore}/100`
    : "Reveal pending";
  const checks = record
    ? [
        { label: "Capsule exists", passed: true },
        { label: "Payload hash present", passed: record.capsule.payloadHash.length >= 32 },
        { label: "CID present", passed: record.capsule.filecoinProof.cid.length > 12 },
        { label: "Sealed before kickoff", passed: !record.capsule.lateLock },
        { label: "Public source resolved", passed: proofSource !== "unresolved" },
        { label: "Match data resolved", passed: !!match || proofSource === "cloud public record" },
      ]
    : [];
  return (
    <section className="verify panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Public verifier</p>
          <h2>Proof verification</h2>
        </div>
        <span className="pill">{record ? proofSource : "missing"}</span>
      </div>
      {publicProofStatus && <div className="warning">{publicProofStatus}</div>}
      {record && (
        <div
          className="public-proof-hero"
          style={imageLayer(
            "proof-ticket.jpg",
            "linear-gradient(90deg, rgba(3, 8, 10, 0.96) 0%, rgba(3, 8, 10, 0.82) 52%, rgba(3, 8, 10, 0.46) 100%)",
          )}
        >
          <div className="public-proof-title">
            <div className="proof-brand-mark">
              <img src={assetUrl("kickoff-lock-icon.png")} alt="" />
              <span>Kickoff Lock Agent</span>
            </div>
            <h3>{record.capsule.matchLabel}</h3>
            <p>{sealLabel} · {proofLabel} · {resultLabel}</p>
          </div>
          <div className="public-scoreline" aria-label="Public proof scoreline">
            <div>
              <span>Prediction</span>
              <strong>{record.capsule.prediction.homeScore}-{record.capsule.prediction.awayScore}</strong>
            </div>
            <div>
              <span>Actual</span>
              <strong>{record.result ? `${record.result.homeScore}-${record.result.awayScore}` : "--"}</strong>
            </div>
            <div>
              <span>Proof</span>
              <strong>{proofHeroStatus}</strong>
            </div>
          </div>
          <div className="public-proof-rail">
            <div>
              <span>Source</span>
              <strong>{proofSource}</strong>
            </div>
            <div>
              <span>CID</span>
              <code>{record.capsule.filecoinProof.cid}</code>
            </div>
            <div>
              <span>Hash</span>
              <code>{record.capsule.payloadHash}</code>
            </div>
          </div>
          <div className="proof-hero-actions">
            <button onClick={() => onShareImage(record)}>
              <ImageDown size={16} /> Generate public share image
            </button>
            <button onClick={() => onTwitter(record)}>
              <Users size={16} /> Share proof to X
            </button>
          </div>
        </div>
      )}
      <div className="cid-lookup">
        <div>
          <p className="eyebrow">Filecoin CID lookup</p>
          <h3>Query proof status</h3>
          <span>{cidLookupState.message}</span>
        </div>
        <label>
          <span>CID</span>
          <input
            value={cidLookupInput}
            onChange={(event) => onCidLookupInput(event.target.value)}
            aria-label="Filecoin CID"
            placeholder="bafy..."
          />
        </label>
        <button onClick={onCidLookup} disabled={cidLookupState.status === "checking"}>
          <ShieldCheck size={16} /> Query CID
        </button>
        {cidLookupState.proof && (
          <div className="cid-result">
            <p><b>Status</b><span>{cidLookupState.proof.proofStatus}</span></p>
            <p><b>CID</b><span>{cidLookupState.proof.cid}</span></p>
            <p><b>PieceCID</b><span>{cidLookupState.proof.pieceCid}</span></p>
            <p><b>Provider</b><span>{cidLookupState.proof.provider}</span></p>
            <p><b>Dataset</b><span>{cidLookupState.proof.dataSetId}</span></p>
            {cidLookupState.proof.retrievalUrl && (
              <a href={cidLookupState.proof.retrievalUrl} target="_blank" rel="noreferrer">
                Open retrieval
              </a>
            )}
          </div>
        )}
      </div>
      {!record ? (
        <div className="empty">
          <ShieldCheck size={32} />
          <h2>No proof found</h2>
          <p>Open a proof link from a locked capsule, or lock a prediction first.</p>
        </div>
      ) : (
        <div className="verify-grid">
          <div className="verify-card proof-facts">
            <h3>Proof facts</h3>
            <p>{sealLabel}</p>
            <p>{proofLabel}</p>
            <p>{resultLabel}</p>
            <code>{record.capsule.payloadHash}</code>
            <code>{record.capsule.filecoinProof.cid}</code>
          </div>
          <div className="verify-checks">
            {checks.map((check) => (
              <article key={check.label}>
                <CheckCircle2 size={18} />
                <span>{check.label}</span>
                <strong>{check.passed ? "Pass" : "Fail"}</strong>
              </article>
            ))}
          </div>
          <div className="verify-card locked-payload">
            <h3>Locked payload</h3>
            <pre>{stableJson({ capsule: record.capsule, result: record.result, match })}</pre>
          </div>
          {shareImageUrl && (
            <div className="verify-card public-share-card">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Public proof card</p>
                  <h3>Share image</h3>
                </div>
                <a href={shareImageUrl} download={`${record.capsule.id}-public-proof.png`}>
                  <Download size={16} /> Download
                </a>
              </div>
              <img src={shareImageUrl} alt="Generated public proof share card" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ModesDashboard({
  modes,
  records,
  bracketPath,
  modeRuns,
  onBracketPick,
  onSealBracket,
  onCreateModeRun,
}: {
  modes: GameMode[];
  records: MemoryRecord[];
  bracketPath: BracketPath;
  modeRuns: GameModeRun[];
  onBracketPick: (pickId: string, patch: Partial<BracketPath["picks"][number]>) => void;
  onSealBracket: () => void;
  onCreateModeRun: (mode: GameMode) => void;
}) {
  const lockedCount = records.length;
  const bracketReady = isBracketPathReady(bracketPath);
  const bracketRuns = modeRuns.filter((run) => run.modeId === "bracket" && run.artifact?.kind === "bracket-path");
  return (
    <section className="modes panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Tournament modes</p>
          <h2>Beyond single-match locks</h2>
        </div>
        <span className="pill">{lockedCount} active locks</span>
      </div>
      <div className="bracket-builder">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Knockout path builder</p>
            <h3>Seal a bracket path</h3>
          </div>
          <span className={`pill ${bracketReady ? "real" : "demo"}`}>{bracketReady ? "ready" : "needs 4 picks"}</span>
        </div>
        <div className="bracket-grid">
          {bracketPath.picks.length === 0 && <p>No upcoming knockout matches are available from the active provider yet.</p>}
          {bracketPath.picks.map((pick) => {
            const teams = pick.matchLabel.split(" vs ");
            const winnerOptions = [...teams, pick.winner].filter((value, index, list) => value && list.indexOf(value) === index);
            return (
              <article key={pick.id}>
                <div>
                  <strong>{pick.matchLabel}</strong>
                  <span>{pick.stage}</span>
                </div>
                <label>
                  <span>Advance</span>
                  <select
                    value={pick.winner}
                    onChange={(event) => onBracketPick(pick.id, { winner: event.target.value })}
                  >
                    {winnerOptions.map((team) => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Confidence</span>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={pick.confidence}
                    onChange={(event) => onBracketPick(pick.id, { confidence: Number(event.target.value) })}
                  />
                  <b>{pick.confidence}%</b>
                </label>
                <label>
                  <span>Path note</span>
                  <textarea value={pick.note} onChange={(event) => onBracketPick(pick.id, { note: event.target.value })} />
                </label>
              </article>
            );
          })}
        </div>
        <div className="bracket-footer">
          <div>
            <strong>{bracketPath.picks.length}/4 path picks</strong>
            <span>{bracketPath.payloadHash ? `Last sealed ${bracketPath.payloadHash.slice(0, 12)}...` : "Draft updates are saved locally until sealed."}</span>
          </div>
          <button className="mode-create" disabled={!bracketReady} onClick={onSealBracket}>
            <FileCheck2 size={16} /> Seal bracket proof
          </button>
        </div>
        {bracketRuns.length > 0 && (
          <div className="bracket-runs">
            {bracketRuns.slice(0, 3).map((run) => (
              <article key={run.id}>
                <strong>{run.summary}</strong>
                <code>{run.filecoinProof.cid}</code>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="mode-grid">
        {modes.map((mode) => {
          const readiness = getModeReadiness(mode.id, records);
          const runs = modeRuns.filter((run) => run.modeId === mode.id);
          const productized = readiness.ready ? Math.max(mode.progress, 88) : mode.progress;
          return (
            <article key={mode.id}>
              <div className="mode-top">
                <Flame size={20} />
                <span className={`pill mode-${readiness.ready ? "playable" : mode.status}`}>
                  {readiness.ready ? "ready" : mode.status}
                </span>
              </div>
              <h3>{mode.title}</h3>
              <p>{mode.description}</p>
              <div className="mode-requirements">
                {readiness.requirements.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <div className="progress-track">
                <span style={{ width: `${productized}%` }} />
              </div>
              <b>{readiness.eligibleRecords.length} eligible capsule{readiness.eligibleRecords.length === 1 ? "" : "s"}</b>
              <small>{readiness.nextAction}</small>
              <button className="mode-create" disabled={!readiness.ready} onClick={() => onCreateModeRun(mode)}>
                <FileCheck2 size={16} /> Create mode proof
              </button>
              {runs.length > 0 && (
                <div className="mode-runs">
                  {runs.slice(0, 2).map((run) => (
                    <div key={run.id}>
                      <strong>{run.status}{run.score !== undefined ? ` · ${run.score}/100` : ""}</strong>
                      <code>{run.filecoinProof.cid}</code>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <div className="mode-rules">
        <h3>Acceptance rule</h3>
        <p>Each mode now creates its own mode proof run with hash, CID, linked capsule ids and score when enough revealed records exist.</p>
      </div>
    </section>
  );
}

function PublicProfileDashboard({
  profile,
  status,
  onCopyProfileLink,
  onOpenProof,
}: {
  profile: PublicProfile;
  status: string;
  onCopyProfileLink: (profileId: string) => void;
  onOpenProof: (capsuleId: string) => void;
}) {
  const latestRecords = profile.records.slice(0, 12);
  return (
    <section className="public-profile panel">
      <div
        className="public-profile-hero"
        style={imageLayer(
          "stadium-hero.jpg",
          "linear-gradient(90deg, rgba(3, 14, 14, 0.9) 0%, rgba(3, 14, 14, 0.62) 58%, rgba(210, 55, 46, 0.24) 100%)",
        )}
      >
        <div className="public-profile-identity">
          {profile.avatarUrl ? <img className="avatar large" src={profile.avatarUrl} alt="" /> : <UserCircle2 size={54} />}
          <div>
            <p className="eyebrow">Public prediction profile</p>
            <h2>{profile.displayName}</h2>
            <span>{profile.location} · {profile.friendCode ?? "global"}</span>
          </div>
        </div>
        <div className="profile-actions">
          <button onClick={() => onCopyProfileLink(profile.id)}>
            <Link2 size={16} /> Copy profile link
          </button>
        </div>
      </div>
      {status && <div className="warning">{status}</div>}
      <div className="public-profile-stats">
        <div><strong>{profile.locks}</strong><span>locked predictions</span></div>
        <div><strong>{profile.revealed}</strong><span>revealed</span></div>
        <div><strong>{profile.averageScore}</strong><span>average score</span></div>
        <div><strong>{profile.bestScore}</strong><span>best score</span></div>
        <div><strong>{profile.xp}</strong><span>XP</span></div>
      </div>
      <div className="profile-proof-url">
        <b>Profile URL</b>
        <code>{profileUrl(profile.id)}</code>
      </div>
      <div className="profile-records">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Public archive</p>
            <h3>Latest proof capsules</h3>
          </div>
          <span className="pill">{latestRecords.length} shown</span>
        </div>
        {latestRecords.length === 0 && <p>No public records yet. Lock a prediction, then sync cloud history.</p>}
        {latestRecords.map((record) => (
          <article key={record.capsule.id}>
            <div>
              <strong>{record.capsule.matchLabel}</strong>
              <span>
                Prediction {record.capsule.prediction.homeScore}-{record.capsule.prediction.awayScore}
                {record.result ? ` · Score ${record.result.totalScore}/100` : " · reveal pending"}
              </span>
              <code>{record.capsule.filecoinProof.cid}</code>
            </div>
            <button onClick={() => onOpenProof(record.capsule.id)}>
              <ShieldCheck size={16} /> Verify
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function AccountDashboard({
  profile,
  cloudState,
  email,
  records,
  onEmail,
  onProfile,
  onMagicLink,
  onSync,
  onPull,
  onSaveProfile,
  onSignOut,
  onOpenProfile,
  onCopyProfileLink,
}: {
  profile: ReturnType<typeof loadProfile>;
  cloudState: CloudSyncState;
  email: string;
  records: MemoryRecord[];
  onEmail: (value: string) => void;
  onProfile: (patch: Partial<ReturnType<typeof loadProfile>>) => void;
  onMagicLink: () => void;
  onSync: () => void;
  onPull: () => void;
  onSaveProfile: () => void;
  onSignOut: () => void;
  onOpenProfile: () => void;
  onCopyProfileLink: () => void;
}) {
  return (
    <section className="account panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Account & cloud</p>
          <h2>Profile sync center</h2>
        </div>
        <span className={`pill cloud-${cloudState.status}`}>{cloudState.status}</span>
      </div>
      <div className="account-grid">
        <div className="profile-card">
          {profile.avatarUrl ? <img className="avatar" src={profile.avatarUrl} alt="" /> : <UserCircle2 size={42} />}
          <label>
            <span>Display name</span>
            <input value={profile.displayName} onChange={(event) => onProfile({ displayName: event.target.value })} />
          </label>
          <label>
            <span>Email</span>
            <input value={profile.email} onChange={(event) => onProfile({ email: event.target.value })} />
          </label>
          <label>
            <span>Location</span>
            <input value={profile.location} onChange={(event) => onProfile({ location: event.target.value })} />
          </label>
          <div className="profile-meta">
            <code>{profile.id}</code>
            <span>{profile.cloudMode} profile</span>
          </div>
        </div>
        <div className="cloud-card">
          <Cloud size={34} />
          <h3>{cloudState.mode === "supabase" ? "Supabase cloud sync" : "Local mode"}</h3>
          <p>{cloudState.message}</p>
          <div className="cloud-status-grid" aria-label="Cloud sync status">
            <div>
              <span>Auth</span>
              <strong>{cloudState.authenticated ? "signed in" : "local"}</strong>
            </div>
            <div>
              <span>Auto reconcile</span>
              <strong>{cloudState.authenticated ? "enabled" : "waiting"}</strong>
            </div>
            <div>
              <span>Records</span>
              <strong>{records.length}</strong>
            </div>
            <div>
              <span>Last synced</span>
              <strong>{cloudState.lastSyncedAt ? formatDate(cloudState.lastSyncedAt) : "not yet"}</strong>
            </div>
          </div>
          <label>
            <span>Magic link email</span>
            <input value={email} onChange={(event) => onEmail(event.target.value)} />
          </label>
          <div className="actions">
            <button onClick={onMagicLink}>
              <Link2 size={18} /> Send magic link
            </button>
            <button className="primary" onClick={onSync}>
              <UploadCloud size={18} /> Sync {records.length} records
            </button>
            <button onClick={onPull}>
              <Download size={18} /> Pull cloud history
            </button>
            <button onClick={onSaveProfile}>
              <UserCircle2 size={18} /> Save profile
            </button>
            <button onClick={onSignOut}>
              <ShieldCheck size={18} /> Sign out
            </button>
            <button onClick={onOpenProfile}>
              <Medal size={18} /> Open public profile
            </button>
            <button onClick={onCopyProfileLink}>
              <Link2 size={18} /> Copy profile link
            </button>
          </div>
          <div className="schema-note">
            <strong>Required backend tables</strong>
            <code>kickoff_profiles</code>
            <code>kickoff_records</code>
            <code>kickoff_leaderboard</code>
          </div>
        </div>
      </div>
    </section>
  );
}

export default App;
