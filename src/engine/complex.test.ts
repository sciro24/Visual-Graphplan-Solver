// Stress / complex-scenario tests: deeper plans, parallelism, multi-object
// domains, and a non-trivial unsolvable case that levels off after a few
// levels (not immediately). Also a coarse performance guard.

import { describe, expect, it } from "vitest";
import { solve } from "./solver";
import { expandGraph } from "./graphplan";
import { validateProblem } from "./validate";
import type { Action, Problem } from "./types";

const A = (id: string, pre: string[], add: string[], del: string[]): Action => ({
  id, name: id, preconditions: pre, addEffects: add, delEffects: del, isNoOp: false,
});
const L = (...ids: string[]) => ids.map((id) => ({ id, name: id }));

// --- 3-block tower build: C on B on A from all-on-table ---------------------
function blockActions(): Action[] {
  const blocks = ["A", "B", "C"];
  const acts: Action[] = [];
  for (const x of blocks) {
    acts.push(A(`pickup-${x}`, [`clear-${x}`, `table-${x}`, "hand-empty"], [`hold-${x}`], [`table-${x}`, `clear-${x}`, "hand-empty"]));
    acts.push(A(`putdown-${x}`, [`hold-${x}`], [`table-${x}`, `clear-${x}`, "hand-empty"], [`hold-${x}`]));
    for (const y of blocks) {
      if (x === y) continue;
      acts.push(A(`stack-${x}${y}`, [`hold-${x}`, `clear-${y}`], [`on-${x}${y}`, `clear-${x}`, "hand-empty"], [`hold-${x}`, `clear-${y}`]));
      acts.push(A(`unstack-${x}${y}`, [`on-${x}${y}`, `clear-${x}`, "hand-empty"], [`hold-${x}`, `clear-${y}`], [`on-${x}${y}`, `clear-${x}`, "hand-empty"]));
    }
  }
  return acts;
}

const towerBuild: Problem = {
  id: "tower", name: "tower", description: "",
  literals: L("on-AB","on-AC","on-BA","on-BC","on-CA","on-CB","table-A","table-B","table-C","clear-A","clear-B","clear-C","hold-A","hold-B","hold-C","hand-empty"),
  actions: blockActions(),
  init: ["table-A","table-B","table-C","clear-A","clear-B","clear-C","hand-empty"],
  goals: ["on-BA","on-CB"],
};

// --- Gripper with 2 balls, single gripper (deeper, 7-step plan) --------------
function gripper2(): Problem {
  const acts: Action[] = [
    A("move-AB", ["robot-A"], ["robot-B"], ["robot-A"]),
    A("move-BA", ["robot-B"], ["robot-A"], ["robot-B"]),
  ];
  for (const b of ["b1", "b2"]) {
    for (const r of ["A", "B"]) {
      acts.push(A(`pick-${b}-${r}`, [`robot-${r}`, `${b}-${r}`, "free"], [`${b}-held`], [`${b}-${r}`, "free"]));
      acts.push(A(`drop-${b}-${r}`, [`robot-${r}`, `${b}-held`], [`${b}-${r}`, "free"], [`${b}-held`]));
    }
  }
  return {
    id: "gripper2", name: "gripper2", description: "",
    literals: L("robot-A","robot-B","b1-A","b1-B","b2-A","b2-B","b1-held","b2-held","free"),
    actions: acts,
    init: ["robot-A", "b1-A", "b2-A", "free"],
    goals: ["b1-B", "b2-B"],
  };
}

// --- Non-trivial unsolvable: goal needs two literals that stay forever mutex
const stuck: Problem = {
  id: "stuck", name: "stuck", description: "",
  literals: L("r", "p", "q", "x"),
  actions: [
    A("mk-p", ["r"], ["p"], ["r"]),
    A("mk-q", ["r"], ["q"], ["r"]),
    A("need-both", ["p", "q"], ["x"], []),
  ],
  init: ["r"],
  goals: ["x"],
};

describe("complex scenarios", () => {
  it("builds a 3-block tower (C/B/A) with the right top moves", () => {
    const { extraction } = solve(towerBuild);
    expect(extraction.success).toBe(true);
    const flat = extraction.plan.flat();
    expect(flat).toContain("stack-BA");
    expect(flat).toContain("stack-CB");
  });

  it("solves 2-ball gripper (deep, single gripper forces serialization)", () => {
    const p = gripper2();
    const { extraction } = solve(p);
    expect(extraction.success).toBe(true);
    const flat = extraction.plan.flat();
    expect(flat).toContain("drop-b1-B");
    expect(flat).toContain("drop-b2-B");
    // single gripper: the two balls can't be held at the same time
    for (const layer of extraction.plan) {
      const holds = layer.filter((a) => a.startsWith("pick-")).length;
      expect(holds).toBeLessThanOrEqual(1);
    }
  });

  it("reports unsolvable when goal needs forever-mutex literals (levels off late, not at S0)", () => {
    const { extraction, solvedLevel } = solve(stuck);
    expect(extraction.success).toBe(false);
    expect(solvedLevel).toBe(-1);
    const g = expandGraph(stuck, { stopWhenGoalsReachable: false, maxLevels: 6 });
    expect(g.leveledOffAt).toBeGreaterThan(0); // not an immediate S0 level-off
  });

  it("validates and solves a problem coming through the user validator", () => {
    const raw = {
      name: "Tower via validator",
      actions: blockActions().map((a) => ({
        name: a.id, preconditions: a.preconditions, addEffects: a.addEffects, delEffects: a.delEffects,
      })),
      init: towerBuild.init,
      goals: towerBuild.goals,
    };
    const r = validateProblem(raw);
    expect(r.ok).toBe(true);
    expect(solve(r.problem!).extraction.success).toBe(true);
  });

  it("performance: heavy domains solve quickly", () => {
    const t0 = Date.now();
    solve(towerBuild);
    solve(gripper2());
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(1500);
  });
});
