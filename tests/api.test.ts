import { afterEach, describe, expect, it } from "vitest";
import { executeJudge, handleJudgeHttp, JUDGE_LIMIT } from "../src/lib/api.js";
import { PRECOMPUTED_SCORES } from "../src/lib/demo.js";
import { DEFAULT_RUBRIC } from "../src/lib/schemas.js";
import { resetRateLimit } from "../src/lib/rate-limit.js";
import { FakeResponse, jsonJudge, post, queueClient, sampleItems, validRequest } from "./helpers.js";

afterEach(() => {
  resetRateLimit();
});

describe("handleJudgeHttp", () => {
  it("answers OPTIONS and rejects methods other than POST", async () => {
    const options = new FakeResponse();
    await handleJudgeHttp({ method: "OPTIONS", headers: {} }, options);
    expect(options.statusCode).toBe(204);

    const get = new FakeResponse();
    await handleJudgeHttp({ method: "GET", headers: {} }, get);
    expect(get.statusCode).toBe(405);
  });

  it("rejects invalid JSON and oversized bodies", async () => {
    const bad = new FakeResponse();
    await handleJudgeHttp(post("{"), bad);
    expect(bad.statusCode).toBe(400);

    const huge = new FakeResponse();
    await handleJudgeHttp(post("{}", { headers: { "content-length": "90000" } }), huge);
    expect(huge.statusCode).toBe(413);
  });

  it("rate-limits repeated requests from the same client", async () => {
    const body = validRequest({ mode: "demo" });
    for (let i = 0; i < JUDGE_LIMIT; i += 1) {
      const res = new FakeResponse();
      await handleJudgeHttp(post(body), res, { now: 1_000 });
      expect(res.statusCode).toBe(200);
    }
    const blocked = new FakeResponse();
    await handleJudgeHttp(post(body), blocked, { now: 1_000 });
    expect(blocked.statusCode).toBe(429);
  });
});

describe("executeJudge", () => {
  it("uses precomputed demo scores when no key is configured", async () => {
    const result = await executeJudge(
      { mode: "live", rubric: DEFAULT_RUBRIC, items: [{ id: "s01", question: "Q", response: "A long enough answer." }] },
      { env: {} },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.mode).toBe("demo");
    expect(result.result.results[0]?.score).toBe(PRECOMPUTED_SCORES.s01);
    expect(result.result.notice).toMatch(/no api key/i);
  });

  it("uses a mocked live model and retries once", async () => {
    const items = sampleItems(2);
    const result = await executeJudge(validRequest({ items }), {
      env: { GEMINI_API_KEY: "test-key" },
      client: queueClient(["not-json", jsonJudge({ t1: 5, t2: 1 })]),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.mode).toBe("live");
    expect(result.result.results.map((item) => item.score)).toEqual([5, 1]);
  });

  it("falls back to demo scores when the live model fails twice", async () => {
    const result = await executeJudge(
      validRequest({
        items: [{ id: "s02", question: "Capital?", response: "Sydney." }],
      }),
      { env: { GEMINI_API_KEY: "test-key" }, client: queueClient([new Error("down"), new Error("down")]) },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.mode).toBe("demo");
    expect(result.result.results[0]?.score).toBe(PRECOMPUTED_SCORES.s02);
    expect(result.result.notice).toMatch(/live model failed/i);
  });

  it("rejects a batch that is larger than the schema allows", async () => {
    const items = Array.from({ length: 13 }, (_, i) => ({
      id: `x${i}`,
      question: "Q?",
      response: "A.",
    }));
    const result = await executeJudge(validRequest({ items }), { env: { GEMINI_API_KEY: "test-key" } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });
});
