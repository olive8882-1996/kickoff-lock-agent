import {
  Activity,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  Flame,
  Gauge,
  HelpCircle,
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
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { applyRealProof, createCapsule, stableJson } from "./proof";
import { loadMatchesWithFallback, sourceLabel } from "./providers";
import { scorePrediction } from "./scoring";
import type {
  AppView,
  Match,
  MemoryRecord,
  PredictionCapsule,
  PredictionDraft,
  ResultCapsule,
} from "./types";

const STORAGE_KEY = "kickoff-lock-agent-records-v1";

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
  const [forceFallback, setForceFallback] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [matchFilter, setMatchFilter] = useState<"all" | "live" | "today" | "upcoming">("all");
  const [view, setView] = useState<AppView>("matches");
  const [records, setRecords] = useState<MemoryRecord[]>(loadRecords);
  const [draft, setDraft] = useState<PredictionDraft>(defaultDraft);
  const [now, setNow] = useState(Date.now());
  const [prompt, setPrompt] = useState("I expect a tense knockout match with one late goal.");
  const [actualHome, setActualHome] = useState(1);
  const [actualAway, setActualAway] = useState(0);
  const [actualKeyPlayers, setActualKeyPlayers] = useState("");
  const [proofJson, setProofJson] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void refreshMatches(false);
    const proofId = new URLSearchParams(window.location.search).get("proof");
    if (proofId) setView("verify");
  }, []);

  useEffect(() => {
    saveRecords(records);
  }, [records]);

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
    setSelectedMatchId((current) => current || sorted.find((match) => match.status === "upcoming")?.id || sorted[0]?.id || "");
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

  const currentRank = Math.min(99, 1 + Math.floor(records.length * 1.8 + averageScore / 8));
  const currentXp = records.length * 120 + revealedRecords.reduce((sum, record) => sum + (record.result?.totalScore ?? 0), 0);
  const canLock = !!selectedMatch && !selectedRecord?.capsule.locked && lockState?.state !== "closed";

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
    setRecords([{ capsule }, ...next]);
    setNotice("Prediction locked before kickoff. Public proof link is ready in the proof panel.");
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
    setRecords(
      records.map((record) =>
        record.capsule.id === selectedRecord.capsule.id ? { ...record, result } : record,
      ),
    );
    setNotice("Revealed and scored. Proof card and tournament memory are updated.");
  };

  const importRealProof = () => {
    if (!selectedRecord) return;
    try {
      const updated = applyRealProof(selectedRecord.capsule, proofJson);
      setRecords(
        records.map((record) =>
          record.capsule.id === updated.id ? { ...record, capsule: updated } : record,
        ),
      );
      setNotice("Real proof imported and applied to this capsule.");
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

  const updateMarket = (index: number, patch: Partial<PredictionDraft["markets"][number]>) => {
    const nextMarkets = shownDraft.markets.map((market, itemIndex) =>
      itemIndex === index ? { ...market, ...patch } : market,
    );
    setDraft({ ...shownDraft, markets: nextMarkets });
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
              <MatchIntelligence match={selectedMatch} />

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
        <MemoryDashboard records={records} averageScore={averageScore} bestRecord={bestRecord} currentRank={currentRank} currentXp={currentXp} />
      )}

      {view === "verify" && (
        <VerifyDashboard records={records} matches={matches} />
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

function MatchIntelligence({ match }: { match: Match }) {
  const insights = match.insights;
  if (!insights) {
    return (
      <div className="intel-panel">
        <p>No intelligence pack yet. Provider data can still be locked as a basic capsule.</p>
      </div>
    );
  }
  return (
    <div className="intel-panel">
      <div className="intel-head">
        <div>
          <p className="eyebrow">Match intelligence</p>
          <h3>Data brief</h3>
        </div>
        <span>{insights.dataFreshness}</span>
      </div>
      <div className="intel-grid">
        <div>
          <strong>{match.homeTeam}</strong>
          <span>FIFA rank #{insights.home.fifaRank}</span>
          <b>{insights.home.form.join(" ")}</b>
          <small>GF/GA last five: {insights.home.lastFiveGoalsFor}/{insights.home.lastFiveGoalsAgainst}</small>
          <small>{insights.home.unavailable.join(", ")}</small>
        </div>
        <div>
          <strong>{match.awayTeam}</strong>
          <span>FIFA rank #{insights.away.fifaRank}</span>
          <b>{insights.away.form.join(" ")}</b>
          <small>GF/GA last five: {insights.away.lastFiveGoalsFor}/{insights.away.lastFiveGoalsAgainst}</small>
          <small>{insights.away.unavailable.join(", ")}</small>
        </div>
      </div>
      <div className="intel-notes">
        <p><b>H2H</b>{insights.headToHead}</p>
        <p><b>Market</b>{insights.marketLine}</p>
      </div>
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
      </div>
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
}: {
  records: MemoryRecord[];
  averageScore: number;
  bestRecord?: MemoryRecord;
  currentRank: number;
  currentXp: number;
}) {
  const revealed = records.filter((record) => record.result);
  const streak = records.reduce((run, record) => {
    if (!record.result) return run;
    return record.result.breakdown.winner > 0 ? run + 1 : 0;
  }, 0);
  const leaderboard = [...revealed]
    .sort((a, b) => (b.result?.totalScore ?? 0) - (a.result?.totalScore ?? 0))
    .slice(0, 5);
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
        <div><strong>{streak}</strong><span>winner streak</span></div>
        <div><strong>#{currentRank}</strong><span>agent rank</span></div>
        <div><strong>{currentXp}</strong><span>XP</span></div>
      </div>
      <div className="leaderboard">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Leaderboard</p>
            <h3>Best proof cards</h3>
          </div>
          <Medal size={22} />
        </div>
        {leaderboard.length === 0 && <p>No revealed scores yet.</p>}
        {leaderboard.map((record, index) => (
          <article key={record.capsule.id}>
            <b>#{index + 1}</b>
            <span>{record.capsule.matchLabel}</span>
            <strong>{record.result?.totalScore}/100</strong>
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

function VerifyDashboard({ records, matches }: { records: MemoryRecord[]; matches: Match[] }) {
  const proofId = new URLSearchParams(window.location.search).get("proof");
  const record = proofId
    ? records.find((item) => item.capsule.id === proofId)
    : records[0];
  const match = record ? matches.find((item) => item.id === record.capsule.matchId) : undefined;
  const checks = record
    ? [
        { label: "Capsule exists", passed: true },
        { label: "Payload hash present", passed: record.capsule.payloadHash.length >= 32 },
        { label: "CID present", passed: record.capsule.filecoinProof.cid.length > 12 },
        { label: "Sealed before kickoff", passed: !record.capsule.lateLock },
        { label: "Match data resolved", passed: !!match },
      ]
    : [];
  return (
    <section className="verify panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Public verifier</p>
          <h2>Proof verification</h2>
        </div>
        <span className="pill">{record ? "resolved" : "missing"}</span>
      </div>
      {!record ? (
        <div className="empty">
          <ShieldCheck size={32} />
          <h2>No proof found</h2>
          <p>Open a proof link from a locked capsule, or lock a prediction first.</p>
        </div>
      ) : (
        <div className="verify-grid">
          <div className="verify-card">
            <h3>{record.capsule.matchLabel}</h3>
            <p>Prediction {record.capsule.prediction.homeScore}-{record.capsule.prediction.awayScore}</p>
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
          <div className="verify-card">
            <h3>Locked payload</h3>
            <pre>{stableJson({ capsule: record.capsule, result: record.result, match })}</pre>
          </div>
        </div>
      )}
    </section>
  );
}

export default App;
