import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Dev-only persistence for variant edits made through "Ask Claude".
// overrides -> .planning/spikes/variants.overrides.json (applied on page load)
// log       -> .planning/spikes/variants-changelog.json + .md (tracked in git)
const dir = path.join(process.cwd(), ".planning/spikes");
const overridesFile = path.join(dir, "variants.overrides.json");
const logFile = path.join(dir, "variants-changelog.json");
const mdFile = path.join(dir, "variants-changelog.md");

type Change = { field: string; before: string; after: string };
type Entry = {
  at: string;
  action: "claude-edit" | "reset";
  variant: string;
  scene: string;
  request: string;
  summary: string;
  changes: Change[];
};

const readJson = async <T,>(file: string, fallback: T): Promise<T> =>
  JSON.parse(await readFile(file, "utf8").catch(() => "null")) ?? fallback;

const blocked = () =>
  process.env.NODE_ENV === "production"
    ? NextResponse.json({ error: "Disabled in production" }, { status: 403 })
    : null;

export async function GET() {
  const denied = blocked();
  if (denied) return denied;
  return NextResponse.json({
    overrides: await readJson(overridesFile, {}),
    changelog: await readJson<Entry[]>(logFile, []),
  });
}

export async function POST(request: Request) {
  const denied = blocked();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { overrides?: unknown; entry?: Entry } | null;
  const entry = body?.entry;
  if (!body?.overrides || typeof body.overrides !== "object" || !entry || !Array.isArray(entry.changes)) {
    return NextResponse.json({ error: "overrides and a log entry are required" }, { status: 400 });
  }
  const stamped: Entry = { ...entry, at: new Date().toISOString() };
  await mkdir(dir, { recursive: true });
  await writeFile(overridesFile, JSON.stringify(body.overrides, null, 2));
  const log = await readJson<Entry[]>(logFile, []);
  log.push(stamped);
  await writeFile(logFile, JSON.stringify(log, null, 2));
  const lines = [
    `## ${stamped.at} · ${stamped.action} · ${stamped.variant} (${stamped.scene})`,
    "",
    `Request: ${stamped.request}`,
    "",
    stamped.summary,
    "",
    ...stamped.changes.flatMap((c) => [`### ${c.field}`, "", `Before: ${c.before}`, "", `After: ${c.after}`, ""]),
    "",
  ];
  await appendFile(mdFile, (log.length === 1 ? "# Variant change log\n\n" : "") + lines.join("\n"));
  return NextResponse.json({ saved: true, changelog: log });
}
