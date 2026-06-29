// ============================================================================
// Visual Graphplan Solver — demo problems
//
// Small, hand-checked propositional domains. The engine is positive-STRIPS
// (no negative preconditions); complementary states are modeled with explicit
// literals + delete effects (e.g. "have-cake" / "no-cake").
// ============================================================================

import type { Action, Problem } from "./types";

function lits(...ids: string[]) {
  return ids.map((id) => ({ id, name: id }));
}

// --- Gripper (simplified): 1 ball, 2 rooms, 1 gripper ----------------------
export const gripper: Problem = {
  id: "gripper",
  name: "Gripper (semplificato)",
  description:
    "Un robot in stanza A deve portare una pallina in stanza B. Soluzione attesa: pick-A → move-A-B → drop-B.",
  literals: lits(
    "robot-A",
    "robot-B",
    "ball-A",
    "ball-B",
    "ball-held",
    "free",
  ),
  actions: [
    { id: "move-AB", name: "move A→B", preconditions: ["robot-A"], addEffects: ["robot-B"], delEffects: ["robot-A"], isNoOp: false },
    { id: "move-BA", name: "move B→A", preconditions: ["robot-B"], addEffects: ["robot-A"], delEffects: ["robot-B"], isNoOp: false },
    { id: "pick-A", name: "pick @A", preconditions: ["robot-A", "ball-A", "free"], addEffects: ["ball-held"], delEffects: ["ball-A", "free"], isNoOp: false },
    { id: "pick-B", name: "pick @B", preconditions: ["robot-B", "ball-B", "free"], addEffects: ["ball-held"], delEffects: ["ball-B", "free"], isNoOp: false },
    { id: "drop-A", name: "drop @A", preconditions: ["robot-A", "ball-held"], addEffects: ["ball-A", "free"], delEffects: ["ball-held"], isNoOp: false },
    { id: "drop-B", name: "drop @B", preconditions: ["robot-B", "ball-held"], addEffects: ["ball-B", "free"], delEffects: ["ball-held"], isNoOp: false },
  ],
  init: ["robot-A", "ball-A", "free"],
  goals: ["ball-B"],
};

// --- Blocksworld (simplified): 2 blocks A,B ---------------------------------
export const blocksworld: Problem = {
  id: "blocks",
  name: "Blocksworld (2 blocchi)",
  description:
    "Due blocchi A,B sul tavolo; obiettivo: A sopra B. Soluzione attesa: pickup-A → stack-A-B.",
  literals: lits(
    "on-AB",
    "on-BA",
    "table-A",
    "table-B",
    "clear-A",
    "clear-B",
    "hand-empty",
    "hold-A",
    "hold-B",
  ),
  actions: [
    { id: "pickup-A", name: "pickup A", preconditions: ["clear-A", "table-A", "hand-empty"], addEffects: ["hold-A"], delEffects: ["table-A", "clear-A", "hand-empty"], isNoOp: false },
    { id: "pickup-B", name: "pickup B", preconditions: ["clear-B", "table-B", "hand-empty"], addEffects: ["hold-B"], delEffects: ["table-B", "clear-B", "hand-empty"], isNoOp: false },
    { id: "putdown-A", name: "putdown A", preconditions: ["hold-A"], addEffects: ["table-A", "clear-A", "hand-empty"], delEffects: ["hold-A"], isNoOp: false },
    { id: "putdown-B", name: "putdown B", preconditions: ["hold-B"], addEffects: ["table-B", "clear-B", "hand-empty"], delEffects: ["hold-B"], isNoOp: false },
    { id: "stack-AB", name: "stack A on B", preconditions: ["hold-A", "clear-B"], addEffects: ["on-AB", "clear-A", "hand-empty"], delEffects: ["hold-A", "clear-B"], isNoOp: false },
    { id: "stack-BA", name: "stack B on A", preconditions: ["hold-B", "clear-A"], addEffects: ["on-BA", "clear-B", "hand-empty"], delEffects: ["hold-B", "clear-A"], isNoOp: false },
    { id: "unstack-AB", name: "unstack A/B", preconditions: ["on-AB", "clear-A", "hand-empty"], addEffects: ["hold-A", "clear-B"], delEffects: ["on-AB", "clear-A", "hand-empty"], isNoOp: false },
    { id: "unstack-BA", name: "unstack B/A", preconditions: ["on-BA", "clear-B", "hand-empty"], addEffects: ["hold-B", "clear-A"], delEffects: ["on-BA", "clear-B", "hand-empty"], isNoOp: false },
  ],
  init: ["table-A", "table-B", "clear-A", "clear-B", "hand-empty"],
  goals: ["on-AB"],
};

