import type { JudgeItemInput, Rubric } from "./schemas.js";

export const JUDGE_SYSTEM = `You are a careful evaluation judge. Score each model response with the provided rubric only.

Return only JSON of the form:
{"results":[{"id":"s01","score":5,"rationale":"one or two sentences"}]}

Rules:
- score must be an integer 1, 2, 3, 4 or 5.
- Include every requested id exactly once. Do not add ids.
- Judge only the given responses. Do not invent facts that are not needed to score them.
- Be consistent: similar quality should receive a similar score.
- Keep each rationale to two sentences or fewer.`;

export const RETRY_SYSTEM = `Your previous reply was not valid JSON or did not cover every id. Return only a JSON object with a results array. Each result must include id, score (1-5), and rationale. Include every requested id exactly once and no extras.`;

export function buildJudgePrompt(rubric: Rubric, items: JudgeItemInput[]): string {
  const criteria = rubric.criteria
    .map((item, index) => `${index + 1}. ${item.name}: ${item.description}`)
    .join("\n");
  const rows = items
    .map(
      (item) =>
        `ID: ${item.id}\nQuestion: ${item.question}\nResponse: ${item.response}`,
    )
    .join("\n\n");
  return `Rubric name: ${rubric.name}
Pass threshold (for your information; you still return a 1-5 score): ${rubric.passThreshold}

Criteria:
${criteria}

Score each response:

${rows}`;
}
