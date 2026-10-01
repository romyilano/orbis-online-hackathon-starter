"use client";

import { ReactorProvider, useReactor } from "@reactor-team/js-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { OrbisPlayer } from "@/components/orbis-player";
import { useOrbisSession } from "@/hooks/use-orbis-session";
import { ORBIS_MODEL_NAME, ORBIS_TRACKS, requestReactorJwt } from "@/lib/orbis";
import {
  SCENES,
  VARIANTS,
  buildPrompt,
  defaultCtx,
  frameFor,
  kickoffFor,
  lintSteer,
  stepsFor,
  type Ctx,
  type SceneKey,
  type VariantKey,
} from "@/lib/spike-consistency";

type LogEntry = {
  t: string;
  variant: VariantKey;
  step: number;
  action: string;
  prompt: string;
  note?: string;
  thumb?: string;
  previous?: string;
  judge?: Judge | "pending" | { error: string };
  overridden?: boolean;
  manual?: Partial<Record<Who, Rating>>;
};

// same = matches the sheet; drift = small change (color, hat, proportions);
// mutated = clearly a different look; bleed = features swapped or merged
// between characters; duplicate = an extra copy of the character appears.
type Rating = "same" | "drift" | "mutated" | "bleed" | "duplicate";
const RATINGS: Rating[] = ["same", "drift", "mutated", "bleed", "duplicate"];
type Who = "first" | "second";

type Updates = Partial<Ctx> & { steps?: string[] };
type ChatMessage = { role: "user" | "assistant"; content: string; updates?: Updates | null; applied?: boolean };

type LogChange = { field: string; before: string; after: string };
type ChangeLogEntry = {
  at: string;
  action: "claude-edit" | "reset";
  variant: string;
  scene: string;
  request: string;
  summary: string;
  changes: LogChange[];
};

type Judge = {
  verdict: "pass" | "fail";
  first: string;
  second: string;
  rebuild: boolean;
  reason: string;
};

type Advice = {
  suggestions: { action: string; why: string }[];
  avoid: { pattern: string; evidence: string }[];
  doc: string;
};

// Time for Orbis to render the steer before the frame is judged.
const SETTLE_MS = 6000;


