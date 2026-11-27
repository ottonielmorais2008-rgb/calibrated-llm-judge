import { SAMPLE_DATASET } from "./dataset.js";
import {
  DEFAULT_RUBRIC,
  isScore,
  verdictFor,
  type JudgeItemInput,
  type JudgeItemResult,
  type Rubric,
  type Score,
} from "./schemas.js";

/** Precomputed demo scores for the default rubric. Not live model output. */
export const PRECOMPUTED_SCORES: Record<string, Score> = {
  s01: 5,
  s02: 1,
  s03: 5,
  s04: 1,
  s05: 5,
  s06: 4,
  s07: 1,
  s08: 4,
  s09: 5,
  s10: 2,
  s11: 4,
  s12: 1,
  s13: 5,
  s14: 5,
  s15: 4,
  s16: 5,
  s17: 5,
  s18: 3,
  s19: 5,
  s20: 2,
  s21: 5,
  s22: 4,
  s23: 5,
  s24: 5,
  s25: 5,
  s26: 3,
  s27: 3,
  s28: 3,
  s29: 4,
  s30: 5,
  s31: 4,
  s32: 4,
  s33: 4,
  s34: 3,
  s35: 5,
  s36: 2,
  s37: 4,
  s38: 5,
  s39: 1,
  s40: 5,
  s41: 4,
  s42: 1,
  s43: 3,
  s44: 1,
  s45: 5,
  s46: 4,
  s47: 1,
  s48: 5,
  s49: 4,
  s50: 5,
};

export function rubricFingerprint(rubric: Rubric): string {
  const criteria = rubric.criteria.map((item) => `${item.id}|${item.name}|${item.description}`).join("||");
  return `${rubric.name}::${criteria}`;
}

export function isDefaultRubricContent(rubric: Rubric): boolean {
  return rubricFingerprint(rubric) === rubricFingerprint(DEFAULT_RUBRIC);
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clampScore(value: number): Score {
  if (value <= 1) return 1;
  if (value >= 5) return 5;
  return value as Score;
}

export function demoScoreFor(item: JudgeItemInput, rubric: Rubric): Score {
  const known = PRECOMPUTED_SCORES[item.id];
  const base: Score =
    known ??
    clampScore(3 + ((hashString(`${item.id}:${item.question}:${item.response}`) % 5) - 2));
  if (isDefaultRubricContent(rubric)) return base;
  const nudge = (hashString(`${rubricFingerprint(rubric)}:${item.id}`) % 3) - 1;
  return clampScore(base + nudge);
}

export function demoRationale(_item: JudgeItemInput, score: Score, rubric: Rubric): string {
  const name = rubric.criteria[0]?.name ?? "the rubric";
  if (score >= 5) return `The response looks accurate and complete against ${name}.`;
  if (score === 4) return `The response is mostly sound, with only a small gap against ${name}.`;
  if (score === 3) return `The response is partly useful but misses a requirement in ${name}.`;
  if (score === 2) return `The response is weak or incomplete when scored against ${name}.`;
  return `The response is incorrect, unsafe, or contradicts ${name}.`;
}

export function demoResultsFor(items: JudgeItemInput[], rubric: Rubric): JudgeItemResult[] {
  return items.map((item) => {
    const score = demoScoreFor(item, rubric);
    return {
      id: item.id,
      score,
      verdict: verdictFor(score, rubric.passThreshold),
      rationale: demoRationale(item, score, rubric),
    };
  });
}

export function precomputedCoversDataset(): boolean {
  return SAMPLE_DATASET.every((item) => isScore(PRECOMPUTED_SCORES[item.id]));
}