// --- Cake: classic "have cake AND eat it" -----------------------------------
// Goals are present but MUTEX at S1, then become extractable at S2.
export const cake: Problem = {
  id: "cake",
  name: "Have Cake & Eat It",
  description:
    "Esempio classico (Russell & Norvig). I goal sono presenti ma mutex a S1, poi estraibili a S2 dopo aver ri-cucinato.",
  literals: lits("have-cake", "eaten-cake", "no-cake"),
  actions: [
    { id: "eat", name: "eat cake", preconditions: ["have-cake"], addEffects: ["eaten-cake", "no-cake"], delEffects: ["have-cake"], isNoOp: false },
    { id: "bake", name: "bake cake", preconditions: ["no-cake"], addEffects: ["have-cake"], delEffects: ["no-cake"], isNoOp: false },
  ],
  init: ["have-cake"],
  goals: ["have-cake", "eaten-cake"],
};

// --- Vault: unsolvable, levels off immediately ------------------------------
export const vault: Problem = {
  id: "vault",
  name: "Vault (irrisolvibile)",
  description:
    "Manca la chiave: nessuna azione è applicabile e il tesoro non è mai raggiungibile. Il grafo si livella subito → problema irrisolvibile.",
  literals: lits("door-closed", "door-open", "key", "treasure"),
  actions: [
    { id: "open", name: "open vault", preconditions: ["door-closed", "key"], addEffects: ["door-open"], delEffects: ["door-closed"], isNoOp: false },
    { id: "grab", name: "grab treasure", preconditions: ["door-open"], addEffects: ["treasure"], delEffects: [], isNoOp: false },
  ],
  init: ["door-closed"],
  goals: ["treasure"],
};

// --- Rocket / Logistics: showcases PARALLEL actions in one level ------------
export const rocket: Problem = {
  id: "rocket",
  name: "Rocket (azioni parallele)",
  description:
    "Due pacchi da A a B con un razzo monouso. Mostra azioni parallele: carica entrambi (A0), vola (A1), scarica entrambi (A2).",
  literals: lits(
    "rocket-A",
    "rocket-B",
    "p1-A",
    "p1-B",
    "p1-in",
    "p2-A",
    "p2-B",
    "p2-in",
    "fuel",
  ),
  actions: [
    { id: "load-p1", name: "load p1 @A", preconditions: ["p1-A", "rocket-A"], addEffects: ["p1-in"], delEffects: ["p1-A"], isNoOp: false },
    { id: "load-p2", name: "load p2 @A", preconditions: ["p2-A", "rocket-A"], addEffects: ["p2-in"], delEffects: ["p2-A"], isNoOp: false },
    { id: "fly", name: "fly A→B", preconditions: ["rocket-A", "fuel"], addEffects: ["rocket-B"], delEffects: ["rocket-A", "fuel"], isNoOp: false },
    { id: "unload-p1", name: "unload p1 @B", preconditions: ["p1-in", "rocket-B"], addEffects: ["p1-B"], delEffects: ["p1-in"], isNoOp: false },
    { id: "unload-p2", name: "unload p2 @B", preconditions: ["p2-in", "rocket-B"], addEffects: ["p2-B"], delEffects: ["p2-in"], isNoOp: false },
  ],
  init: ["rocket-A", "p1-A", "p2-A", "fuel"],
  goals: ["p1-B", "p2-B"],
};

// --- Spare Tire: classic Russell & Norvig Graphplan example -----------------
export const spareTire: Problem = {
  id: "spare",
  name: "Spare Tire",
  description:
    "Esempio classico (Russell & Norvig): montare la ruota di scorta. Soluzione: remove-spare ∥ remove-flat → put-on-spare.",
  literals: lits(
    "flat-on-axle",
    "spare-in-trunk",
    "spare-on-ground",
    "flat-on-ground",
    "axle-free",
    "spare-on-axle",
  ),
  actions: [
    { id: "remove-spare", name: "remove spare", preconditions: ["spare-in-trunk"], addEffects: ["spare-on-ground"], delEffects: ["spare-in-trunk"], isNoOp: false },
    { id: "remove-flat", name: "remove flat", preconditions: ["flat-on-axle"], addEffects: ["flat-on-ground", "axle-free"], delEffects: ["flat-on-axle"], isNoOp: false },
    { id: "put-on-spare", name: "put on spare", preconditions: ["spare-on-ground", "axle-free"], addEffects: ["spare-on-axle"], delEffects: ["spare-on-ground", "axle-free"], isNoOp: false },
  ],
  init: ["flat-on-axle", "spare-in-trunk"],
  goals: ["spare-on-axle"],
};

