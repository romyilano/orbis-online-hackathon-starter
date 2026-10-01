# Orbis Training: a workbench for tuning live steering prompts

Entry for the Orbis Online Challenge (September 2026). Built on the Orbis hackathon starter (kept below).

**The idea: a personal training tool for getting better at video prompting, with QA built in.**
Orbis can be steered with `set_prompt` while it streams, but a steer that is slightly wrong rebuilds the scene or
duplicates a character, and you only find out after the stream has changed. Orbis Training is a practice loop:
write a steer, send it to the live stream, and see right away whether it worked. Every steer is QA'd by Claude
(pass or fail, per-character consistency, scene rebuilds) and by you (override the verdict, add notes), and each run
ends with findings on what worked, what to avoid and what to try next. Real-time responsiveness is the point:
the feedback arrives while the stream is still running, so you learn the prompt-to-result relationship fast.

Orbis Training is the main page (`/`). The original starter demo is still at `/orbis-sample`.

## How it works

1. **Start from a premise and an identity lock.** Write a basic premise (the starting scene) and the characters, plus
   an identity lock that keeps each person's age, ethnicity, skin tone, face and hair consistent. These are editable
   under "Run setup" and feed the start frame, the kickoff prompt, every steer and the judge.
2. **Pick a method.** Seven variants test different steering strategies (delta-only, full character sheet every
   steer, style lock plus sheet, no start frame, the official prompt guide's build-once approach, and two kitchen
   scenes). Each one shows a description and the exact prompts it builds.
3. **Steer the live stream.** Choose a premade steer or edit any of them, including the final wrapped text sent to
   Orbis. A linter warns about guide violations (restating style or characters, more than one action, introducing a
   subject and acting on it in one steer).
4. **Get each steer judged.** About 6 seconds after a steer, the page grabs a frame and sends it, with the previous
   frame and the character sheet, to Claude (`/api/judge`). The QA feed beside the video, newest first, shows the
   frame, pass or fail, a rating for each character (same, drift, mutated, bleed, duplicate), a scene-rebuild flag
   and a one-line reason. You can override the verdict or rate each character yourself, with a note.
5. **Learn from the run.** Write an overall assessment and save the run. "Ask Claude for next steers" returns four
   different suggested steers, a list of patterns to avoid, and a findings document of what worked and what did not.
   Click a suggestion to load it and send it.
6. **Replay.** Every run is recorded to `recordings/` and appears in a Recordings panel with replay, also after a
   reload.

In development, saved runs and findings are written to `.planning/spikes/runs/` (created on first save; not included
in this repo), so later sessions (human or Claude) can read them.

## What we found so far

Early results, from a small number of runs rated by hand:

- Restating the style lock, the character sheet and "same characters as the previous moment" in every steer was
  the most stable (5/6), against 2/6 for delta-only or sheet-only.
- The official prompt guide recommends the opposite (build the world once, then one action per steer). That
  approach (variant 003) has logs but no verdict yet. The tool exists to settle questions like this one.
- A steer that introduces a new object and has a character interact with it at the same time looked like the cause
  of a duplicate character. The kitchen variant K2 splits it into two steers to test that; it has no verdict yet.

These are small samples, not benchmarks.

## Setup for this tool

Add one more key to `.env.local`:

```dotenv
ANTHROPIC_API_KEY=your_anthropic_api_key
```

Without it the judge and the suggestions return an error; the rest of the page still works. Recording, replay and
saving runs only work in development (`npm run dev`), because they write to disk.

## Where things are

- `components/spike/consistency-spike.tsx`: the page (video, QA feed, prompt picker, recordings)
- `lib/spike-consistency.ts`: the variants, their prompts and the linter
- `app/api/judge/route.ts`: Claude vision judge for one steer
- `app/api/suggest/route.ts`: next-steer suggestions, avoid list and findings document
- `app/api/save-recording/route.ts`: saves, lists and serves recordings and run logs (dev only)
- `app/api/spike-frame/route.ts`: Nano Banana start frame for a scene

## Next step

Feed every saved run in `.planning/spikes/runs/` (written locally in dev) back into `/api/suggest`, so the suggested steers improve across
runs and not just within one.

---

# Orbis hackathon starter

A minimal Next.js example for the public Reactor-hosted Visko Orbis Stable API.
It demonstrates server-side token minting, WebRTC video and audio, text-to-video,
optional image-to-video, live prompt steering, delivery resolution, pause,
resume, and a foldable Nano Banana-to-Orbis livestreaming example.

## Requirements

- Node.js 20.9 or newer
- A Reactor API key with access to Visko Orbis Stable
- A Google Gemini API key with access to Nano Banana

## Run locally

```bash
cp .env.example .env.local
# Add your Reactor API key to .env.local.
npm install
npm run dev
```

Open <http://localhost:3000>.

