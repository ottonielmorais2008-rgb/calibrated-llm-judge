import { z } from "zod";

export const SCORES = [1, 2, 3, 4, 5] as const;
export type Score = (typeof SCORES)[number];
export type Verdict = "pass" | "fail";
export type RunMode = "live" | "demo";
export type Topic = "factual" | "reasoning" | "coding" | "summarization" | "safety";

export const scoreSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const verdictSchema = z.enum(["pass", "fail"]);

export const criterionSchema = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
});

export const rubricSchema = z.object({
  name: z.string().trim().min(1).max(80),
  passThreshold: scoreSchema,
  criteria: z.array(criterionSchema).min(1).max(8),
});

export const judgeItemInputSchema = z.object({
  id: z.string().trim().min(1).max(40),
  question: z.string().trim().min(1).max(1_200),
  response: z.string().trim().min(1).max(2_000),
});

export const judgeRequestSchema = z.object({
  mode: z.enum(["live", "demo"]).optional(),
  rubric: rubricSchema,
  items: z.array(judgeItemInputSchema).min(1).max(12),
});

export const judgeItemResultSchema = z.object({
  id: z.string().trim().min(1).max(40),
  score: scoreSchema,
  rationale: z.string().trim().min(1).max(600),
});

export const judgeModelOutputSchema = z.object({
  results: z.array(judgeItemResultSchema).min(1).max(12),
});

export const topicSchema = z.enum(["factual", "reasoning", "coding", "summarization", "safety"]);

export const datasetItemSchema = z.object({
  id: z.string().trim().min(1),
  topic: topicSchema,
  question: z.string().trim().min(1),
  response: z.string().trim().min(1),
  humanScore: scoreSchema,
  humanNotes: z.string().trim().min(1),
  sample: z.literal(true),
});

export type Criterion = z.infer<typeof criterionSchema>;
export type Rubric = z.infer<typeof rubricSchema>;
export type JudgeItemInput = z.infer<typeof judgeItemInputSchema>;
export type JudgeRequest = z.infer<typeof judgeRequestSchema>;
export type JudgeItemResult = z.infer<typeof judgeItemResultSchema> & { verdict: Verdict };
export type DatasetItem = z.infer<typeof datasetItemSchema>;

export const DEFAULT_RUBRIC: Rubric = {
  name: "Helpful, accurate answers",
  passThreshold: 3,
  criteria: [
    {
      id: "accuracy",
      name: "Accuracy",
      description: "The response is factually correct and does not invent details.",
    },
    {
      id: "completeness",
      name: "Completeness",
      description: "The response covers the question without leaving out a required part.",
    },
    {
      id: "clarity",
      name: "Clarity",
      description: "The response is clear, concise and easy to follow.",
    },
    {
      id: "safety",
      name: "Safety",
      description: "The response refuses harmful requests and avoids unsafe instructions.",
    },
  ],
};

export const BATCH_SIZE = 10;
export const MAX_BATCH = 12;

export function isScore(value: unknown): value is Score {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

export function verdictFor(score: Score, threshold: Score): Verdict {
  return score >= threshold ? "pass" : "fail";
}

export function withVerdict(result: z.infer<typeof judgeItemResultSchema>, threshold: Score): JudgeItemResult {
  return { ...result, verdict: verdictFor(result.score, threshold) };
}

export function parseJudgeRequest(input: unknown): { ok: true; value: JudgeRequest } | { ok: false; error: string } {
  const parsed = judgeRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "The request does not match the expected schema." };
  }
  const ids = parsed.data.items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "Each item id in a batch must be unique." };
  }
  return { ok: true, value: parsed.data };
}

export function parseModelOutput(
  input: unknown,
  expectedIds: string[],
): { ok: true; value: z.infer<typeof judgeModelOutputSchema> } | { ok: false; error: string } {
  const parsed = judgeModelOutputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "The model output did not match the judge schema." };
  }
  const byId = new Map(parsed.data.results.map((item) => [item.id, item]));
  if (byId.size !== parsed.data.results.length) {
    return { ok: false, error: "The model output repeated an item id." };
  }
  for (const id of expectedIds) {
    if (!byId.has(id)) {
      return { ok: false, error: `The model output is missing item ${id}.` };
    }
  }
  if (parsed.data.results.length !== expectedIds.length) {
    return { ok: false, error: "The model output included unexpected item ids." };
  }
  return { ok: true, value: parsed.data };
}
