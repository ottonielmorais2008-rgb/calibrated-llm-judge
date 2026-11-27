import { demoResultsFor } from "./demo.js";
import { createGeminiClient, getGeminiApiKey, getModelId, type EnvMap, type LlmClient } from "./gemini.js";
import { cors, methodOf, readJsonBody, tooLarge, type HttpRequest, type HttpResponse } from "./http.js";
import { completeJsonJudge } from "./judge.js";
import { allow, clientIp } from "./rate-limit.js";
import { parseJudgeRequest, type JudgeItemResult, type RunMode } from "./schemas.js";

export const JUDGE_LIMIT = 8;
export const JUDGE_WINDOW_MS = 60_000;

export interface JudgeDeps {
  env?: EnvMap;
  client?: LlmClient;
  now?: number;
}

export interface JudgeSuccess {
  mode: RunMode;
  notice?: string;
  results: JudgeItemResult[];
}

export function resolveMode(
  requested: unknown,
  hasKey: boolean,
): { mode: Exclude<RunMode, never>; notice?: string; useMock: boolean } {
  if (requested === "demo") {
    return { mode: "demo", useMock: true, notice: "Demo mode used precomputed judge scores, not the live model." };
  }
  if (requested === "live" || requested == null || requested === "") {
    if (!hasKey) {
      return {
        mode: "demo",
        useMock: true,
        notice: "No API key is configured, so this run used the built-in demo scores.",
      };
    }
    return { mode: "live", useMock: false };
  }
  return { mode: "demo", useMock: true, notice: "Unknown mode; falling back to the built-in demo scores." };
}

export async function executeJudge(
  input: unknown,
  deps: JudgeDeps = {},
): Promise<{ ok: true; result: JudgeSuccess } | { ok: false; status: number; error: string }> {
  const parsed = parseJudgeRequest(input);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

  const env = deps.env ?? process.env;
  const apiKey = getGeminiApiKey(env);
  const resolved = resolveMode(parsed.value.mode, Boolean(apiKey));
  const demo = (notice?: string): JudgeSuccess => ({
    mode: "demo",
    notice,
    results: demoResultsFor(parsed.value.items, parsed.value.rubric),
  });

  if (resolved.useMock) {
    return { ok: true, result: demo(resolved.notice) };
  }

  const client = deps.client ?? createGeminiClient(apiKey!, getModelId(env));
  try {
    const results = await completeJsonJudge(client, parsed.value.rubric, parsed.value.items);
    return { ok: true, result: { mode: "live", results } };
  } catch {
    return {
      ok: true,
      result: demo("The live model failed, so this run used the built-in demo scores instead."),
    };
  }
}

export async function handleJudgeHttp(req: HttpRequest, res: HttpResponse, deps: JudgeDeps = {}): Promise<void> {
  cors(res);
  if (methodOf(req) === "OPTIONS") {
    res.status(204).json(null);
    return;
  }
  if (methodOf(req) !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  if (tooLarge(req)) {
    res.status(413).json({ error: "The request is too large." });
    return;
  }
  const body = readJsonBody(req);
  if (!body.ok) {
    res.status(400).json({ error: body.error });
    return;
  }
  const ip = clientIp(req.headers ?? {}, req.socket?.remoteAddress ?? "unknown");
  if (!allow(`judge:${ip}`, JUDGE_LIMIT, JUDGE_WINDOW_MS, deps.now ?? Date.now())) {
    res.status(429).json({ error: "Too many judge requests. Please wait a moment and try again." });
    return;
  }
  const result = await executeJudge(body.value, deps);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(200).json(result.result);
}
