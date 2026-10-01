# Orbis Training: how do we train the humans to use Orbis properly?

Entry for the Orbis Online Challenge (September 2026). Built on the Orbis hackathon starter.

## Problem

As a human I am not always using Orbis properly for the best results. Sometimes it's hit or miss.

In this example, I got a very good result but I'm still getting used to doing the steering properly.
I also want to use LLMs to train me to handle steering better or even modify my steering for me.

I want to continue to use Orbis long term effectively.


**The question: how do we train the humans to use Orbis properly?**
Orbis can be steered with `set_prompt` while it streams, but steering live is a skill. A steer that is slightly wrong
rebuilds the scene or duplicates a character, and you only find out after the stream has changed. Most people learn this
by trial and error, with no feedback on why a prompt failed.

**The answer: a practice loop with QA built in.** Orbis Training is a personal trainer for video prompting. Write a
steer, send it to the live stream, and see right away whether it worked. Every steer is QA'd by Claude (pass or fail,
per-character consistency, scene rebuilds) and by you (override the verdict, add notes), and each run ends with
findings on what worked, what to avoid and what to try next. Real-time responsiveness is the point: the feedback
arrives while the stream is still running, so people learn the prompt-to-result relationship fast, and the
tool's own linter and the official prompt guide's rules are taught at the moment of the mistake.

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

## Run it locally

Requires Node.js 20.9 or newer and three API keys:

| Key | Used for | Needed? |
| --- | --- | --- |
| `REACTOR_API_KEY` | Streaming Visko Orbis Stable (token minting, dev session cleanup). Must have access to the model. | Required |
| `GEMINI_API_KEY` | Nano Banana start frames and the starter's image-grounded kickoff prompt. | Required for start frames |
| `ANTHROPIC_API_KEY` | Claude QA judge (`/api/judge`), next-steer suggestions (`/api/suggest`) and the assistant (`/api/assist`). | Required for QA and suggestions |

```bash
cp .env.example .env.local
# fill in the three keys in .env.local
npm install
npm run dev
```

Open <http://localhost:3000>. Keep all keys server-side; the browser only receives a short-lived Reactor JWT.

Notes:

- Use `npm run dev`, not `next dev`. It wraps Next.js and deletes any Orbis sessions left over from a previous run, on
  startup and on `Ctrl+C`, so an old session can't keep consuming capacity. Session IDs are tracked in the gitignored
  `.reactor-dev-sessions.json` (no keys or JWTs). If a stale session can't be deleted, it refuses to start and prints the ID.
- Without `ANTHROPIC_API_KEY` the judge and suggestions return an error; the rest of the page still works.
- Recording, replay and saving runs only work in development, because they write to disk.
- Production build: `npm run build && npm start`.

## Where things are

- `components/spike/consistency-spike.tsx`: the page (video, QA feed, prompt picker, recordings)
- `lib/spike-consistency.ts`: the variants, their prompts and the linter
- `app/api/judge/route.ts`: Claude vision judge for one steer
- `app/api/suggest/route.ts`: next-steer suggestions, avoid list and findings document
- `app/api/assist/route.ts`: Claude assistant
- `app/api/save-recording/route.ts`: saves, lists and serves recordings and run logs (dev only)
- `app/api/spike-frame/route.ts`: Nano Banana start frame for a scene
- `app/api/token/route.ts`: server-side Reactor token exchange
- `hooks/use-orbis-session.ts`: Orbis command sequence and session state
- `components/orbis-demo.tsx` and `lib/orbis.ts`: the original starter demo at `/orbis-sample`

## Next step

Feed every saved run in `.planning/spikes/runs/` (written locally in dev) back into `/api/suggest`, so the suggested
steers improve across runs and not just within one.

## Orbis docs

- [Visko Orbis Stable API](https://www.reactor.inc/models/visko-orbis-stable/api)
- [Visko Orbis Dynamic API](https://www.reactor.inc/models/visko-orbis-dynamic/api)
- [Gemini image generation and editing](https://ai.google.dev/gemini-api/docs/image-generation)