// --- Sussman Anomaly: the famous 3-block goal-interaction problem ------------
function blockActions(): Action[] {
  const blocks = ["A", "B", "C"];
  const acts: Action[] = [];
  for (const x of blocks) {
    acts.push({ id: `pickup-${x}`, name: `pickup ${x}`, preconditions: [`clear-${x}`, `table-${x}`, "hand-empty"], addEffects: [`hold-${x}`], delEffects: [`table-${x}`, `clear-${x}`, "hand-empty"], isNoOp: false });
    acts.push({ id: `putdown-${x}`, name: `putdown ${x}`, preconditions: [`hold-${x}`], addEffects: [`table-${x}`, `clear-${x}`, "hand-empty"], delEffects: [`hold-${x}`], isNoOp: false });
    for (const y of blocks) {
      if (x === y) continue;
      acts.push({ id: `stack-${x}${y}`, name: `stack ${x}/${y}`, preconditions: [`hold-${x}`, `clear-${y}`], addEffects: [`on-${x}${y}`, `clear-${x}`, "hand-empty"], delEffects: [`hold-${x}`, `clear-${y}`], isNoOp: false });
      acts.push({ id: `unstack-${x}${y}`, name: `unstack ${x}/${y}`, preconditions: [`on-${x}${y}`, `clear-${x}`, "hand-empty"], addEffects: [`hold-${x}`, `clear-${y}`], delEffects: [`on-${x}${y}`, `clear-${x}`, "hand-empty"], isNoOp: false });
    }
  }
  return acts;
}

export const sussman: Problem = {
  id: "sussman",
  name: "Sussman Anomaly (3 blocchi)",
  description:
    "Anomalia classica: C su A, B sul tavolo. Goal A-su-B e B-su-C. I due sottobiettivi interferiscono: non si possono raggiungere indipendentemente.",
  literals: lits(
    "on-AB", "on-AC", "on-BA", "on-BC", "on-CA", "on-CB",
    "table-A", "table-B", "table-C",
    "clear-A", "clear-B", "clear-C",
    "hold-A", "hold-B", "hold-C",
    "hand-empty",
  ),
  actions: blockActions(),
  init: ["on-CA", "table-A", "table-B", "clear-C", "clear-B", "hand-empty"],
  goals: ["on-AB", "on-BC"],
};

// --- Monkey & Bananas: textbook AI planning problem -------------------------
function monkeyActions(): Action[] {
  const pos = ["A", "B", "C"];
  const acts: Action[] = [];
  for (const x of pos) {
    for (const y of pos) {
      if (x === y) continue;
      acts.push({ id: `go-${x}${y}`, name: `go ${x}→${y}`, preconditions: [`monkey-${x}`, "on-floor"], addEffects: [`monkey-${y}`], delEffects: [`monkey-${x}`], isNoOp: false });
      acts.push({ id: `push-${x}${y}`, name: `push box ${x}→${y}`, preconditions: [`monkey-${x}`, `box-${x}`, "on-floor"], addEffects: [`monkey-${y}`, `box-${y}`], delEffects: [`monkey-${x}`, `box-${x}`], isNoOp: false });
    }
    acts.push({ id: `climb-${x}`, name: `climb @${x}`, preconditions: [`monkey-${x}`, `box-${x}`, "on-floor"], addEffects: ["on-box"], delEffects: ["on-floor"], isNoOp: false });
  }
  acts.push({ id: "grab", name: "grab bananas", preconditions: ["on-box", "box-C", "monkey-C"], addEffects: ["has-bananas"], delEffects: [], isNoOp: false });
  return acts;
}

export const monkey: Problem = {
  id: "monkey",
  name: "Monkey & Bananas",
  description:
    "Problema didattico AI: scimmia in A, scatola in B, banane in alto in C. Soluzione: go A→B, push B→C, climb, grab.",
  literals: lits(
    "monkey-A", "monkey-B", "monkey-C",
    "box-A", "box-B", "box-C",
    "on-floor", "on-box", "has-bananas",
  ),
  actions: monkeyActions(),
  init: ["monkey-A", "box-B", "on-floor"],
  goals: ["has-bananas"],
};

export const DOMAINS: Problem[] = [
  gripper,
  blocksworld,
  rocket,
  spareTire,
  sussman,
  monkey,
  cake,
  vault,
];

export function getProblem(id: string): Problem | undefined {
  return DOMAINS.find((p) => p.id === id);
}
