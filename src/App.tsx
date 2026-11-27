import { useEffect, useMemo, useState } from "react";
import { SAMPLE_DATASET, SAMPLE_NOTICE } from "./lib/dataset";
import { demoResultsFor } from "./lib/demo";
import {
  agreementReport,
  formatKappa,
  formatPercent,
  pairsFromRun,
  type AgreementReport,
} from "./lib/metrics";
import type { JudgeRun } from "./lib/runs";
import {
  BATCH_SIZE,
  DEFAULT_RUBRIC,
  type Criterion,
  type JudgeItemResult,
  type Rubric,
  type Score,
  type Topic,
  type Verdict,
  isScore,
} from "./lib/schemas";
import { loadState, saveState, type CustomItem } from "./lib/storage";

const SOURCE_URL = "https://github.com/ottonielmorais2008-rgb/calibrated-llm-judge";
const TOPICS: Array<Topic | "all"> = ["all", "factual", "reasoning", "coding", "summarization", "safety"];
const SCORES: Score[] = [1, 2, 3, 4, 5];

interface Row {
  id: string;
  topic: Topic | "custom";
  question: string;
  response: string;
  humanScore: Score;
  humanNotes: string;
  sample: boolean;
}

function nowId(): string {
  return `run-${Date.now()}`;
}

function runLabel(indexFromNewest: number, total: number): string {
  if (total <= 1) return "Rubric v1";
  return indexFromNewest === 0 ? "Rubric v2" : "Rubric v1";
}

function toRows(labels: Record<string, { score: Score }>, extras: CustomItem[]): Row[] {
  const bundled: Row[] = SAMPLE_DATASET.map((item) => ({
    id: item.id,
    topic: item.topic,
    question: item.question,
    response: item.response,
    humanScore: labels[item.id]?.score ?? item.humanScore,
    humanNotes: item.humanNotes,
    sample: true,
  }));
  const custom: Row[] = extras.map((item) => ({
    id: item.id,
    topic: "custom",
    question: item.question,
    response: item.response,
    humanScore: labels[item.id]?.score ?? item.humanScore,
    humanNotes: item.humanNotes,
    sample: false,
  }));
  return [...bundled, ...custom];
}

async function requestBatch(rubric: Rubric, items: Row[], mode: "live" | "demo"): Promise<{
  mode: "live" | "demo";
  notice?: string;
  results: JudgeItemResult[];
}> {
  const response = await fetch("/api/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      rubric,
      items: items.map((item) => ({ id: item.id, question: item.question, response: item.response })),
    }),
  });
  const payload = (await response.json()) as { error?: string; mode?: "live" | "demo"; notice?: string; results?: JudgeItemResult[] };
  if (!response.ok) throw new Error(payload.error ?? "The judge request failed.");
  if (!payload.results) throw new Error("The judge response was empty.");
  return { mode: payload.mode ?? mode, notice: payload.notice, results: payload.results };
}

function splitBatches(rows: Row[]): Row[][] {
  const batches: Row[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE));
  return batches;
}

