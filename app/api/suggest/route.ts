import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MODEL = "claude-sonnet-5-5";

const SYSTEM = `You help tune steering prompts for Visko Orbis, a real-time video model steered with set_prompt while it streams.
Official prompt-guide rules: build the world once in the initial prompt (concrete appearance, under 100 words); do not restate WHO/WHERE in steers because that can read as a scene rebuild; one action per steer; introduce new subjects through action, not abstractly; bridge transitions; reset after about 2 minutes.
You get one finished test run: the method used, the kickoff prompt, every steer with the judge's verdict, and the human's overall assessment.
Reply with ONLY a JSON object:
{"suggestions":[{"action":"one short steering action, one sentence, no style or character restating","why":"what in the run supports it"}, ...exactly 4],
 "avoid":[{"pattern":"a steer pattern that failed or is risky","evidence":"which steer/verdict shows it, or 'rule: ...' if only from the guide"}],
 "doc":"Markdown findings doc: ## What worked, ## What did not work, ## Try next. Ground every claim in a steer from the run; mark guesses as hypotheses."}
Suggestions must differ from each other (different kinds of change) and must not repeat steers that already failed.`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }
  const run = await request.json().catch(() => null);
  if (!run || !Array.isArray(run.log)) {
    return NextResponse.json({ error: "A run with a log is required" }, { status: 400 });
  }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: JSON.stringify(run) }],
      }),
    });
    if (!response.ok) {
      console.error("Suggest upstream failed", response.status, await response.text());
      return NextResponse.json({ error: `Suggest failed (${response.status})` }, { status: 502 });
    }
    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((part) => part.type === "text")?.text ?? "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return NextResponse.json({ error: "No JSON returned" }, { status: 502 });
    return NextResponse.json(JSON.parse(json), { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    console.error("Suggest failed", caught);
    return NextResponse.json({ error: "Could not get suggestions" }, { status: 502 });
  }
}
