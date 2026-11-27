# Calibrated LLM Judge

**Live demo:** https://calibrated-llm-judge.vercel.app

A small evaluation lab: label a bundled sample of model responses, run a Gemini judge against an editable rubric, and measure how well the judge agrees with the human labels. The page reports percent agreement, Cohen's kappa, a confusion matrix and a disagreement list. After you tweak the rubric and run the judge again, you can compare rubric v1 with v2.

The dataset is bundled sample / example data with illustrative labels. It is not a published benchmark.

The page opens with precomputed demo scores, so you can inspect the metrics without calling a model.

## How it works

1. **Labels** — fifty bundled question/response pairs already have human 1–5 scores. You can edit those scores or add a new labelled pair. Labels are saved in `localStorage`.
2. **Rubric** — edit the criteria and the pass threshold (a response passes when its score is at least the threshold).
3. **Judge** — `POST /api/judge` sends responses to Gemini (`gemini-3.5-flash-lite`) in batches from a Vercel serverless function. The API key lives only in Vercel environment variables and is never sent to the browser. Requests are rate-limited, size-capped and validated with Zod; a malformed model reply is retried once.
4. **Agreement** — the page compares human labels with the judge: pass/fail accuracy, Cohen's kappa, exact score match, mean absolute error, quadratic weighted kappa, a confusion matrix and a disagreement list.

If the key is missing or the model fails, the same UI uses deterministic demo scores (precomputed for the default rubric, and a stable local adjustment if you change the rubric text). "Use demo scores" always takes that path and does not call the model.

## Tech

- React 19, TypeScript, Vite
- Zod schemas for the rubric, the request batch and the judge output
- Vercel serverless function for the optional Gemini path
- Vitest unit tests for the metrics (including Cohen's kappa), the Zod schemas, the demo fallback and the API handler (with a mocked model)
- GitHub Actions: lint, typecheck, test and build on every push and pull request

```
src/data/sample-dataset.json   Bundled sample / example labels
src/lib/schemas.ts             Zod contracts and the default rubric
src/lib/metrics.ts             Agreement, kappa, confusion matrix
src/lib/demo.ts                Precomputed and deterministic demo scores
src/lib/judge.ts               Parse model JSON and retry once
src/lib/api.ts                 /api/judge handler, batch limit, rate limit, fallback
```

## Limits

- The bundled labels are a small example set, not a gold-standard evaluation benchmark.
- The live judge scores at most 12 responses per request; the UI sends them in batches of 10 and is rate-limited.
- Malformed model output is retried once; a second failure falls back to demo scores for that batch.
- Demo scores are deterministic stand-ins, not a second model. Changing only the pass threshold keeps the demo scores and updates verdicts; changing the rubric text can nudge some demo scores.
- Cohen's kappa is computed on the pass/fail split implied by the rubric threshold. Score agreement is reported separately.
- This is an educational demo, not a substitute for a production evaluation pipeline.

## Running it yourself

Requires Node.js 20.9+.

```bash
npm install
npm test
npm run dev
```

The Vite dev server also serves `/api/judge`. To try the live model locally, copy `.env.example` to `.env` and set `GEMINI_API_KEY`. The sample dataset and demo mode work without it.

## License

[MIT](LICENSE)
