import { describe, expect, it } from "vitest";
import {
  agreementReport,
  cohenKappa,
  confusionMatrix,
  formatKappa,
  formatPercent,
  meanAbsoluteError,
  pairsFromRun,
  percentAgreement,
  quadraticWeightedKappa,
} from "../src/lib/metrics.js";
import { verdictFor, type JudgeItemResult } from "../src/lib/schemas.js";

describe("percent agreement and kappa", () => {
  it("returns 1 for perfect agreement", () => {
    const pairs = [
      { a: "pass", b: "pass" },
      { a: "fail", b: "fail" },
      { a: "pass", b: "pass" },
    ];
    expect(percentAgreement(pairs)).toBe(1);
    expect(cohenKappa(pairs, ["fail", "pass"])).toBe(1);
  });

  it("matches the textbook 2x2 example with kappa 0.4", () => {
    const pairs = [
      ...Array.from({ length: 20 }, () => ({ a: "yes", b: "yes" })),
      ...Array.from({ length: 5 }, () => ({ a: "yes", b: "no" })),
      ...Array.from({ length: 10 }, () => ({ a: "no", b: "yes" })),
      ...Array.from({ length: 15 }, () => ({ a: "no", b: "no" })),
    ];
    expect(percentAgreement(pairs)).toBe(0.7);
    expect(cohenKappa(pairs, ["yes", "no"])).toBeCloseTo(0.4, 10);
  });

  it("returns 0.5 on a four-item mixed example", () => {
    const pairs = [
      { a: "yes", b: "yes" },
      { a: "yes", b: "yes" },
      { a: "yes", b: "no" },
      { a: "no", b: "no" },
    ];
    expect(cohenKappa(pairs, ["yes", "no"])).toBeCloseTo(0.5, 10);
  });

  it("returns 1 when every label is the same and both raters agree", () => {
    const pairs = [
      { a: "pass", b: "pass" },
      { a: "pass", b: "pass" },
    ];
    expect(cohenKappa(pairs, ["fail", "pass"])).toBe(1);
  });

  it("returns 0 when agreement is only by chance on a single class majority mismatch", () => {
    const pairs = [
      { a: "pass", b: "fail" },
      { a: "pass", b: "fail" },
    ];
    expect(cohenKappa(pairs, ["fail", "pass"])).toBe(0);
  });

  it("returns null for an empty list", () => {
    expect(cohenKappa([], ["fail", "pass"])).toBeNull();
    expect(percentAgreement([])).toBe(0);
  });
});

describe("confusion matrix and score metrics", () => {
  it("builds a 2x2 confusion matrix with human rows and judge columns", () => {
    const pairs = [
      { a: "fail", b: "fail" },
      { a: "fail", b: "pass" },
      { a: "pass", b: "pass" },
      { a: "pass", b: "pass" },
    ];
    expect(confusionMatrix(pairs, ["fail", "pass"]).counts).toEqual([
      [1, 1],
      [0, 2],
    ]);
  });

  it("computes mean absolute error", () => {
    expect(meanAbsoluteError([{ a: 5, b: 3 }, { a: 2, b: 2 }])).toBe(1);
    expect(meanAbsoluteError([])).toBe(0);
  });

  it("returns 1 for a perfect quadratic weighted kappa", () => {
    const pairs = [
      { a: 1, b: 1 },
      { a: 3, b: 3 },
      { a: 5, b: 5 },
    ];
    expect(quadraticWeightedKappa(pairs)).toBe(1);
  });
});

describe("agreementReport", () => {
  it("derives verdicts from the threshold and lists verdict clashes first", () => {
    const report = agreementReport(
      [
        { id: "a", human: 5, judge: 4 },
        { id: "b", human: 2, judge: 4 },
        { id: "c", human: 1, judge: 1 },
      ],
      3,
    );
    expect(report.n).toBe(3);
    expect(report.percentAgreement).toBeCloseTo(2 / 3);
    expect(report.accuracy).toBe(report.percentAgreement);
    expect(report.scoreAgreement).toBeCloseTo(1 / 3);
    expect(report.scoreMae).toBeCloseTo(1);
    expect(report.disagreements[0]?.id).toBe("b");
    expect(report.disagreements[0]?.kind).toBe("verdict");
    expect(report.disagreements[1]?.id).toBe("a");
    expect(report.disagreements[1]?.kind).toBe("score");
    expect(report.confusion.counts).toEqual([
      [1, 1],
      [0, 1],
    ]);
  });

  it("pairs human labels with judge results and formats output", () => {
    const results: JudgeItemResult[] = [
      { id: "s01", score: 5, verdict: verdictFor(5, 3), rationale: "ok" },
    ];
    expect(pairsFromRun([{ id: "s01", humanScore: 4 }, { id: "missing", humanScore: 1 }], results)).toEqual([
      { id: "s01", human: 4, judge: 5 },
    ]);
    expect(formatPercent(0.736)).toBe("73.6%");
    expect(formatKappa(0.4)).toBe("0.40");
    expect(formatKappa(null)).toBe("n/a");
  });
});
