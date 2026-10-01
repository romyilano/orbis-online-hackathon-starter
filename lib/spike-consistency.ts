// Spike 001: character consistency while steering. Throwaway, hardcoded.
export const SHEET =
  "Characters (must look identical in every frame): Nell, an 8-year-old girl with two long red braids, freckles, a bright yellow raincoat and green rubber boots. Grandpa Walt, a tall man with a gray handlebar mustache, brown flat cap, round wire glasses and blue denim overalls.";
export const STYLE =
  "1950s hand-inked storybook illustration, muted watercolor, thick brown ink outlines, paper texture, steady camera.";
export const KICKOFF = "Nell and Grandpa Walt stand on a muddy farm lane after rain, smiling.";
export const STEPS = [
  "Nell jumps into a puddle and splashes.",
  "Grandpa Walt opens a red barn door.",
  "A brown cow walks out and Nell pats it.",
  "They walk toward a tractor as the sun sets.",
  "Grandpa Walt lifts Nell onto the tractor seat.",
  "Fireflies appear as they sit on the porch steps.",
];

// 003: official prompt-guide approach. World built once in the initial
// prompt (WHO/WHAT/WHERE + camera, <100 words), then one action per steer
// with no restating of style or characters.
export const KICKOFF_003 =
  "1950s hand-inked storybook illustration with thick brown ink outlines, muted watercolor and visible paper texture. Nell, an 8-year-old girl with two long red braids, freckles, a bright yellow raincoat and green rubber boots, stands beside her grandfather Walt, a tall man with a gray handlebar mustache, brown flat cap, round wire glasses and blue denim overalls, on a muddy farm lane after rain, a red barn behind them. Medium wide shot, eye level, static camera, deep depth of field.";
export const STEPS_003 = [
  "The girl stomps into a puddle and water splashes up around her boots.",
  "The grandfather walks to the barn and pulls the red door open.",
  "A brown cow walks out of the barn doorway.",
  "The girl reaches up and pats the cow's nose.",
  "The light warms to late afternoon and long shadows stretch across the lane.",
  "An old red tractor is visible at the edge of the field beyond the barn.",
  "They walk toward the tractor.",
  "The grandfather lifts the girl onto the tractor seat.",
];

// Spike 002 (kitchen): product-shaped scene. Findings from 001 applied: always
// use the 001c wrapper (style lock + sheet + "same characters"), keep steers to
// one small change each, and never combine "a new object appears" with a
// character interacting with it in the same steer. The two characters use the
// same log slots as the farm scene (`nell` = first character, `walt` = second).
export const KITCHEN_STYLE =
  "1950s hand-inked storybook illustration, muted watercolor, thick brown ink outlines, paper texture, steady camera.";
export const KITCHEN_SHEET =
  "Characters (must look identical in every frame): Rosa, an 8-year-old girl with a short black bob, a red hair ribbon, a yellow dress and a blue checkered apron. Mama, a woman with black hair in a bun, a green polka-dot dress, a white apron and rolled-up sleeves.";
export const KITCHEN_KICKOFF =
  "Rosa and Mama in a cozy village kitchen in the morning: a wooden table with dough and a rolling pin, a cast-iron stove with a steaming pot and a copper kettle, a window with lace curtains, a shelf of glass jars.";
// k1: every steer changes something already in the opening frame.
export const KITCHEN_STEPS_FURNISHED = [
  "Rosa rolls the dough flat with the rolling pin.",
  "Mama stirs the pot on the stove and steam rises.",
  "The copper kettle starts to whistle and Mama lifts it.",
  "Warm morning light brightens through the lace curtains.",
  "Rosa tastes a spoonful from the pot and smiles.",
];
// k2: new things appear one per steer, then a character uses them in the next.
export const KITCHEN_STEPS_INTRODUCE = [
  "A basket of red tomatoes sits at the end of the table.",
  "Rosa carries the basket of tomatoes over to Mama.",
  "A black-and-white cat is curled up beside the stove.",
  "Rosa kneels down and strokes the cat.",
  "Soft snow begins to fall outside the window.",
];

export const SCENES = {
  farm: { labels: ["Nell", "Walt"] },
  kitchen: { labels: ["Rosa", "Mama"] },
} as const;
export type SceneKey = keyof typeof SCENES;

