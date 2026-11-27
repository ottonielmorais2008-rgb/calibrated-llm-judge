import raw from "../data/sample-dataset.json" with { type: "json" };
import { datasetItemSchema, type DatasetItem } from "./schemas.js";

const parsed = datasetItemSchema.array().min(50).max(50).parse(raw.items);

if (new Set(parsed.map((item) => item.id)).size !== parsed.length) {
  throw new Error("The sample dataset has duplicate ids.");
}

export const SAMPLE_NOTICE =
  "This is a bundled sample / example dataset with illustrative human labels. It is not a published benchmark.";

export const SAMPLE_DATASET: DatasetItem[] = parsed;

export function getSampleItem(id: string): DatasetItem | undefined {
  return SAMPLE_DATASET.find((item) => item.id === id);
}
