import { describe, expect, it } from "vitest";
import { LIMITS, validateProblem } from "./validate";
import { solve } from "./solver";

const good = {
  name: "Switch",
  actions: [
    { name: "turn on", preconditions: ["off"], addEffects: ["on"], delEffects: ["off"] },
    { name: "turn off", preconditions: ["on"], addEffects: ["off"], delEffects: ["on"] },
  ],
  init: ["off"],
  goals: ["on"],
};

describe("validateProblem — happy path", () => {
  it("accepts a minimal valid problem and derives literals", () => {
    const r = validateProblem(good);
    expect(r.ok).toBe(true);
    const lits = r.problem!.literals.map((l) => l.id).sort();
    expect(lits).toEqual(["off", "on"]);
  });

  it("derives action ids from names (slug) and is solvable", () => {
    const r = validateProblem(good);
    expect(r.ok).toBe(true);
    const ids = r.problem!.actions.map((a) => a.id);
    expect(ids).toContain("turn-on");
    const { extraction } = solve(r.problem!);
    expect(extraction.success).toBe(true);
    expect(extraction.plan.flat()).toContain("turn-on");
  });

  it("keeps generated ids unique against existing ones", () => {
    const r = validateProblem({ ...good, id: "switch" }, ["switch", "switch-2"]);
    expect(r.problem!.id).toBe("switch-3");
  });
});

describe("validateProblem — errors", () => {
  it("rejects non-object", () => {
    expect(validateProblem(42).ok).toBe(false);
    expect(validateProblem([]).ok).toBe(false);
  });

  it("requires at least one action and one goal", () => {
    expect(validateProblem({ actions: [], goals: ["x"] }).ok).toBe(false);
    expect(validateProblem({ actions: [{ name: "a", addEffects: ["x"] }], goals: [] }).ok).toBe(false);
  });

  it("flags an atom used but not declared in explicit literals", () => {
    const r = validateProblem({
      literals: ["on", "off"],
      actions: [{ name: "x", preconditions: ["off"], addEffects: ["ON"] }],
      init: ["off"],
      goals: ["on"],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/ON/);
  });

  it("rejects add+del of the same effect", () => {
    const r = validateProblem({
      actions: [{ name: "x", addEffects: ["p"], delEffects: ["p"] }],
      init: [],
      goals: ["p"],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects reserved noop: id prefix", () => {
    const r = validateProblem({
      actions: [{ id: "noop:p", name: "x", addEffects: ["p"] }],
      goals: ["p"],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects duplicate action ids", () => {
    const r = validateProblem({
      actions: [
        { id: "a", name: "a", addEffects: ["p"] },
        { id: "a", name: "b", addEffects: ["q"] },
      ],
      goals: ["p"],
    });
    expect(r.ok).toBe(false);
  });

  it("enforces the action limit", () => {
    const actions = Array.from({ length: LIMITS.actions + 1 }, (_, i) => ({
      name: `a${i}`,
      addEffects: [`p${i}`],
    }));
    const r = validateProblem({ actions, goals: ["p0"] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Troppe azioni/);
  });

  it("validates complementary pairs against declared literals", () => {
    const r = validateProblem({ ...good, complementary: [["on", "missing"]] });
    expect(r.ok).toBe(false);
  });
});

describe("validateProblem — warnings", () => {
  it("warns about an unreachable goal but still validates", () => {
    const r = validateProblem({
      actions: [{ name: "a", preconditions: ["x"], addEffects: ["y"] }],
      init: ["x"],
      goals: ["z"],
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/irraggiungibile/);
  });
});
