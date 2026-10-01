import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MODEL = "claude-sonnet-5-5";

const SYSTEM = `You are a prompt-design assistant inside "Orbis Training", a tool for tuning steering prompts for Visko Orbis, a real-time video model steered with set_prompt while it streams.
The user picks a variant (a prompting method) and wants variations of it, for example changing who the family is or where they live.
You receive the current context: premise (the starting scene), sheet (character appearance), identity (lock for age/ethnicity/skin tone/face/hair), style, and the list of steers (one action each).
Prompt-guide rules to respect: concrete visible appearance, under ~100 words for the premise; one action per steer; introduce a new subject in one steer and act on it in the next; no restating of who/where inside steers; steers must name characters the same way the sheet does.
When the user asks for a change, rewrite the affected fields completely and consistently (names, appearance, setting, props, steers) and keep the number of steers exactly the same. Characters are fictional people the user is describing for their own scene; describe them as asked, with concrete visible traits, no stereotypes.
Reply with ONLY a JSON object:
{"reply":"short plain-language answer, 1-4 sentences","updates":null | {"premise"?:string,"sheet"?:string,"identity"?:string,"style"?:string,"steps"?:string[]}}
Include "updates" only when the user asked for a change; include only the fields that change, with full replacement text. For questions or advice, use "updates":null.`;

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }
  const body = (await request.json().catch(() => null)) as { messages?: Msg[]; context?: unknown } | null;
  const messages = body?.messages?.filter((m) => m && typeof m.content === "string" && m.content.trim());
  if (!messages?.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "A user message is required" }, { status: 400 });
  }
  const [first, ...rest] = messages;
  const withContext: Msg[] = [
    {
      ...first,
      content: `Current context (JSON):\n${JSON.stringify(body?.context ?? {}, null, 1)}\n\nUser: ${first.content}`,
    },
    ...rest,
  ];
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 2500, system: SYSTEM, messages: withContext.slice(-12) }),
    });
    if (!response.ok) {
      console.error("Assist upstream failed", response.status, await response.text());
      return NextResponse.json({ error: `Assistant failed (${response.status})` }, { status: 502 });
    }
    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((part) => part.type === "text")?.text ?? "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return NextResponse.json({ reply: text || "No answer.", updates: null });
    return NextResponse.json(JSON.parse(json), { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    console.error("Assist failed", caught);
    return NextResponse.json({ error: "Could not reach the assistant" }, { status: 502 });
  }
}
