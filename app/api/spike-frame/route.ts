import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

import { NANO_BANANA_MODEL } from "@/lib/nano-banana";
import { SCENES, frameFor, type SceneKey } from "@/lib/spike-consistency";

export const runtime = "nodejs";

// Spike only: text-to-image start frame from the hardcoded character sheet.
// Body: { scene: "farm" | "kitchen" } (defaults to farm).
export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
  }
  const body = (await request.json().catch(() => ({}))) as { scene?: string; prompt?: string };
  const scene: SceneKey = body.scene && body.scene in SCENES ? (body.scene as SceneKey) : "farm";
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: NANO_BANANA_MODEL,
      contents: [{ text: typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.slice(0, 4000) : frameFor(scene) }],
      // Orbis squashes non-16:9 reference images to 832x480.
      config: { imageConfig: { aspectRatio: "16:9" } },
    });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const output = parts.find((part) => part.inlineData?.data)?.inlineData;
    if (!output?.data) {
      return NextResponse.json({ error: "No image returned" }, { status: 502 });
    }
    return new Response(Buffer.from(output.data, "base64"), {
      headers: { "Cache-Control": "no-store", "Content-Type": output.mimeType || "image/png" },
    });
  } catch (caught) {
    console.error("Spike frame failed", caught);
    return NextResponse.json({ error: "Could not generate the frame" }, { status: 502 });
  }
}