function Matrix({ report, title }: { report: AgreementReport; title: string }) {
  return (
    <div>
      <h3>{title}</h3>
      <table className="matrix">
        <thead>
          <tr>
            <th>Human \\ Judge</th>
            {report.confusion.labels.map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.confusion.labels.map((rowLabel, i) => (
            <tr key={rowLabel}>
              <th>{rowLabel}</th>
              {report.confusion.counts[i]!.map((value, j) => (
                <td key={j} className={i === j ? "agree" : value ? "disagree" : ""}>
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function App() {
  const initial = loadState();
  const [rubric, setRubric] = useState<Rubric>(initial.rubric);
  const [labels, setLabels] = useState(initial.labels);
  const [extras, setExtras] = useState<CustomItem[]>(initial.extras);
  const [runs, setRuns] = useState<JudgeRun[]>(() => {
    if (initial.runs.length) return initial.runs;
    const rows = toRows(initial.labels, initial.extras);
    const results = demoResultsFor(rows, initial.rubric.name ? initial.rubric : DEFAULT_RUBRIC);
    return [
      {
        id: "demo-default",
        label: "Rubric v1",
        at: new Date().toISOString(),
        mode: "demo",
        notice: "Precomputed demo scores for the sample dataset. The live model was not called.",
        rubric: initial.rubric,
        results,
      },
    ];
  });
  const [topic, setTopic] = useState<Topic | "all">("all");
  const [onlyDisagreements, setOnlyDisagreements] = useState(false);
  const [openId, setOpenId] = useState<string | null>(SAMPLE_DATASET[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [draftQuestion, setDraftQuestion] = useState("");
  const [draftResponse, setDraftResponse] = useState("");
  const [draftScore, setDraftScore] = useState<Score>(3);

  const rows = useMemo(() => toRows(labels, extras), [labels, extras]);

  useEffect(() => {
    saveState({ labels, extras, rubric, runs });
  }, [labels, extras, rubric, runs]);

  const current = runs[0];
  const previous = runs[1];
  const currentReport = useMemo(() => {
    if (!current) return null;
    return agreementReport(pairsFromRun(rows, current.results), current.rubric.passThreshold);
  }, [current, rows]);
  const previousReport = useMemo(() => {
    if (!previous) return null;
    return agreementReport(pairsFromRun(rows, previous.results), previous.rubric.passThreshold);
  }, [previous, rows]);
  const judgeCompare = useMemo(() => {
    if (!current || !previous) return null;
    const previousById = new Map(previous.results.map((item) => [item.id, item]));
    const pairs = current.results.flatMap((item) => {
      const older = previousById.get(item.id);
      if (!older) return [];
      return [{ id: item.id, human: older.score, judge: item.score }];
    });
    return agreementReport(pairs, current.rubric.passThreshold);
  }, [current, previous]);

  const resultById = useMemo(() => {
    const map = new Map<string, JudgeItemResult>();
    for (const result of current?.results ?? []) map.set(result.id, result);
    return map;
  }, [current]);

  const previousById = useMemo(() => {
    const map = new Map<string, JudgeItemResult>();
    for (const result of previous?.results ?? []) map.set(result.id, result);
    return map;
  }, [previous]);

  const visible = rows.filter((row) => {
    if (topic !== "all" && row.topic !== topic) return false;
    if (onlyDisagreements && currentReport) {
      return currentReport.disagreements.some((item) => item.id === row.id);
    }
    return true;
  });

  function setScore(id: string, score: Score) {
    setLabels((currentLabels) => ({ ...currentLabels, [id]: { score } }));
  }

  function updateCriterion(index: number, patch: Partial<Criterion>) {
    setRubric((currentRubric) => ({
      ...currentRubric,
      criteria: currentRubric.criteria.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  function addItem() {
    const question = draftQuestion.trim();
    const response = draftResponse.trim();
    if (!question || !response) {
      setError("Add both a question and a response before saving a label.");
      return;
    }
    const id = `c${Date.now().toString(36)}`;
    const item: CustomItem = { id, question, response, humanScore: draftScore, humanNotes: "Added in the browser." };
    setExtras((currentExtras) => [...currentExtras, item]);
    setLabels((currentLabels) => ({ ...currentLabels, [id]: { score: draftScore } }));
    setDraftQuestion("");
    setDraftResponse("");
    setDraftScore(3);
    setOpenId(id);
    setError(null);
  }

  async function runJudge(mode: "live" | "demo") {
    setBusy(true);
    setError(null);
    try {
      const batches = splitBatches(rows);
      const merged: JudgeItemResult[] = [];
      let notice: string | undefined;
      let used: "live" | "demo" = mode;
      if (mode === "demo") {
        setProgress("Loading demo scores…");
        merged.push(...demoResultsFor(rows, rubric));
        notice = "Demo mode used precomputed judge scores, not the live model.";
        used = "demo";
      } else {
        for (let i = 0; i < batches.length; i += 1) {
          setProgress(`Scoring batch ${i + 1} of ${batches.length}…`);
          const part = await requestBatch(rubric, batches[i]!, "live");
          merged.push(...part.results);
          used = part.mode;
          if (part.notice) notice = part.notice;
        }
      }
      const next: JudgeRun = {
        id: nowId(),
        label: runs.length ? "Rubric v2" : "Rubric v1",
        at: new Date().toISOString(),
        mode: used,
        notice,
        rubric: structuredClone(rubric),
        results: merged,
      };
      setRuns((currentRuns) => {
        const kept = currentRuns.slice(0, 1).map((run, index, list) => ({
          ...run,
          label: runLabel(index + 1, list.length + 1),
        }));
        return [{ ...next, label: runLabel(0, kept.length + 1) }, ...kept];
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The judge request failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const selected = rows.find((row) => row.id === openId) ?? visible[0];

  return (
    <div className="page">
      <header className="hero">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            κ
          </div>
          <div>
            <h1>Calibrated LLM Judge</h1>
            <p className="tagline">
              Label sample responses, run a Gemini judge against an editable rubric, and measure agreement before you
              trust the judge.
            </p>
          </div>
        </div>
        <div className="badges">
          <span className="badge">Sample / example data</span>
          <span className="badge">{rows.length} labelled responses</span>
          <a className="badge link" href={SOURCE_URL} target="_blank" rel="noreferrer">
            Source
          </a>
        </div>
      </header>

      <p className="notice">{SAMPLE_NOTICE}</p>

      <section className="grid">
        <article className="panel">
          <div className="panel-head">
            <h2>Rubric</h2>
            <label className="inline">
              Pass if score ≥
              <select
                value={rubric.passThreshold}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (isScore(value)) setRubric((currentRubric) => ({ ...currentRubric, passThreshold: value }));
                }}
              >
                {SCORES.map((score) => (
                  <option key={score} value={score}>
                    {score}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            Name
            <input
              value={rubric.name}
              onChange={(event) => setRubric((currentRubric) => ({ ...currentRubric, name: event.target.value }))}
            />
          </label>
          <ol className="criteria">
            {rubric.criteria.map((item, index) => (
              <li key={item.id}>
                <input
                  aria-label={`Criterion ${index + 1} name`}
                  value={item.name}
                  onChange={(event) => updateCriterion(index, { name: event.target.value })}
                />
                <textarea
                  aria-label={`${item.name} description`}
                  rows={2}
                  value={item.description}
                  onChange={(event) => updateCriterion(index, { description: event.target.value })}
                />
              </li>
            ))}
          </ol>
          <div className="actions">
            <button type="button" className="primary" disabled={busy} onClick={() => void runJudge("live")}>
              {busy ? "Running…" : "Run live judge"}
            </button>
            <button type="button" disabled={busy} onClick={() => void runJudge("demo")}>
              Use demo scores
            </button>
          </div>
          {progress ? <p className="muted small">{progress}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          {current?.notice ? <p className="muted small">{current.notice}</p> : null}
        </article>

        <article className="panel metrics">
          <div className="panel-head">
            <h2>Agreement</h2>
            {current ? (
              <span className="muted small">
                {current.label} · {current.mode}
              </span>
            ) : null}
          </div>
          {currentReport ? (
            <>
              <div className="stat-row">
                <div className="stat">
                  <span className="stat-label">Percent agreement</span>
                  <strong>{formatPercent(currentReport.percentAgreement)}</strong>
                  <span className="muted small">Pass / fail vs human labels</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Cohen&apos;s κ</span>
                  <strong>{formatKappa(currentReport.kappa)}</strong>
                  <span className="muted small">Chance-adjusted agreement</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Exact score match</span>
                  <strong>{formatPercent(currentReport.scoreAgreement)}</strong>
                  <span className="muted small">MAE {currentReport.scoreMae.toFixed(2)} · QWK {formatKappa(currentReport.quadraticWeightedKappa)}</span>
                </div>
              </div>
              <Matrix report={currentReport} title="Confusion matrix (human \\ judge)" />
              {previous && previousReport && judgeCompare ? (
                <div className="compare">
                  <h3>Rubric v1 vs v2</h3>
                  <p className="muted small">
                    Human agreement with {previous.label}: {formatPercent(previousReport.percentAgreement)} (κ{" "}
                    {formatKappa(previousReport.kappa)}). With {current.label}: {formatPercent(currentReport.percentAgreement)}{" "}
                    (κ {formatKappa(currentReport.kappa)}). The two judges agree on{" "}
                    {formatPercent(judgeCompare.percentAgreement)} of pass / fail labels (κ {formatKappa(judgeCompare.kappa)}).
                  </p>
                </div>
              ) : (
                <p className="muted small">
                  Edit the rubric and run the judge again to compare v1 with v2. Human labels stay in this browser
                  (localStorage).
                </p>
              )}
            </>
          ) : (
            <p className="muted">Run the judge to see agreement metrics.</p>
          )}
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Dataset and labels</h2>
          <div className="filters">
            {TOPICS.map((id) => (
              <button
                key={id}
                type="button"
                className={topic === id ? "tab on" : "tab"}
                onClick={() => setTopic(id)}
              >
                {id}
              </button>
            ))}
            <label className="inline">
              <input
                type="checkbox"
                checked={onlyDisagreements}
                onChange={(event) => setOnlyDisagreements(event.target.checked)}
              />
              Disagreements only
            </label>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>ID</th>
                <th>Topic</th>
                <th>Question</th>
                <th>Human</th>
                <th>Judge</th>
                <th>Δ</th>
                {previous ? <th>v1</th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const judged = resultById.get(row.id);
                const older = previousById.get(row.id);
                const humanVerdict: Verdict = row.humanScore >= (current?.rubric.passThreshold ?? rubric.passThreshold) ? "pass" : "fail";
                const delta = judged ? judged.score - row.humanScore : 0;
                const verdictClash = judged && judged.verdict !== humanVerdict;
                return (
                  <tr
                    key={row.id}
                    className={openId === row.id ? "open" : verdictClash ? "clash" : ""}
                    onClick={() => setOpenId(row.id)}
                  >
                    <td className="mono">{row.id}</td>
                    <td>{row.topic}</td>
                    <td>{row.question}</td>
                    <td>
                      <select
                        aria-label={`Human score for ${row.id}`}
                        value={row.humanScore}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (isScore(value)) setScore(row.id, value);
                        }}
                      >
                        {SCORES.map((score) => (
                          <option key={score} value={score}>
                            {score}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{judged ? `${judged.score} · ${judged.verdict}` : "—"}</td>
                    <td className={delta === 0 ? "muted" : delta > 0 ? "up" : "down"}>
                      {judged ? (delta > 0 ? `+${delta}` : `${delta}`) : "—"}
                    </td>
                    {previous ? <td>{older ? older.score : "—"}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selected ? (
          <div className="detail">
            <div>
              <h3>
                {selected.id} · {selected.topic}
                {selected.sample ? <span className="badge tight">sample</span> : <span className="badge tight">added</span>}
              </h3>
              <p>
                <strong>Question.</strong> {selected.question}
              </p>
              <pre>{selected.response}</pre>
              <p className="muted small">{selected.humanNotes}</p>
            </div>
            <div>
              <h3>Judge rationale</h3>
              <p>{resultById.get(selected.id)?.rationale ?? "No judge score for this item yet."}</p>
              {currentReport ? (
                <ul className="disagree-list">
                  {currentReport.disagreements.slice(0, 8).map((item) => (
                    <li key={item.id}>
                      <button type="button" className="linkish" onClick={() => setOpenId(item.id)}>
                        {item.id}
                      </button>
                      {item.kind === "verdict" ? " verdict " : " score "}
                      human {item.humanScore} ({item.humanVerdict}) vs judge {item.judgeScore} ({item.judgeVerdict})
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="add">
          <h3>Add a labelled response</h3>
          <p className="muted small">Stored only in this browser. Custom items are included in the next judge run.</p>
          <div className="add-grid">
            <label className="field">
              Question
              <textarea rows={3} value={draftQuestion} onChange={(event) => setDraftQuestion(event.target.value)} />
            </label>
            <label className="field">
              Response
              <textarea rows={3} value={draftResponse} onChange={(event) => setDraftResponse(event.target.value)} />
            </label>
          </div>
          <div className="actions">
            <label className="inline">
              Human score
              <select
                value={draftScore}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (isScore(value)) setDraftScore(value);
                }}
              >
                {SCORES.map((score) => (
                  <option key={score} value={score}>
                    {score}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={addItem}>
              Add label
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
