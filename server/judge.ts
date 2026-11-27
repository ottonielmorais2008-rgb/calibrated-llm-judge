import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleJudgeHttp } from "../src/lib/api.js";

export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await handleJudgeHttp(req, res);
}
