import { describe, expect, it } from "vitest";
import { SAMPLE_DATASET } from "../src/lib/dataset.js";
import {
  PRECOMPUTED_SCORES,
  demoResultsFor,
  demoScoreFor,
  isDefaultRubricContent,
  precomputedCoversDataset,
} from "../src/lib/demo.js";
import { agreementReport, pairsFromRun } from "../src/lib/metrics.js";
import { DEFAULT_RUBRIC } from "../src/lib/schemas.js";

describe("sample dataset and precomputed demo scores", () => {
  it("bundles 50 unique sample items, all marked as example data", () => {
    expect(SAMPLE_DATASET).toHaveLength(50);
    expect(new Set(SAMPLE_DATASET.map((item) => item.id)).size).toBe(50);
    expect(SAMPLE_DATASET.every((item) => item.sample === true)).toBe(true);
  });

  it("has a precomputed score for every bundled item", () => {
    expect(precomputedCoversDataset()).toBe(true);
  });

  it("is deterministic for the default rubric and disagrees with some human labels", () => {
    const first = demoResultsFor(SAMPLE_DATASET, DEFAULT_RUBRIC);
    const second = demoResultsFor(SAMPLE_DATASET, DEFAULT_RUBRIC);
    expect(first).toEqual(second);
    const report = agreementReport(
      pairsFromRun(
        SAMPLE_DATASET.map((item) => ({ id: item.id, humanScore: item.humanScore })),
        first,
      ),
      DEFAULT_RUBRIC.passThreshold,
    );
    expect(report.percentAgreement).toBeLessThan(1);
    expect(report.kappa).not.toBeNull();
    expect(report.kappa!).toBeGreaterThan(0.4);
    expect(report.disagreements.some((item) => item.kind === "verdict")).toBe(true);
  });

  it("keeps default scores when only the pass threshold changes, so verdicts can shift", () => {
    const raised = { ...DEFAULT_RUBRIC, passThreshold: 5 as const };
    expect(isDefaultRubricContent(raised)).toBe(true);
    expect(demoScoreFor(SAMPLE_DATASET[0]!, raised)).toBe(PRECOMPUTED_SCORES[SAMPLE_DATASET[0]!.id]);
    const defaultPass = demoResultsFor(SAMPLE_DATASET, DEFAULT_RUBRIC).filter((item) => item.verdict === "pass").length;
    const strictPass = demoResultsFor(SAMPLE_DATASET, raised).filter((item) => item.verdict === "pass").length;
    expect(strictPass).toBeLessThan(defaultPass);
  });

  it("can change scores when the rubric text changes", () => {
    const tweaked = {
      ...DEFAULT_RUBRIC,
      name: "Stricter accuracy",
      criteria: DEFAULT_RUBRIC.criteria.map((item) =>
        item.id === "accuracy"
          ? { ...item, description: "Penalise any missing fact, even a small one." }
          : item,
      ),
    };
    const original = demoResultsFor(SAMPLE_DATASET, DEFAULT_RUBRIC);
    const next = demoResultsFor(SAMPLE_DATASET, tweaked);
    const changed = original.filter((item, index) => item.score !== next[index]?.score).length;
    expect(changed).toBeGreaterThan(0);
  });
});
