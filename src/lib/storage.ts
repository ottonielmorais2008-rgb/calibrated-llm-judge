import { DEFAULT_RUBRIC, isScore, type Rubric, type Score } from "./schemas.js";
import type { JudgeRun } from "./runs.js";

export const STORAGE_KEY = "calibrated-llm-judge:v1";

export interface StoredLabel {
  score: Score;
}

export interface CustomItem {
  id: string;
  question: string;
  response: string;
  humanScore: Score;
  humanNotes: string;
}

export interface StoredState {
  labels: Record<string, StoredLabel>;
  extras: CustomItem[];
  rubric: Rubric;
  runs: JudgeRun[];
}

function canUseStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function isCustomItem(value: unknown): value is CustomItem {
  if (!value || typeof value !== "object") return false;
  const item = value as CustomItem;
  return (
    typeof item.id === "string" &&
    typeof item.question === "string" &&
    typeof item.response === "string" &&
    isScore(item.humanScore) &&
    typeof item.humanNotes === "string"
  );
}

export function emptyState(): StoredState {
  return { labels: {}, extras: [], rubric: DEFAULT_RUBRIC, runs: [] };
}

export function loadState(): StoredState {
  const fallback = emptyState();
  if (!canUseStorage()) return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    const labels: Record<string, StoredLabel> = {};
    if (parsed.labels && typeof parsed.labels === "object") {
      for (const [id, label] of Object.entries(parsed.labels)) {
        if (label && isScore(label.score)) labels[id] = { score: label.score };
      }
    }
    const extras = Array.isArray(parsed.extras) ? parsed.extras.filter(isCustomItem) : [];
    return {
      labels,
      extras,
      rubric: parsed.rubric && typeof parsed.rubric === "object" ? { ...DEFAULT_RUBRIC, ...parsed.rubric } : DEFAULT_RUBRIC,
      runs: Array.isArray(parsed.runs) ? (parsed.runs as JudgeRun[]).slice(0, 2) : [],
    };
  } catch {
    return fallback;
  }
}

export function saveState(state: StoredState): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, runs: state.runs.slice(0, 2) }));
  } catch {
    // Ignore quota or privacy-mode failures.
  }
}
