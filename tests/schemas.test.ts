import { describe, expect, it } from "vitest";
import { parseJsonPayload } from "../src/lib/json.js";
import {
  DEFAULT_RUBRIC,
  parseJudgeRequest,
  parseModelOutput,
  verdictFor,
} from "../src/lib/schemas.js";

describe("parseJudgeRequest", () => {
  it("accepts a valid batch and default rubric", () => {
    const parsed = parseJudgeRequest({
      rubric: DEFAULT_RUBRIC,
      items: [{ id: "s01", question: "Q?", response: "A." }],
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects a duplicate id, an empty batch and an out-of-range score", () => {
    const item = { id: "s01", question: "Q?", response: "A." };
    expect(parseJudgeRequest({ rubric: DEFAULT_RUBRIC, items: [item, item] }).ok).toBe(false);
    expect(parseJudgeRequest({ rubric: DEFAULT_RUBRIC, items: [] }).ok).toBe(false);
    expect(
      parseJudgeRequest({
        rubric: { ...DEFAULT_RUBRIC, passThreshold: 9 },
        items: [item],
      }).ok,
    ).toBe(false);
  });
});

describe("parseModelOutput", () => {
  it("requires every expected id and no extras", () => {
    const ok = parseModelOutput(
      { results: [{ id: "s01", score: 4, rationale: "Mostly correct." }] },
      ["s01"],
    );
    expect(ok.ok).toBe(true);
    expect(parseModelOutput({ results: [{ id: "s01", score: 4, rationale: "x" }] }, ["s01", "s02"]).ok).toBe(false);
    expect(
      parseModelOutput(
        {
          results: [
            { id: "s01", score: 4, rationale: "x" },
            { id: "s02", score: 2, rationale: "y" },
          ],
        },
        ["s01"],
      ).ok,
    ).toBe(false);
  });

  it("rejects a repeated id and a score outside 1-5", () => {
    const result = { id: "s01", score: 3, rationale: "ok" };
    expect(parseModelOutput({ results: [result, result] }, ["s01"]).ok).toBe(false);
    expect(parseModelOutput({ results: [{ ...result, score: 0 }] }, ["s01"]).ok).toBe(false);
  });
});

describe("helpers", () => {
  it("derives pass and fail from the threshold", () => {
    expect(verdictFor(3, 3)).toBe("pass");
    expect(verdictFor(2, 3)).toBe("fail");
  });

  it("parses raw and fenced JSON payloads", () => {
    expect(parseJsonPayload('```json\n{"results":[]}\n```')).toEqual({ results: [] });
    expect(() => parseJsonPayload("not json")).toThrow(/JSON object/);
  });
});