export const VARIANTS = {
  "001a-delta": {
    label: "001a delta only",
    image: true,
    scene: "farm",
    about:
      "Baseline. Each steer is only the action, with no style or character text. Tests whether the model remembers the characters on its own. Result so far: 2/6 stable.",
    recipe: "steer = action",
  },
  "001b-sheet": {
    label: "001b full sheet every steer",
    image: true,
    scene: "farm",
    about:
      "Resends the written character sheet (hair, clothes, props) in every steer, then the action. Tests whether restating appearance anchors the characters. Result so far: 2/6 stable.",
    recipe: "steer = SHEET + IDENTITY + action",
  },
  "001c-sheet-style": {
    label: "001c sheet + style lock + 'same characters'",
    image: true,
    scene: "farm",
    about:
      "Heaviest anchoring: art-style lock, the character sheet, and an explicit 'same characters as the previous moment' line before every action. Best result so far: 5/6 stable. The official prompt guide warns this can read as a scene rebuild.",
    recipe: "steer = STYLE + SHEET + IDENTITY + 'Same characters as the previous moment, appearance unchanged.' + action",
  },
  "002-no-frame": {
    label: "002 sheet + style, NO start frame",
    image: false,
    scene: "farm",
    about:
      "Same wrapper as 001c, but the run starts from text alone with no Nano Banana start frame. Control: does the start image help consistency at all? Once produced a duplicate Nell.",
    recipe: "steer = STYLE + SHEET + IDENTITY + 'Same characters…' + action  (no start image)",
  },
  "003-build-once-delta": {
    label: "003 guide: build once, then one action per steer",
    image: true,
    scene: "farm",
    about:
      "Follows the official prompt guide. The kickoff prompt builds the whole world once (style, appearance, setting, camera, under 100 words). After that every steer is a single action that refers to people as 'the girl' and 'the grandfather', with no restating.",
    recipe: "kickoff = STYLE + SHEET + IDENTITY + PREMISE + camera (built once); steer = one action only",
  },
  "k1-furnished": {
    label: "K1 kitchen: props in the frame, steers change existing things",
    image: true,
    scene: "kitchen",
    about:
      "Product-shaped kitchen scene using the 001c wrapper. Every prop already exists in the start frame, so each steer only changes something that is already visible.",
    recipe: "steer = STYLE + SHEET + IDENTITY + 'Same characters…' + action (existing things only)",
  },
  "k2-introduce-then-act": {
    label: "K2 kitchen: introduce an object, then act on it next steer",
    image: true,
    scene: "kitchen",
    about:
      "Same kitchen wrapper, but new objects (tomatoes, a cat, snow) appear in one steer and a character uses them in the next. Never both in one steer, since a combined steer caused a duplicate Nell.",
    recipe: "steer = STYLE + SHEET + IDENTITY + 'Same characters…' + action (introduce one steer, act on it the next)",
  },
} as const;
export type VariantKey = keyof typeof VARIANTS;

export function stepsFor(variant: VariantKey) {
  switch (variant) {
    case "003-build-once-delta":
      return STEPS_003;
    case "k1-furnished":
      return KITCHEN_STEPS_FURNISHED;
    case "k2-introduce-then-act":
      return KITCHEN_STEPS_INTRODUCE;
    default:
      return STEPS;
  }
}

// Editable context: the user starts from a basic premise and an identity lock,
// and every variant builds its prompts from these instead of hardcoded text.
export type Ctx = { style: string; sheet: string; identity: string; premise: string };

export const DEFAULT_IDENTITY =
  "Keep every person's age, ethnicity, skin tone, face shape and hair identical in every frame; never change who they are.";

export function defaultCtx(scene: SceneKey): Ctx {
  return scene === "kitchen"
    ? { style: KITCHEN_STYLE, sheet: KITCHEN_SHEET, identity: DEFAULT_IDENTITY, premise: KITCHEN_KICKOFF }
    : { style: STYLE, sheet: SHEET, identity: DEFAULT_IDENTITY, premise: KICKOFF };
}

const sameCtx = (a: Ctx, b: Ctx) =>
  a.style === b.style && a.sheet === b.sheet && a.identity === b.identity && a.premise === b.premise;

export function kickoffFor(variant: VariantKey, ctx?: Ctx) {
  const scene = VARIANTS[variant].scene;
  const c = ctx ?? defaultCtx(scene);
  if (variant === "003-build-once-delta") {
    if (sameCtx(c, defaultCtx(scene))) return KICKOFF_003;
    // Guide approach: build the whole world once, under ~100 words, then steer with actions only.
    return `${c.style} ${c.sheet.replace(/^Characters \(must look identical in every frame\): /, "")} ${c.identity} ${c.premise} Medium wide shot, eye level, static camera.`;
  }
  return buildPrompt(variant, c.premise, c);
}

export function buildPrompt(variant: VariantKey, action: string, ctx?: Ctx) {
  const c = ctx ?? defaultCtx(VARIANTS[variant].scene);
  switch (variant) {
    case "001a-delta":
    case "003-build-once-delta":
      return action;
    case "001b-sheet":
      return `${c.sheet} ${c.identity} ${action}`;
    default:
      return `${c.style} ${c.sheet} ${c.identity} Same characters as the previous moment, appearance unchanged. ${action}`;
  }
}

export function frameFor(scene: SceneKey, ctx?: Ctx) {
  const c = ctx ?? defaultCtx(scene);
  return `${c.style} ${c.sheet} ${c.identity} ${c.premise} 16:9 composition, all characters full body.`;
}

export function sheetFor(scene: SceneKey) {
  return scene === "kitchen" ? KITCHEN_SHEET : SHEET;
}

// Cheap client-side linter for the official prompt-guide rules (no API call).
export function lintSteer(prompt: string, variant: VariantKey): string[] {
  const warnings: string[] = [];
  const action = prompt.split("appearance unchanged.").pop() ?? prompt;
  if (VARIANTS[variant].label.includes("build once") || variant === "001a-delta") {
    if (/Characters \(must|1950s|storybook illustration/i.test(prompt)) {
      warnings.push("Restates style or characters: the guide says this can read as a scene rebuild.");
    }
  }
  const sentences = action.split(/[.!?]\s+/).filter((s) => s.trim().length > 2).length;
  if (sentences > 1 || / and (then )?[a-z]+s? /i.test(action)) {
    warnings.push("Looks like more than one action: the guide says one action per steer.");
  }
  if (/\b(appears?|walks? out|enters?)\b/i.test(action) && /\b(pats?|strokes?|lifts?|picks?|holds?)\b/i.test(action)) {
    warnings.push("Introduces a subject and interacts with it in the same steer: split into two.");
  }
  return warnings;
}
