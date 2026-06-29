import { describe, expect, it } from "vitest";
import {
  computeActionMutexes,
  computePropMutexes,
  expandGraph,
  firstGoalLevel,
  goalsReachable,
  hasCompetingNeeds,
  hasInconsistentEffects,
  hasInterference,
  makeNoOp,
  pairKey,
} from "./graphplan";
import { extractPlan } from "./extract";
import { solve } from "./solver";
import {
  blocksworld,
  cake,
  gripper,
  monkey,
  rocket,
  spareTire,
  sussman,
  vault,
} from "./domains";
import type { Action } from "./types";

const A = (
  id: string,
  pre: string[],
  add: string[],
  del: string[],
): Action => ({
  id,
  name: id,
  preconditions: pre,
  addEffects: add,
  delEffects: del,
  isNoOp: false,
});

describe("no-op generation", () => {
  it("creates a persistence action for a literal", () => {
    const n = makeNoOp("p");
    expect(n.isNoOp).toBe(true);
    expect(n.preconditions).toEqual(["p"]);
    expect(n.addEffects).toEqual(["p"]);
    expect(n.delEffects).toEqual([]);
  });

  it("expansion emits a no-op for every literal present in a state level", () => {
    const g = expandGraph(gripper);
    const a0 = g.actionLevels[0];
    for (const lit of g.stateLevels[0].literals) {
      expect(a0.actions).toContain(`noop:${lit}`);
    }
  });
});

describe("action applicability", () => {
  it("only includes actions whose preconditions all hold", () => {
    const g = expandGraph(gripper);
    const a0 = g.actionLevels[0].actions;
    // robot starts at A so move-AB & pick-A applicable, move-BA & pick-B not
    expect(a0).toContain("move-AB");
    expect(a0).toContain("pick-A");
    expect(a0).not.toContain("move-BA");
    expect(a0).not.toContain("pick-B");
  });
});

describe("action mutexes", () => {
  it("detects inconsistent effects", () => {
    const a = A("a", ["x"], ["p"], []);
    const b = A("b", ["y"], [], ["p"]);
    expect(hasInconsistentEffects(a, b)).toContain("p");
  });

  it("detects interference", () => {
    const a = A("a", ["x"], [], ["q"]);
    const b = A("b", ["q"], ["r"], []);
    expect(hasInterference(a, b)).toContain("q");
  });

  it("detects competing needs via prev-level prop mutex", () => {
    const a = A("a", ["p"], [], []);
    const b = A("b", ["q"], [], []);
    const propMutex = new Set([pairKey("p", "q")]);
    expect(hasCompetingNeeds(a, b, propMutex).length).toBeGreaterThan(0);
  });

  it("computeActionMutexes labels reasons and explanations", () => {
    const a = A("a", ["x"], ["p"], []);
    const b = A("b", ["y"], [], ["p"]);
    const ms = computeActionMutexes([a, b], new Set());
    expect(ms).toHaveLength(1);
    expect(ms[0].reason).toBe("inconsistent-effects");
    expect(ms[0].explanation.length).toBeGreaterThan(0);
  });
});

describe("proposition mutexes", () => {
  it("detects inconsistent support", () => {
    // p supported only by a, q supported only by b, a&b mutex => p,q mutex
    const supporters = new Map([
      ["p", ["a"]],
      ["q", ["b"]],
    ]);
    const ms = computePropMutexes(
      ["p", "q"],
      supporters,
      new Set([pairKey("a", "b")]),
      new Set(),
    );
    expect(ms).toHaveLength(1);
    expect(ms[0].reason).toBe("inconsistent-support");
  });

  it("no mutex when a common supporter exists", () => {
    const supporters = new Map([
      ["p", ["a", "c"]],
      ["q", ["c"]],
    ]);
    const ms = computePropMutexes(
      ["p", "q"],
      supporters,
      new Set([pairKey("a", "c")]),
      new Set(),
    );
    expect(ms).toHaveLength(0);
  });
});

describe("goal test", () => {
  it("cake goals are present but MUTEX at S1", () => {
    const g = expandGraph(cake, { stopWhenGoalsReachable: false, maxLevels: 6 });
    const s1 = g.stateLevels[1];
    expect(s1.literals).toContain("have-cake");
    expect(s1.literals).toContain("eaten-cake");
    expect(goalsReachable(cake.goals, s1)).toBe(false);
  });

  it("cake goals become reachable at S2", () => {
    const g = expandGraph(cake, { stopWhenGoalsReachable: false, maxLevels: 6 });
    const s2 = g.stateLevels[2];
    expect(goalsReachable(cake.goals, s2)).toBe(true);
  });
});

