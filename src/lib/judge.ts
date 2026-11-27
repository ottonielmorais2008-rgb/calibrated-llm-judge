import { parseJsonPayload } from "./json.js";
import { JUDGE_SYSTEM, RETRY_SYSTEM, buildJudgePrompt } from "./prompts.js";
import {
  parseModelOutput,
  withVerdict,
  type JudgeItemInput,
  type JudgeItemResult,
  type Rubric,
} from "./schemas.js";
import type { LlmClient } from "./gemini.js";

function parseJudgeReply(text: string, expectedIds: string[], threshold: Rubric["passThreshold"]): JudgeItemResult[] {
  const parsed = parseModelOutput(parseJsonPayload(text), expectedIds);
  if (!parsed.ok) throw new Error(parsed.error);
  return expectedIds.map((id) => withVerdict(parsed.value.results.find((item) => item.id === id)!, threshold));
}

export async function completeJsonJudge(
  client: LlmClient,
  rubric: Rubric,
  items: JudgeItemInput[],
): Promise<JudgeItemResult[]> {
  const expectedIds = items.map((item) => item.id);
  const user = buildJudgePrompt(rubric, items);
  try {
    const first = await client.complete({ system: JUDGE_SYSTEM, user });
    return parseJudgeReply(first, expectedIds, rubric.passThreshold);
  } catch {
    const retry = await client.complete({ system: RETRY_SYSTEM, user });
    return parseJudgeReply(retry, expectedIds, rubric.passThreshold);
  }
}
