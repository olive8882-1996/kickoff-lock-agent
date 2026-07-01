import {
  Activity,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  Flame,
  Gauge,
  RefreshCcw,
  ShieldCheck,
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
  };
};

const statusText = (match: Match, record?: MemoryRecord) => {
  if (record?.result) return "revealed";
  if (record?.capsule.locked) return "locked";
  return match.status;
};

function App() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [providerWarning, setProviderWarning] = useState("");
  const [providerSource, setProviderSource] = useState("loading");
  const [forceFallback, setForceFallback] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [view, setView] = useState<AppView>("matches");
  const [records, setRecords] = useState<MemoryRecord[]>(loadRecords);
  const [draft, setDraft] = useState<PredictionDraft>(defaultDraft);
  const [prompt, setPrompt] = useState("I expect a tense knockout match with one late goal.");
  const [actualHome, setActualHome] = useState(1);
  const [actualAway, setActualAway] = useState(0);
  const [actualKeyPlayers, setActualKeyPlayers] = useState("");
  const [proofJson, setProofJson] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void refreshMatches(false);
  }, []);

  useEffect(() => {
    saveRecords(records);
  }, [records]);

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
  const shownDraft = selectedRecord?.capsule.prediction ?? draft;
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

  const canLock = selectedMatch && !selectedRecord?.capsule.locked;

  const generatePrediction = () => {
    if (!selectedMatch) return;
    setDraft(buildAgentDraft(selectedMatch, prompt, draft));
    setNotice("Agent draft generated. Review it, edit if needed, then lock before kickoff.");
  };

  const lockPrediction = async () => {
    if (!selectedMatch || !canLock) return;
    const capsule = await createCapsule(selectedMatch, {
      ...draft,
      winner: deriveWinner(draft.homeScore, draft.awayScore, selectedMatch),
    });
    const next = records.filter((record) => record.capsule.matchId !== selectedMatch.id);
    setRecords([{ capsule }, ...next]);
    setNotice(capsule.lateLock ? "Locked as a late practice capsule, not a before-kickoff proof." : "Prediction locked. The sealed payload is now read-only.");
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
    await navigator.clipboard.writeText(text);
    setNotice("Share text copied.");
  };

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">World Cup proof-of-prediction agent</p>
          <h1>Kickoff Lock Agent</h1>
          <p className="hero-copy">
            Seal your prediction before kickoff, reveal it after the final whistle, and keep a
            Filecoin-backed memory capsule for every bold call.
          </p>
        </div>
        <div className="hero-panel">
          <div>
            <span className="metric">{records.length}</span>
            <span className="label">sealed capsules</span>
          </div>
          <div>
            <span className="metric">{averageScore}</span>
            <span className="label">avg score</span>
          </div>
          <div>
            <span className="metric">{providerSource}</span>
            <span className="label">match source</span>
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
          <div className="match-list">
            {matches.map((match) => {
              const record = records.find((item) => item.capsule.matchId === match.id);
              const state = statusText(match, record);
              return (
                <button
                  key={match.id}
                  className={`match-card ${selectedMatchId === match.id ? "selected" : ""}`}
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

        <section className="panel flow-panel">
          {selectedMatch ? (
            <>
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Selected match</p>
                  <h2>{matchLabel(selectedMatch)}</h2>
                </div>
                <span className="pill">{formatDate(selectedMatch.kickoffAt)}</span>
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
                        setDraft({ ...draft, homeScore: Number(event.target.value) })
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
                        setDraft({ ...draft, awayScore: Number(event.target.value) })
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
                        setDraft({ ...draft, confidence: Number(event.target.value) })
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
                  onChange={(event) => setDraft({ ...draft, reasoning: event.target.value })}
                />
              </label>
              <label>
                <span>Key players or signals</span>
                <input
                  value={shownDraft.keyPlayers.join(", ")}
                  disabled={!!selectedRecord?.capsule.locked}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      keyPlayers: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                    })
                  }
                />
              </label>

              <div className="actions">
                <button onClick={generatePrediction} disabled={!!selectedRecord?.capsule.locked}>
                  <Bot size={18} /> Generate prediction
                </button>
                <button className="primary" onClick={() => void lockPrediction()} disabled={!canLock}>
                  <ShieldCheck size={18} /> Lock before kickoff
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

        <aside className="panel proof-panel">
          {selectedRecord ? (
            <ProofPanel
              record={selectedRecord}
              match={selectedMatch}
              proofJson={proofJson}
              onProofJson={setProofJson}
              onImport={importRealProof}
              onCopy={copyShareText}
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
        <MemoryDashboard records={records} averageScore={averageScore} bestRecord={bestRecord} />
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
};

function ProofPanel({ record, match, proofJson, onProofJson, onImport, onCopy }: ProofPanelProps) {
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
        <p>{capsule.prediction.agentSummary}</p>
        <code>{capsule.filecoinProof.cid}</code>
      </div>
      <button onClick={onCopy}>
        <Activity size={18} /> Copy share text
      </button>
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
}: {
  records: MemoryRecord[];
  averageScore: number;
  bestRecord?: MemoryRecord;
}) {
  const revealed = records.filter((record) => record.result);
  return (
    <section className="memory panel">
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

export default App;
