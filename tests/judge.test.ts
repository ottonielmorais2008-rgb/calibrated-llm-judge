import { describe, expect, it } from "vitest";
import { completeJsonJudge } from "../src/lib/judge.js";
import { DEFAULT_RUBRIC } from "../src/lib/schemas.js";
import { jsonJudge, queueClient, sampleItems } from "./helpers.js";

describe("completeJsonJudge", () => {
  it("parses a valid first reply and derives verdicts from the threshold", async () => {
    const items = sampleItems(2);
    const client = queueClient([jsonJudge({ t1: 5, t2: 2 })]);
    const results = await completeJsonJudge(client, DEFAULT_RUBRIC, items);
    expect(results).toEqual([
      { id: "t1", score: 5, verdict: "pass", rationale: "Scored t1 as 5." },
      { id: "t2", score: 2, verdict: "fail", rationale: "Scored t2 as 2." },
    ]);
  });

  it("retries once when the first reply is malformed", async () => {
    const items = sampleItems(2);
    const client = queueClient(["not json", jsonJudge({ t1: 4, t2: 4 })]);
    const results = await completeJsonJudge(client, DEFAULT_RUBRIC, items);
    expect(results.map((item) => item.score)).toEqual([4, 4]);
  });

  it("throws after a second invalid reply", async () => {
    const items = sampleItems(1);
    const client = queueClient(["{}", jsonJudge({ t9: 5 })]);
    await expect(completeJsonJudge(client, DEFAULT_RUBRIC, items)).rejects.toThrow(/missing item/i);
  });
});