`npm run dev` starts Next.js through a small session-cleanup wrapper. While in
development, sessions created by this starter are recorded in the gitignored
`.reactor-dev-sessions.json` file. It contains session IDs and metadata, but no
API keys or JWTs. The wrapper uses the server-only `REACTOR_API_KEY` to delete
recorded sessions before startup and again on `Ctrl+C`/`SIGTERM`, so restarting
the dev server cannot silently leave a previous Orbis session consuming
capacity. If a startup sweep cannot delete a recorded session, the wrapper
refuses to start another dev server and reports the session ID.

Set both keys in `.env.local`:

```dotenv
REACTOR_API_KEY=your_reactor_api_key
GEMINI_API_KEY=your_gemini_api_key
```

Keep both keys server-side. The browser receives only the short-lived Reactor
JWT and the image returned by the Nano Banana route.

## Nano Banana kickoff example

Connect to Orbis, expand **Livestreaming example**, and click
**Edit and start stream**. The bundled `dog.png` is displayed as the source
image. The server sends it with the displayed image-editing prompt to
`gemini-2.5-flash-image`. Gemini then analyzes the edited image with the user
prompt and returns a plain-text, image-grounded prompt. The
edited output is previewed, uploaded as the Orbis start image, and used with
that grounded prompt to begin the stream.

The two starting prompts are exported from `lib/nano-banana.ts`.
`NANO_BANANA_PROMPT` controls the image edit, while `ORBIS_KICKOFF_PROMPT`
describes the requested motion. The final Gemini-grounded prompt is displayed
before it is sent to Orbis.

## API flow

1. `POST /api/token` requests a scoped session JWT from
   `https://api.reactor.inc/tokens`.
2. `ReactorProvider` connects to `reactor/visko-orbis-stable` with the
   recv-only `main_video` and `main_audio` tracks.
3. The model sends a `state` snapshot. Its `state.available_resolutions` list
   replaces the starter's initial documented resolution choices.
4. If supplied, the reference image is uploaded and passed to `set_image`
   before `start`.
5. If selected, `set_resolution` stages a delivery tier for the next `start`.
   Omitting it keeps the model's current setting; the documented default is
   `2k`.
6. `set_prompt` supplies the required prompt, then `start` begins generation.
7. Sending another `set_prompt` while running steers the video at the next
   chunk boundary.

## Documented model behavior

- A prompt is required before `start`; the reference image is optional.
- A 16:9 reference image works best. Other aspect ratios are resized without
  cropping and may appear distorted.
- The starter initially shows the currently documented `1080p`, `2k`, and `4k`
  tiers. After connection, treat `state.available_resolutions` as authoritative
  and send the selected value exactly as given.
- `set_resolution` applies from the next `start`, not during the active run.
- Orbis emits chunks about every 1.8 seconds. The first chunk emits no frames
  while the upscaler primes; this is expected.
- Commands are asynchronous. Use model events such as `state`,
  `prompt_accepted`, `resolution_accepted`, `generation_started`,
  `chunk_complete`, and `command_error` as the source of truth.
- `pause` takes effect after the current chunk. `resume` continues the same
  generation, and `reset` clears the current prompt and image.

## Project files

- `app/api/token/route.ts` performs the server-side token exchange.
- `app/api/session-cleanup/route.ts` performs best-effort session deletion when
  the browser page exits.
- `app/api/session-registry/route.ts` records verified development sessions for
  startup and shutdown cleanup.
- `scripts/dev-with-session-cleanup.mjs` wraps `next dev` with the development
  cleanup sweeps.
- `app/api/nano-banana/route.ts` performs the server-side image edit.
- `app/api/orbis-prompt/route.ts` creates the image-grounded video prompt.
- `components/orbis-demo.tsx` composes the provider, player, controls, and demo.
- `components/orbis-player.tsx` renders the streamed video and audio.
- `components/orbis-controls.tsx` renders the session controls.
- `components/nano-banana-example.tsx` owns the kickoff example and source image.
- `hooks/use-orbis-session.ts` contains the reusable Orbis command sequence and
  session state.
- `dog.png` is the Nano Banana source image.
- `lib/orbis.ts` contains the public model configuration and message helpers.
- `lib/orbis-prompt.ts` contains the plain-text Gemini grounding instruction.
- `lib/nano-banana.ts` contains the model and kickoff prompt.
- `.env.example` documents the required environment variables.

For the complete command parameters, message schemas, tracks, and current model
behavior, use the public Reactor documentation:

- [Visko Orbis Stable API](https://www.reactor.inc/models/visko-orbis-stable/api)
- [Visko Orbis Dynamic API](https://www.reactor.inc/models/visko-orbis-dynamic/api)
- [Gemini image generation and editing](https://ai.google.dev/gemini-api/docs/image-generation)
