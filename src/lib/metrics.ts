import { verdictFor, type JudgeItemResult, type Score, type Verdict } from "./schemas.js";

export interface LabelPair {
  id: string;
  human: Score;
  judge: Score;
}

export interface ConfusionMatrix {
  labels: string[];
  counts: number[][];
}

export interface Disagreement {
  id: string;
  humanScore: Score;
  judgeScore: Score;
  humanVerdict: Verdict;
  judgeVerdict: Verdict;
  kind: "verdict" | "score";
}

export interface AgreementReport {
  n: number;
  accuracy: number;
  percentAgreement: number;
  kappa: number | null;
  scoreAgreement: number;
  scoreMae: number;
  quadraticWeightedKappa: number | null;
  confusion: ConfusionMatrix;
  scoreConfusion: ConfusionMatrix;
  disagreements: Disagreement[];
}

function safeDiv(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

export function percentAgreement(pairs: Array<{ a: string; b: string }>): number {
  if (pairs.length === 0) return 0;
  const matches = pairs.filter((pair) => pair.a === pair.b).length;
  return matches / pairs.length;
}

export function cohenKappa(pairs: Array<{ a: string; b: string }>, labels: string[]): number | null {
  const n = pairs.length;
  if (n === 0) return null;
  const index = new Map(labels.map((label, i) => [label, i]));
  const rows = labels.map(() => 0);
  const cols = labels.map(() => 0);
  let agree = 0;
  for (const pair of pairs) {
    const i = index.get(pair.a);
    const j = index.get(pair.b);
    if (i == null || j == null) continue;
    rows[i]! += 1;
    cols[j]! += 1;
    if (i === j) agree += 1;
  }
  const po = agree / n;
  let pe = 0;
  for (let k = 0; k < labels.length; k += 1) {
    pe += (rows[k]! / n) * (cols[k]! / n);
  }
  if (Math.abs(1 - pe) < 1e-12) return po === 1 ? 1 : 0;
  return (po - pe) / (1 - pe);
}

export function quadraticWeightedKappa(pairs: Array<{ a: number; b: number }>, min = 1, max = 5): number | null {
  const n = pairs.length;
  if (n === 0) return null;
  const size = max - min + 1;
  const matrix = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  for (const pair of pairs) {
    const i = pair.a - min;
    const j = pair.b - min;
    if (i < 0 || j < 0 || i >= size || j >= size) continue;
    matrix[i]![j]! += 1;
  }
  const weights = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (__, j) => 1 - (i - j) ** 2 / (size - 1) ** 2),
  );
  const rowHist = matrix.map((row) => row.reduce((sum, value) => sum + value, 0));
  const colHist = Array.from({ length: size }, (_, j) => matrix.reduce((sum, row) => sum + row[j]!, 0));
  let observed = 0;
  let expected = 0;
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j < size; j += 1) {
      const weight = weights[i]![j]!;
      observed += weight * matrix[i]![j]!;
      expected += weight * ((rowHist[i]! * colHist[j]!) / n);
    }
  }
  observed /= n;
  expected /= n;
  if (Math.abs(1 - expected) < 1e-12) return observed === 1 ? 1 : 0;
  return (observed - expected) / (1 - expected);
}

export function confusionMatrix(pairs: Array<{ a: string; b: string }>, labels: string[]): ConfusionMatrix {
  const index = new Map(labels.map((label, i) => [label, i]));
  const counts = labels.map(() => labels.map(() => 0));
  for (const pair of pairs) {
    const i = index.get(pair.a);
    const j = index.get(pair.b);
    if (i == null || j == null) continue;
    counts[i]![j]! += 1;
  }
  return { labels, counts };
}

export function meanAbsoluteError(pairs: Array<{ a: number; b: number }>): number {
  if (pairs.length === 0) return 0;
  const total = pairs.reduce((sum, pair) => sum + Math.abs(pair.a - pair.b), 0);
  return total / pairs.length;
}

export function agreementReport(pairs: LabelPair[], threshold: Score): AgreementReport {
  const verdictPairs = pairs.map((pair) => ({
    id: pair.id,
    a: verdictFor(pair.human, threshold),
    b: verdictFor(pair.judge, threshold),
    humanScore: pair.human,
    judgeScore: pair.judge,
  }));
  const scorePairs = pairs.map((pair) => ({ a: pair.human, b: pair.judge }));
  const accuracy = percentAgreement(verdictPairs);
  const disagreements: Disagreement[] = [];
  for (const pair of verdictPairs) {
    if (pair.a !== pair.b) {
      disagreements.push({
        id: pair.id,
        humanScore: pair.humanScore,
        judgeScore: pair.judgeScore,
        humanVerdict: pair.a,
        judgeVerdict: pair.b,
        kind: "verdict",
      });
    } else if (pair.humanScore !== pair.judgeScore) {
      disagreements.push({
        id: pair.id,
        humanScore: pair.humanScore,
        judgeScore: pair.judgeScore,
        humanVerdict: pair.a,
        judgeVerdict: pair.b,
        kind: "score",
      });
    }
  }
  disagreements.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "verdict" ? -1 : 1;
    return Math.abs(right.humanScore - right.judgeScore) - Math.abs(left.humanScore - left.judgeScore);
  });
  return {
    n: pairs.length,
    accuracy,
    percentAgreement: accuracy,
    kappa: cohenKappa(verdictPairs, ["fail", "pass"]),
    scoreAgreement: safeDiv(
      pairs.filter((pair) => pair.human === pair.judge).length,
      pairs.length,
    ),
    scoreMae: meanAbsoluteError(scorePairs),
    quadraticWeightedKappa: quadraticWeightedKappa(scorePairs),
    confusion: confusionMatrix(verdictPairs, ["fail", "pass"]),
    scoreConfusion: confusionMatrix(
      pairs.map((pair) => ({ a: String(pair.human), b: String(pair.judge) })),
      ["1", "2", "3", "4", "5"],
    ),
    disagreements,
  };
}

export function pairsFromRun(
  items: Array<{ id: string; humanScore: Score }>,
  results: JudgeItemResult[],
): LabelPair[] {
  const byId = new Map(results.map((result) => [result.id, result]));
  const pairs: LabelPair[] = [];
  for (const item of items) {
    const result = byId.get(item.id);
    if (!result) continue;
    pairs.push({ id: item.id, human: item.humanScore, judge: result.score });
  }
  return pairs;
}

export function formatKappa(value: number | null): string {
  if (value == null) return "n/a";
  return value.toFixed(2);
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