describe("declared complementary pairs", () => {
  const base = {
    id: "comp",
    name: "comp",
    description: "",
    literals: [
      { id: "on", name: "on" },
      { id: "off", name: "off" },
      { id: "p", name: "p" },
    ],
    actions: [
      A("a", ["p"], ["on"], []),
      A("b", ["p"], ["off"], []),
    ],
    init: ["p"],
    goals: ["on"],
  };

  it("adds a negation mutex for declared complementary literals", () => {
    const g = expandGraph(
      { ...base, complementary: [["on", "off"]] },
      { stopWhenGoalsReachable: false, maxLevels: 2 },
    );
    const s1 = g.stateLevels[1];
    const neg = s1.propMutexes.find((m) => m.reason === "negation");
    expect(neg).toBeTruthy();
  });

  it("without the declaration there is no on/off mutex", () => {
    const g = expandGraph(base, {
      stopWhenGoalsReachable: false,
      maxLevels: 2,
    });
    const s1 = g.stateLevels[1];
    expect(
      s1.propMutexes.some(
        (m) =>
          (m.a === "on" && m.b === "off") || (m.a === "off" && m.b === "on"),
      ),
    ).toBe(false);
  });
});

describe("level-off", () => {
  it("vault levels off and goals never reachable", () => {
    const g = expandGraph(vault);
    expect(g.leveledOffAt).toBeGreaterThanOrEqual(0);
    expect(firstGoalLevel(g)).toBe(-1);
  });
});

describe("end-to-end extraction", () => {
  it("gripper: extracts a valid 3-step plan", () => {
    const g = expandGraph(gripper);
    const r = extractPlan(g);
    expect(r.success).toBe(true);
    const flat = r.plan.flat();
    expect(flat).toContain("pick-A");
    expect(flat).toContain("move-AB");
    expect(flat).toContain("drop-B");
  });

  it("blocksworld: extracts a plan ending in stack-AB", () => {
    const g = expandGraph(blocksworld);
    const r = extractPlan(g);
    expect(r.success).toBe(true);
    expect(r.plan.flat()).toContain("stack-AB");
    expect(r.plan.flat()).toContain("pickup-A");
  });

  it("cake: extraction succeeds at S2, not before", () => {
    const g = expandGraph(cake, { stopWhenGoalsReachable: false, maxLevels: 6 });
    expect(extractPlan(g, 1).success).toBe(false);
    expect(extractPlan(g, 2).success).toBe(true);
  });

  it("vault: extraction fails (unsolvable)", () => {
    const g = expandGraph(vault);
    const r = extractPlan(g);
    expect(r.success).toBe(false);
  });
});

describe("solver (expand-then-extract loop)", () => {
  it("rocket: parallel loads/unloads, plan found", () => {
    const { extraction, solvedLevel } = solve(rocket);
    expect(extraction.success).toBe(true);
    expect(solvedLevel).toBeGreaterThan(0);
    const flat = extraction.plan.flat();
    expect(flat).toEqual(expect.arrayContaining(["load-p1", "load-p2", "fly", "unload-p1", "unload-p2"]));
    // loads share one time-step (parallelism)
    const loadLayer = extraction.plan.find((l) => l.includes("load-p1"));
    expect(loadLayer).toContain("load-p2");
  });

  it("spare tire: solves to spare-on-axle", () => {
    const { extraction } = solve(spareTire);
    expect(extraction.success).toBe(true);
    expect(extraction.plan.flat()).toContain("put-on-spare");
  });

  it("sussman anomaly: solves (goal interaction)", () => {
    const { extraction } = solve(sussman);
    expect(extraction.success).toBe(true);
    expect(extraction.plan.flat()).toContain("stack-AB");
    expect(extraction.plan.flat()).toContain("stack-BC");
  });

  it("monkey & bananas: grabs the bananas", () => {
    const { extraction } = solve(monkey);
    expect(extraction.success).toBe(true);
    expect(extraction.plan.flat()).toContain("grab");
  });

  it("vault: solver reports unsolvable", () => {
    const { extraction, solvedLevel } = solve(vault);
    expect(extraction.success).toBe(false);
    expect(solvedLevel).toBe(-1);
  });

  it("cake: solver finds plan at S2", () => {
    const { extraction, solvedLevel } = solve(cake);
    expect(extraction.success).toBe(true);
    expect(solvedLevel).toBe(2);
  });
});
