import { NextResponse } from "next/server";

export const runtime = "nodejs";

const JUDGE_MODEL = "claude-sonnet-5-5";
const MAX_BASE64 = 4_000_000;

type JudgeBody = {
  frame?: string;
  previous?: string;
  sheet?: string;
  labels?: [string, string];
  prompt?: string;
};

const SYSTEM = `You are a QA judge for a live cartoon video model. You see the CURRENT frame (and sometimes the PREVIOUS frame) after a steering prompt was sent.
Check character stability against the character sheet. Ratings per character:
same = matches the sheet; drift = small change (color, hat, proportions); mutated = clearly a different look; bleed = features swapped between characters; duplicate = an extra copy of the character; absent = not visible.
Also set rebuild=true if the whole scene was rebuilt (new setting, new composition, characters replaced) rather than the one requested change being applied.
verdict is "pass" only if both visible characters are same or drift-free and rebuild is false; otherwise "fail".
Reply with ONLY a JSON object: {"verdict":"pass"|"fail","first":rating,"second":rating,"rebuild":boolean,"reason":"one short sentence"}`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }
  const body = (await request.json().catch(() => ({}))) as JudgeBody;
  if (!body.frame || body.frame.length > MAX_BASE64) {
    return NextResponse.json({ error: "A frame (base64 JPEG, under 3 MB) is required" }, { status: 400 });
  }

  const image = (data: string) => ({
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data },
  });
  const content: unknown[] = [];
  if (body.previous && body.previous.length <= MAX_BASE64) {
    content.push({ type: "text", text: "PREVIOUS frame:" }, image(body.previous));
  }
  content.push(
    { type: "text", text: "CURRENT frame:" },
    image(body.frame),
    {
      type: "text",
      text: `Character sheet: ${body.sheet ?? "(none)"}\nCharacter names: first=${body.labels?.[0] ?? "first"}, second=${body.labels?.[1] ?? "second"}\nSteering prompt that was sent: ${body.prompt ?? "(unknown)"}`,
    },
  );

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: "user", content }],
      }),
    });
    if (!response.ok) {
      console.error("Judge upstream failed", response.status, await response.text());
      return NextResponse.json({ error: `Judge failed (${response.status})` }, { status: 502 });
    }
    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((part) => part.type === "text")?.text ?? "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return NextResponse.json({ error: "Judge returned no JSON" }, { status: 502 });
    return NextResponse.json(JSON.parse(json), { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    console.error("Judge failed", caught);
    return NextResponse.json({ error: "Could not judge the frame" }, { status: 502 });
  }
}
