import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Dev-only: videos go to ./recordings (gitignored); run logs (.json) go to
// .planning/spikes/runs so they are tracked and readable by future sessions.
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 403 });
  }
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!/^[\w.-]+$/.test(name)) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }
  const isLog = name.endsWith(".json") || name.endsWith(".md");
  const dir = path.join(process.cwd(), isLog ? ".planning/spikes/runs" : "recordings");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await request.arrayBuffer()));
  return NextResponse.json({ saved: `${path.relative(process.cwd(), path.join(dir, name))}` });
}

// GET ?list=1 -> saved videos, newest first. GET ?name=<file> -> that video (Range supported for seeking).
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const dir = path.join(process.cwd(), "recordings");
  if (params.get("list")) {
    const names = await readdir(dir).catch(() => [] as string[]);
    const videos = await Promise.all(
      names
        .filter((n) => /\.(webm|mp4)$/.test(n))
        .map(async (n) => ({ name: n, mtime: (await stat(path.join(dir, n))).mtimeMs })),
    );
    videos.sort((a, b) => b.mtime - a.mtime);
    return NextResponse.json({ recordings: videos.map((v) => v.name) });
  }
  const name = params.get("name") ?? "";
  if (!/^[\w.-]+\.(webm|mp4)$/.test(name)) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }
  const data = await readFile(path.join(dir, name)).catch(() => null);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const type = name.endsWith(".mp4") ? "video/mp4" : "video/webm";
  const range = request.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
    return new Response(data.subarray(start, end + 1), {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Range": `bytes ${start}-${end}/${data.length}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
      },
    });
  }
  return new Response(data, {
    headers: { "Content-Type": type, "Content-Length": String(data.length), "Accept-Ranges": "bytes" },
  });
}
