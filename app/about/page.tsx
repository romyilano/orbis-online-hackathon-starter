import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Orbis Training",
  description: "A workbench for tuning live steering prompts for Visko Orbis.",
};

export default function AboutPage() {
  return (
    <main className="training about">
      <header>
        <h1>About Orbis Training</h1>
        <p>A workbench for finding out which steering prompts keep a live Orbis stream on track.</p>
        <nav className="about-nav">
          <Link href="/">Open the tool</Link>
        </nav>
      </header>

      <section className="about-card">
        <h2>The problem</h2>
        <p>
          Orbis can be steered with a new text prompt while it streams. A steer that is slightly off can rebuild the
          whole scene, swap a character&apos;s look, or add a duplicate character, and you only find out after the
          stream has changed. Writing good steering prompts is mostly trial and error.
        </p>
      </section>

      <section className="about-card">
        <h2>What it does</h2>
        <ol>
          <li>
            <strong>Start from a premise.</strong> Write a basic scene, the characters, and an identity lock that keeps
            age, ethnicity, skin tone, face and hair consistent.
          </li>
          <li>
            <strong>Pick a method.</strong> Seven variants test different strategies, from sending only the action to
            resending a full character sheet, to the official prompt guide&apos;s build-once approach.
          </li>
          <li>
            <strong>Steer the live stream.</strong> Choose a premade steer or edit any prompt, down to the exact text
            sent to Orbis. A linter warns when a steer breaks the guide&apos;s rules.
          </li>
          <li>
            <strong>Get every steer judged.</strong> A few seconds after each steer, Claude looks at a frame from the
            stream and returns pass or fail, a rating for each character, whether the scene was rebuilt, and a reason.
            You can override it or rate by hand.
          </li>
          <li>
            <strong>Learn from the run.</strong> Write an assessment, save the run, and ask Claude for new steers, a
            list of patterns to avoid, and a findings document. Every run is recorded and can be replayed.
          </li>
        </ol>
      </section>

      <section className="about-card">
        <h2>What we found so far</h2>
        <ul>
          <li>
            Restating the style, the character sheet and &quot;same characters as the previous moment&quot; in every
            steer was the most stable: 5 of 6 steers, against 2 of 6 for delta-only or sheet-only.
          </li>
          <li>
            The official prompt guide recommends the opposite: build the world once, then one action per steer. That
            approach has not been scored yet, and settling it is what the tool is for.
          </li>
          <li>
            A steer that introduces an object and has a character use it at the same moment looked like the cause of a
            duplicate character. The kitchen variant that splits it in two has no verdict yet.
          </li>
        </ul>
        <p>These are small samples scored by hand early on, not benchmarks.</p>
      </section>

      <section className="about-card">
        <h2>Why real time matters here</h2>
        <p>
          The point is the loop. You steer, see the result within seconds, and learn why it worked or failed, while the
          stream is still running. A generate-then-watch workflow would hide exactly the failures this tool exists to
          catch.
        </p>
      </section>

      <section className="about-card">
        <h2>Built with</h2>
        <ul>
          <li>Visko Orbis Stable through Reactor, streamed over WebRTC</li>
          <li>Claude for the frame judge, the next-steer suggestions and the chat</li>
          <li>Nano Banana (Gemini) for the start frame</li>
          <li>Next.js and React</li>
        </ul>
        <p>
          Made by Romy for the Orbis Online Challenge, September 2026. It is a development tool: saving runs and
          recordings writes to disk, so those features only work when running locally.
        </p>
      </section>
    </main>
  );
}
