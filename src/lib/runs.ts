import type { JudgeItemResult, Rubric, RunMode } from "./schemas.js";

export interface JudgeRun {
  id: string;
  label: string;
  at: string;
  mode: RunMode;
  notice?: string;
  rubric: Rubric;
  results: JudgeItemResult[];
}