export function ConsistencySpike() {
  const jwtPromise = useRef<Promise<string> | null>(null);
  const currentJwt = useRef<string | null>(null);
  const getJwt = useCallback(async () => {
    const pending = (jwtPromise.current ??= requestReactorJwt());
    try {
      const jwt = await pending;
      currentJwt.current = jwt;
      return jwt;
    } catch (error) {
      if (jwtPromise.current === pending) jwtPromise.current = null;
      throw error;
    }
  }, []);
  const getCurrentJwt = useCallback(() => currentJwt.current, []);
  const clearJwt = useCallback(() => {
    jwtPromise.current = null;
    currentJwt.current = null;
  }, []);

  return (
    <section className="demo-shell">
      <ReactorProvider
        apiUrl="https://api.reactor.inc"
        modelName={ORBIS_MODEL_NAME}
        modelTracks={[...ORBIS_TRACKS]}
        connectOptions={{ autoConnect: false }}
        jwtToken={getJwt}
      >
        <SpikeBody clearJwt={clearJwt} getCurrentJwt={getCurrentJwt} />
      </ReactorProvider>
    </section>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function SpikeBody({
  clearJwt,
  getCurrentJwt,
}: {
  clearJwt: () => void;
  getCurrentJwt: () => string | null;
}) {
  const session = useOrbisSession(clearJwt, getCurrentJwt);
  const sendCommand = useReactor((state) => state.sendCommand);

  const [variant, setVariant] = useState<VariantKey>("001a-delta");
  const [frame, setFrame] = useState<File | null>(null);
  const [frameUrl, setFrameUrl] = useState("");
  const [frameScene, setFrameScene] = useState<SceneKey | null>(null);
  const [frameBusy, setFrameBusy] = useState(false);
  const [note, setNote] = useState("");
  const [nextStep, setNextStep] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [recording, setRecording] = useState(false);
  const [autoRecord, setAutoRecord] = useState(true);
  const [ctxs, setCtxs] = useState<Record<SceneKey, Ctx>>({
    farm: defaultCtx("farm"),
    kitchen: defaultCtx("kitchen"),
  });
  const ctxFor = (v: VariantKey) => ctxs[VARIANTS[v].scene];
  const editCtx = (sceneKey: SceneKey, patch: Partial<Ctx>) =>
    setCtxs((current) => ({ ...current, [sceneKey]: { ...current[sceneKey], ...patch } }));
  const [custom, setCustom] = useState("");
  const [assessment, setAssessment] = useState("");
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [advising, setAdvising] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setHeaderSlot(document.getElementById("header-controls")), []);
  const [changelog, setChangelog] = useState<ChangeLogEntry[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [recordings, setRecordings] = useState<{ name: string; url: string; saved?: string }[]>([]);
  const [pick, setPickRaw] = useState<number | "custom">(0);
  const [stepEdits, setStepEdits] = useState<Record<string, string>>({});
  const [promptEdit, setPromptEdit] = useState<string | null>(null);
  const setPick = (next: number | "custom") => {
    setPromptEdit(null);
    setPickRaw(next);
  };
  const stepText = (v: VariantKey, i: number) => stepEdits[`${v}:${i}`] ?? stepsFor(v)[i];

  const playerRef = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const runVariant = useRef<VariantKey>(variant);
  const runStart = useRef(0);

  const scene: SceneKey = VARIANTS[variant].scene;
  const [labelA, labelB] = SCENES[scene].labels;

  const stamp = () => `${((Date.now() - runStart.current) / 1000).toFixed(1)}s`;

  const generateFrame = async () => {
    setFrameBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/spike-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene, prompt: frameFor(scene, ctxs[scene]) }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const blob = await response.blob();
      setFrame(new File([blob], "spike-frame.png", { type: blob.type }));
      setFrameUrl(URL.createObjectURL(blob));
      setFrameScene(scene);
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "Frame failed");
    } finally {
      setFrameBusy(false);
    }
  };

  const startRecording = useCallback(() => {
    const video = playerRef.current?.querySelector("video") as
      | (HTMLVideoElement & { captureStream?: () => MediaStream })
      | null;
    if (!video || recorder.current) return;
    let stream = video.captureStream?.();
    // Fallback (Safari etc.): redraw the video onto a canvas and record that.
    if (!stream || stream.getVideoTracks().length === 0) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 832;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      const draw = () => {
        if (!recorder.current) return;
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(draw);
      };
      stream = canvas.captureStream(24);
      requestAnimationFrame(draw);
    }
    const mimeType = ["video/webm;codecs=vp9", "video/webm", "video/mp4"].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType) {
      setNote("This browser cannot record video; use Cmd+Shift+5 to screen-record.");
      return;
    }
    const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
    chunks.current = [];
    const rec = new MediaRecorder(stream, { mimeType });
    rec.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
    rec.onstop = async () => {
      const blob = new Blob(chunks.current, { type: mimeType });
      const name = `spike-${runVariant.current}-${Date.now()}.${ext}`;
      download(blob, name);
      const url = URL.createObjectURL(blob);
      try {
        const response = await fetch(`/api/save-recording?name=${name}`, { method: "POST", body: blob });
        const data = await response.json();
        setNote(response.ok ? `Saved ${data.saved}` : data.error);
        setRecordings((current) => [{ name, url, saved: response.ok ? data.saved : undefined }, ...current]);
      } catch {
        setRecordings((current) => [{ name, url }, ...current]);
        setNote("Downloaded, but could not save into ./recordings");
      }
      recorder.current = null;
      setRecording(false);
    };
    recorder.current = rec;
    rec.start(1000);
    setRecording(true);
  }, []);

  const stopRecording = () => recorder.current?.stop();

  // Permanent variant changes made through "Ask Claude" are re-applied on load.
  useEffect(() => {
    fetch("/api/variants")
      .then((response) => response.json())
      .then(
        (data: {
          overrides?: { ctxs?: Partial<Record<SceneKey, Ctx>>; steps?: Record<string, string> };
          changelog?: ChangeLogEntry[];
        }) => {
          const saved = data.overrides;
          if (saved?.ctxs) setCtxs((current) => ({ ...current, ...saved.ctxs }));
          if (saved?.steps) setStepEdits(saved.steps);
          setChangelog(data.changelog ?? []);
        },
      )
      .catch(() => {});
  }, []);

  // Past recordings saved in ./recordings reappear after a reload.
  useEffect(() => {
    fetch("/api/save-recording?list=1")
      .then((response) => response.json())
      .then((data: { recordings?: string[] }) =>
        setRecordings((current) => {
          const have = new Set(current.map((rec) => rec.name));
          const past = (data.recordings ?? [])
            .filter((name) => !have.has(name))
            .map((name) => ({
              name,
              url: `/api/save-recording?name=${name}`,
              saved: `recordings/${name}`,
            }));
          return [...current, ...past];
        }),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (session.runStarted && autoRecord) {
      const id = setTimeout(startRecording, 1500);
      return () => clearTimeout(id);
    }
    if (!session.runStarted && recorder.current) recorder.current.stop();
  }, [session.runStarted, autoRecord, startRecording]);

  const startRun = async () => {
    runVariant.current = variant;
    runStart.current = Date.now();
    setNextStep(0);
    setLog([]);
    const kickoff = kickoffFor(variant, ctxFor(variant));
    await session.startWithPrompt(VARIANTS[variant].image ? frame : null, kickoff);
  };

  const grabFrame = () => {
    const video = playerRef.current?.querySelector("video");
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = Math.round((640 * video.videoHeight) / video.videoWidth);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  };

  const patchEntry = (id: number, patch: Partial<LogEntry>) =>
    setLog((current) => current.map((entry) => (entry.step === id ? { ...entry, ...patch } : entry)));

  const judgeEntry = async (id: number, prompt: string, previous?: string) => {
    const frame = grabFrame();
    if (!frame) return patchEntry(id, { judge: { error: "No video frame to judge" } });
    patchEntry(id, { thumb: frame, judge: "pending" });
    try {
      const response = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frame: frame.split(",")[1],
          previous: previous?.split(",")[1],
          sheet: `${ctxFor(runVariant.current).sheet} ${ctxFor(runVariant.current).identity}`,
          labels: SCENES[VARIANTS[runVariant.current].scene].labels,
          prompt,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      patchEntry(id, { judge: data as Judge });
    } catch (caught) {
      patchEntry(id, { judge: { error: caught instanceof Error ? caught.message : "Judge failed" } });
    }
  };

  const sendSteer = async (action: string, fromStep: boolean) => {
    const prompt = fromStep ? buildPrompt(runVariant.current, action, ctxFor(runVariant.current)) : action;
    const previous = grabFrame() ?? undefined;
    await sendCommand("set_prompt", { prompt });
    const id = log.length + 1;
    setLog((current) => [
      ...current,
      { t: stamp(), variant: runVariant.current, step: id, action, prompt, previous, judge: "pending" },
    ]);
    setTimeout(() => judgeEntry(id, prompt, previous), SETTLE_MS);
  };

  const steer = async () => {
    const action = stepText(runVariant.current, nextStep);
    if (!action) return;
    await sendSteer(action, true);
    setNextStep((current) => current + 1);
    setPick(nextStep + 1 < stepsFor(runVariant.current).length ? nextStep + 1 : "custom");
  };

  const sendPicked = async () => {
    if (pick === "custom") {
      if (custom.trim()) await sendSteer(custom.trim(), false);
      return;
    }
    if (promptEdit !== null) await sendSteer(promptEdit.trim(), false);
    else await sendSteer(stepText(runVariant.current, pick), true);
    setNextStep((current) => Math.max(current, pick + 1));
  };

  const runSummary = () => {
    const scene = VARIANTS[runVariant.current].scene;
    return {
        variant: runVariant.current,
        scene,
        slots: { first: SCENES[scene].labels[0], second: SCENES[scene].labels[1] },
        kickoff: kickoffFor(runVariant.current, ctxFor(runVariant.current)),
      context: ctxFor(runVariant.current),
        assessment,
        passed: `${passed}/${judged.length}`,
        log: log.map((entry) => ({ ...entry, thumb: undefined, previous: undefined })),
    };
  };

  const getAdvice = async () => {
    setAdvising(true);
    try {
      const response = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runSummary()),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAdvice(data as Advice);
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "Suggestions failed");
    } finally {
      setAdvising(false);
    }
  };

  const saveFindings = async () => {
    if (!advice) return;
    const name = `findings-${runVariant.current}-${Date.now()}.md`;
    download(new Blob([advice.doc], { type: "text/markdown" }), name);
    const response = await fetch(`/api/save-recording?name=${name}`, { method: "POST", body: advice.doc });
    const data = await response.json();
    setNote(response.ok ? `Saved ${data.saved}` : data.error);
  };

  const saveRun = async () => {
    const body = JSON.stringify(runSummary(), null, 2);
    const name = `run-${runVariant.current}-${Date.now()}.json`;
    download(new Blob([body], { type: "application/json" }), name);
    try {
      const response = await fetch(`/api/save-recording?name=${name}`, { method: "POST", body });
      const data = await response.json();
      setNote(response.ok ? `Saved ${data.saved}` : data.error);
    } catch {
      setNote("Downloaded, but could not save into the repo");
    }
  };

  const rate = (id: number, who: Who, rating: Rating) =>
    setLog((current) =>
      current.map((entry) =>
        entry.step === id ? { ...entry, manual: { ...entry.manual, [who]: rating } } : entry,
      ),
    );
  const setEntryNote = (id: number, value: string) =>
    patchEntry(id, { note: value });

  const override = (id: number, verdict: "pass" | "fail") =>
    setLog((current) =>
      current.map((entry) =>
        entry.step === id && typeof entry.judge === "object" && "verdict" in entry.judge
          ? { ...entry, overridden: true, judge: { ...entry.judge, verdict } }
          : entry,
      ),
    );

  const judged = log.filter((e) => typeof e.judge === "object" && "verdict" in e.judge);
  const passed = judged.filter((e) => (e.judge as Judge).verdict === "pass").length;

  const steps = stepsFor(session.runStarted ? runVariant.current : variant);

  const canRun =
    session.connected &&
    !session.runStarted &&
    !session.controlsBusy &&
    (!VARIANTS[variant].image || (frame && frameScene === scene));

  const viewVariant = session.runStarted ? runVariant.current : variant;
  const displayPrompt =
    pick === "custom"
      ? custom
      : (promptEdit ?? buildPrompt(viewVariant, stepText(viewVariant, pick), ctxFor(viewVariant)));
  const warnings = displayPrompt ? lintSteer(displayPrompt, runVariant.current) : [];

  const sendChat = async (text: string) => {
    const content = text.trim();
    if (!content || chatBusy) return;
    const next: ChatMessage[] = [...chat, { role: "user", content }];
    setChat(next);
    setChatInput("");
    setChatBusy(true);
    try {
      const response = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content: c }) => ({ role, content: c })),
          context: {
            variant: viewVariant,
            label: VARIANTS[viewVariant].label,
            about: VARIANTS[viewVariant].about,
            ...ctxFor(viewVariant),
            steps: stepsFor(viewVariant).map((_, i) => stepText(viewVariant, i)),
            lastRun: log.map((e) => ({
              steer: e.action,
              verdict: typeof e.judge === "object" && "verdict" in e.judge ? e.judge.verdict : undefined,
              reason: typeof e.judge === "object" && "reason" in e.judge ? e.judge.reason : undefined,
            })),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setChat([...next, { role: "assistant", content: data.reply, updates: data.updates }]);
    } catch (caught) {
      setChat([
        ...next,
        { role: "assistant", content: caught instanceof Error ? caught.message : "Assistant failed" },
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  const persistVariants = async (
    nextCtxs: Record<SceneKey, Ctx>,
    nextSteps: Record<string, string>,
    entry: Omit<ChangeLogEntry, "at">,
  ) => {
    const changedCtxs: Partial<Record<SceneKey, Ctx>> = {};
    (Object.keys(nextCtxs) as SceneKey[]).forEach((key) => {
      if (JSON.stringify(nextCtxs[key]) !== JSON.stringify(defaultCtx(key))) changedCtxs[key] = nextCtxs[key];
    });
    try {
      const response = await fetch("/api/variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: { ctxs: changedCtxs, steps: nextSteps }, entry }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setChangelog(data.changelog);
      setNote("Saved permanently and added to the change log (.planning/spikes/variants-changelog.md)");
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "Could not save the change");
    }
  };

  const applyUpdates = (index: number, permanent: boolean) => {
    const updates = chat[index]?.updates;
    if (!updates) return;
    const { steps: newSteps, ...fields } = updates;
    const sceneKey = VARIANTS[viewVariant].scene;
    const before = ctxs[sceneKey];
    const nextCtxs = { ...ctxs, [sceneKey]: { ...before, ...fields } };
    const nextSteps = { ...stepEdits };
    const changes: LogChange[] = (Object.keys(fields) as (keyof Ctx)[]).map((field) => ({
      field: `${sceneKey}.${field}`,
      before: before[field],
      after: fields[field] ?? "",
    }));
    if (newSteps) {
      stepsFor(viewVariant).forEach((_, i) => {
        if (typeof newSteps[i] !== "string") return;
        changes.push({
          field: `${viewVariant}.step ${i + 1}`,
          before: stepText(viewVariant, i),
          after: newSteps[i],
        });
        nextSteps[`${viewVariant}:${i}`] = newSteps[i];
      });
    }
    setCtxs(nextCtxs);
    setStepEdits(nextSteps);
    setPromptEdit(null);
    setChat((current) => current.map((m, i) => (i === index ? { ...m, applied: true } : m)));
    if (permanent) {
      const request = [...chat.slice(0, index)].reverse().find((m) => m.role === "user")?.content ?? "";
      void persistVariants(nextCtxs, nextSteps, {
        action: "claude-edit",
        variant: viewVariant,
        scene: sceneKey,
        request,
        summary: chat[index].content,
        changes,
      });
    }
  };

  const resetScene = () => {
    const sceneKey = VARIANTS[viewVariant].scene;
    const before = ctxs[sceneKey];
    const defaults = defaultCtx(sceneKey);
    const nextCtxs = { ...ctxs, [sceneKey]: defaults };
    const nextSteps = Object.fromEntries(
      Object.entries(stepEdits).filter(([key]) => VARIANTS[key.split(":")[0] as VariantKey]?.scene !== sceneKey),
    );
    setCtxs(nextCtxs);
    setStepEdits(nextSteps);
    setPromptEdit(null);
    const changes: LogChange[] = (Object.keys(defaults) as (keyof Ctx)[])
      .filter((field) => before[field] !== defaults[field])
      .map((field) => ({ field: `${sceneKey}.${field}`, before: before[field], after: defaults[field] }));
    void persistVariants(nextCtxs, nextSteps, {
      action: "reset",
      variant: viewVariant,
      scene: sceneKey,
      request: "Reset to defaults",
      summary: `Reset the ${sceneKey} scene and its steers to the built-in defaults.`,
      changes,
    });
  };

  return (
    <>
    {headerSlot &&
      createPortal(
        <div className="header-controls">
          <p>
            <button onClick={session.connectSession} disabled={session.connected || session.controlsBusy}>
              1. Connect
            </button>{" "}
            <button onClick={generateFrame} disabled={frameBusy}>
              {frameBusy ? "Generating…" : `2. Generate start frame (${scene})`}
            </button>
          </p>
          {frame && frameScene !== scene && (
            <p role="status">
              The current frame is for the {frameScene} scene; generate a new one for {scene}.
            </p>
          )}
        </div>,
        headerSlot,
      )}
    <div className="session-grid">
      <div>
        <div ref={playerRef}>
          <OrbisPlayer
            connected={session.connected}
            muted
            runStarted={session.runStarted}
            status={session.status}
          />
        </div>
        <section className="qa-scroll">
          <h3 style={{ margin: 0 }}>
            QA feed {judged.length > 0 && `(${passed}/${judged.length} pass)`}
          </h3>
          {log.some((e) => e.manual) && (
            <p style={{ fontSize: 16 }}>
              Manual tally ({labelA} / {labelB}):{" "}
              {RATINGS.map(
                (r) =>
                  `${r} ${log.filter((e) => e.manual?.first === r).length}/${log.filter((e) => e.manual?.second === r).length}`,
              ).join(" · ")}
            </p>
          )}
          {log.length === 0 && <p>Send a steer and the judged result appears here.</p>}
          <ol reversed className="qa-list">
            {[...log].reverse().map((entry) => {
              const j = entry.judge;
              const done = typeof j === "object" && "verdict" in j;
              return (
                <li key={entry.step} style={{ marginBottom: 12 }}>
                  [{entry.t}] {entry.action}
                  {entry.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={entry.thumb} alt="judged frame" style={{ display: "block", width: "100%", borderRadius: 6 }} />
                  )}
                  {j === "pending" && <div>Judging…</div>}
                  {typeof j === "object" && "error" in j && <div role="alert">{j.error}</div>}
                  <div>
                    {(["first", "second"] as Who[]).map((who) => (
                      <div key={who}>
                        {who === "first" ? labelA : labelB}:{" "}
                        {RATINGS.map((rating) => (
                          <button
                            key={rating}
                            onClick={() => rate(entry.step, who, rating)}
                            disabled={entry.manual?.[who] === rating}
                          >
                            {rating}
                          </button>
                        ))}
                      </div>
                    ))}
                    <input
                      placeholder={`note (e.g. ${labelB} got ${labelA}'s ribbon)`}
                      value={entry.note ?? ""}
                      onChange={(event) => setEntryNote(entry.step, event.target.value)}
                    />
                  </div>
                  {done && (
                    <div>
                      <strong>{j.verdict === "pass" ? "✅ PASS" : "❌ FAIL"}</strong>
                      {entry.overridden && " (overridden)"} · {labelA}: {j.first} · {labelB}: {j.second}
                      {j.rebuild && " · scene rebuilt"}
                      <div>{j.reason}</div>
                      <button onClick={() => override(entry.step, "pass")}>mark pass</button>{" "}
                      <button onClick={() => override(entry.step, "fail")}>mark fail</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
        <fieldset>
          <legend>Steering prompts</legend>
          {steps.map((_, index) => (
            <div key={index} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
              <input
                type="radio"
                style={{ width: "auto", flexShrink: 0 }}
                name="pick"
                checked={pick === index}
                onChange={() => setPick(index)}
              />
              <input
                value={stepText(viewVariant, index)}
                onFocus={() => pick !== index && setPick(index)}
                onChange={(event) => {
                  setPromptEdit(null);
                  setStepEdits((current) => ({
                    ...current,
                    [`${viewVariant}:${index}`]: event.target.value,
                  }));
                }}
                style={{ flex: 1, minWidth: 0, width: "auto" }}
              />
              {index < nextStep ? "✓" : ""}
            </div>
          ))}
          <label style={{ display: "block" }}>
            <input type="radio" style={{ width: "auto" }} name="pick" checked={pick === "custom"} onChange={() => setPick("custom")} />{" "}
            Custom (sent exactly as written)
          </label>
          {warnings.map((warning) => (
            <p key={warning} role="status">⚠ {warning}</p>
          ))}
          <label style={{ display: "block" }}>
            Exact text sent to Orbis (editable)
            <textarea
              value={displayPrompt}
              onChange={(event) =>
                pick === "custom" ? setCustom(event.target.value) : setPromptEdit(event.target.value)
              }
              rows={5}
              style={{ width: "100%" }}
              placeholder="Type a steering prompt"
            />
          </label>
          <button onClick={sendPicked} disabled={!session.runStarted}>
            Send selected steer
          </button>
        </fieldset>
        {recordings.length > 0 && (
          <section>
            <h3>Recordings</h3>
            {recordings.map((rec) => (
              <div key={rec.name} style={{ marginBottom: 12 }}>
                <video
                  controls
                  preload="metadata"
                  src={`${rec.url}#t=0.5`}
                  style={{ width: "100%", borderRadius: 8 }}
                />
                <small>
                  {rec.name}
                  {rec.saved ? ` · saved to ${rec.saved}` : " · downloaded only"}
                </small>
              </div>
            ))}
          </section>
        )}
      </div>
      <div className="controls">
        <section className="chat">
          <h3 style={{ margin: 0 }}>Ask Claude</h3>
          <p style={{ margin: 0, fontSize: 15 }}>
            Chat about steering prompts, your results, or a variation of the selected variant. If you ask for a
            change, Claude proposes new premise, characters, identity lock and steers and you click Apply.
          </p>
          <div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gap: 8 }}>
            {chat.map((message, index) => (
              <div key={index} className={`chat-${message.role}`}>
                <strong>{message.role === "user" ? "You" : "Claude"}:</strong> {message.content}
                {message.updates && (
                  <div>
                    <small>Changes: {Object.keys(message.updates).join(", ")}</small>{" "}
                    <button onClick={() => applyUpdates(index, false)} disabled={message.applied}>
                      {message.applied ? "Applied" : "Apply (this session)"}
                    </button>{" "}
                    <button onClick={() => applyUpdates(index, true)} disabled={message.applied}>
                      Apply &amp; save permanently
                    </button>
                  </div>
                )}
              </div>
            ))}
            {chatBusy && <div>Claude is thinking…</div>}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              sendChat(chatInput);
            }}
            style={{ display: "flex", gap: 8 }}
          >
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask anything, or: make this a white family in California"
              style={{ flex: 1, minWidth: 0, width: "auto" }}
            />
            <button type="submit" disabled={chatBusy || !chatInput.trim()}>
              Send
            </button>
          </form>
          <details>
            <summary>Variant change log ({changelog.length})</summary>
            {changelog.length === 0 && <p>No permanent changes yet.</p>}
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {[...changelog].reverse().map((entry) => (
                <div key={entry.at} style={{ marginBottom: 12 }}>
                  <strong>
                    {new Date(entry.at).toLocaleString()} · {entry.action === "reset" ? "reset" : "Claude edit"} ·{" "}
                    {entry.variant}
                  </strong>
                  <div>{entry.request}</div>
                  <small>{entry.changes.map((change) => change.field).join(", ") || "no field changes"}</small>
                </div>
              ))}
            </div>
          </details>
        </section>
          {frameUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={frameUrl} alt="Start frame" style={{ maxWidth: "100%", borderRadius: 8 }} />
          )}
          <p>
            <label>
              3. Variant{" "}
              <select
                value={variant}
                disabled={session.runStarted}
                onChange={(event) => setVariant(event.target.value as VariantKey)}
              >
                {Object.entries(VARIANTS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>
          </p>
          <div style={{ fontSize: 16 }}>
            <p style={{ margin: "4px 0" }}>{VARIANTS[viewVariant].about}</p>
            <details>
              <summary>Show the code for this variant</summary>
              <p style={{ margin: "4px 0" }}>
                <code>{VARIANTS[viewVariant].recipe}</code>
              </p>
              <strong>Kickoff prompt</strong>
              <pre style={{ whiteSpace: "pre-wrap" }}>{kickoffFor(viewVariant, ctxFor(viewVariant))}</pre>
              <strong>Example steer (action = &quot;ACTION&quot;)</strong>
              <pre style={{ whiteSpace: "pre-wrap" }}>{buildPrompt(viewVariant, "ACTION", ctxFor(viewVariant))}</pre>
            </details>
          </div>
        <details open>
          <summary>Run setup</summary>
          <fieldset>
            <legend>Premise &amp; identity ({scene})</legend>
            <label style={{ display: "block" }}>
              Basic premise (the starting scene; sent as the kickoff and used for the start frame)
              <textarea
                rows={3}
                value={ctxs[scene].premise}
                onChange={(event) => editCtx(scene, { premise: event.target.value })}
              />
            </label>
            <label style={{ display: "block" }}>
              Characters (appearance, written once and reused by the variants)
              <textarea
                rows={4}
                value={ctxs[scene].sheet}
                onChange={(event) => editCtx(scene, { sheet: event.target.value })}
              />
            </label>
            <label style={{ display: "block" }}>
              Identity lock (age, ethnicity, skin tone, face, hair kept consistent)
              <textarea
                rows={3}
                value={ctxs[scene].identity}
                onChange={(event) => editCtx(scene, { identity: event.target.value })}
              />
            </label>
            <label style={{ display: "block" }}>
              Art style
              <input
                value={ctxs[scene].style}
                onChange={(event) => editCtx(scene, { style: event.target.value })}
              />
            </label>
            <button onClick={resetScene}>Reset to defaults (saved, logged)</button>
            <p style={{ fontSize: 15, opacity: 0.7 }}>
              Regenerate the start frame after changing the premise, characters or style. The 001a baseline
              ignores the characters and identity on purpose.
            </p>
          </fieldset>
        </details>
          <p>
            <button onClick={startRun} disabled={!canRun}>
              4. Start run
            </button>{" "}
            <button onClick={steer} disabled={!session.runStarted || nextStep >= steps.length}>
              Send next steer {Math.min(nextStep + 1, steps.length)}/{steps.length}
            </button>{" "}
            <button onClick={session.disconnectSession} disabled={!session.connected}>
              End run (disconnect)
            </button>
          </p>
          <p>
            <label>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={autoRecord}
                onChange={(event) => setAutoRecord(event.target.checked)}
              />{" "}
              auto-record
            </label>{" "}
            {recording ? (
              <button onClick={stopRecording}>■ Stop &amp; save recording</button>
            ) : (
              <button onClick={startRecording} disabled={!session.runStarted}>
                ● Record
              </button>
            )}
          </p>
          {(note || session.error) && <p role="alert">{note || session.error}</p>}
      </div>
    </div>
    <section className="qa-bottom">
        <section>
          <label style={{ display: "block", marginTop: 12 }}>
            Overall assessment (what worked, what drifted, what to try next)
            <textarea
              value={assessment}
              onChange={(event) => setAssessment(event.target.value)}
              rows={4}
              style={{ width: "100%" }}
            />
          </label>
          <button onClick={saveRun} disabled={log.length === 0}>
            Save run (log + assessment)
          </button>{" "}
          <button onClick={getAdvice} disabled={log.length === 0 || advising}>
            {advising ? "Asking Claude…" : "Ask Claude for next steers"}
          </button>
          {advice && (
            <div>
              <h4>Suggested steers (click to load into Custom)</h4>
              {advice.suggestions.map((item) => (
                <p key={item.action}>
                  <button
                    onClick={() => {
                      setCustom(buildPrompt(runVariant.current, item.action, ctxFor(runVariant.current)));
                      setPick("custom");
                    }}
                  >
                    Use
                  </button>{" "}
                  {item.action}
                  <br />
                  <small>{item.why}</small>
                </p>
              ))}
              <h4>Avoid</h4>
              <ul>
                {advice.avoid.map((item) => (
                  <li key={item.pattern}>
                    {item.pattern} <small>({item.evidence})</small>
                  </li>
                ))}
              </ul>
              <button onClick={saveFindings}>Save findings doc (what worked / didn&apos;t)</button>
            </div>
          )}
        </section>
    </section>
    </>
  );
}
