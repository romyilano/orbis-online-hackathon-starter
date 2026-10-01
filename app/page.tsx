import Link from "next/link";

import { ConsistencySpike } from "@/components/spike/consistency-spike";

export default function Page() {
  return (
    <main className="training">
      <header>
        <h1>Orbis Training</h1>
        <p>Hone steering prompts: pick a method, steer the live stream, and get each result judged.</p>
        <nav className="about-nav">
          <Link href="/about">About</Link>
        </nav>
        <div id="header-controls" />
      </header>
      <ConsistencySpike />
    </main>
  );
}
