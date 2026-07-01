import { describe, expect, it } from "vitest";
import { pddlToRaw } from "./pddl";
import { validateProblem } from "./validate";
import { solve } from "./solver";

const GRIPPER_DOMAIN = `
(define (domain gripper)
  (:requirements :strips :typing)
  (:types room ball)
  (:predicates (at-robot ?r - room) (at ?b - ball ?r - room)
               (free) (carry ?b - ball))
  (:action move
    :parameters (?from - room ?to - room)
    :precondition (and (at-robot ?from))
    :effect (and (at-robot ?to) (not (at-robot ?from))))
  (:action pick
    :parameters (?b - ball ?r - room)
    :precondition (and (at ?b ?r) (at-robot ?r) (free))
    :effect (and (carry ?b) (not (at ?b ?r)) (not (free))))
  (:action drop
    :parameters (?b - ball ?r - room)
    :precondition (and (carry ?b) (at-robot ?r))
    :effect (and (at ?b ?r) (free) (not (carry ?b)))))
`;

const GRIPPER_PROBLEM = `
(define (problem gripper-1)
  (:domain gripper)
  (:objects rooma roomb - room ball1 - ball)
  (:init (at-robot rooma) (at ball1 rooma) (free))
  (:goal (and (at ball1 roomb))))
`;

describe("pddl front-end", () => {
  it("grounds a typed gripper and solves it", () => {
    const res = pddlToRaw(GRIPPER_DOMAIN, GRIPPER_PROBLEM);
    expect(res.ok).toBe(true);
    const v = validateProblem(res.raw);
    expect(v.ok).toBe(true);

    const solved = solve(v.problem!);
    expect(solved.extraction.success).toBe(true);
    // pick @ rooma, move a->b, drop @ roomb
    expect(solved.solvedLevel).toBeGreaterThanOrEqual(3);
  });

  it("prunes by type: move only binds room objects", () => {
    const res = pddlToRaw(GRIPPER_DOMAIN, GRIPPER_PROBLEM);
    const moveActions = res.raw!.actions.filter((a) => a.name.startsWith("move("));
    // 2 rooms -> 2x2 = 4 groundings (incl. from==to), never involving ball1
    expect(moveActions).toHaveLength(4);
    expect(moveActions.every((a) => !a.name.includes("ball1"))).toBe(true);
  });

  it("honours (not (= ?x ?y)) as a binding filter", () => {
    const dom = `
      (define (domain d) (:requirements :strips :typing :equality)
        (:types loc)
        (:action go :parameters (?a - loc ?b - loc)
          :precondition (and (at ?a) (not (= ?a ?b)))
          :effect (and (at ?b) (not (at ?a)))))`;
    const prob = `
      (define (problem p) (:domain d) (:objects x y - loc)
        (:init (at x)) (:goal (and (at y))))`;
    const res = pddlToRaw(dom, prob);
    expect(res.ok).toBe(true);
    // 2x2 combos minus the two self-pairs (x,x)(y,y) = 2 grounded actions
    expect(res.raw!.actions).toHaveLength(2);
  });

  it("rejects unsupported requirements with a clear message", () => {
    const dom = `(define (domain d) (:requirements :adl)
      (:action a :effect (and (p))))`;
    const prob = `(define (problem p) (:domain d) (:init) (:goal (and (p))))`;
    const res = pddlToRaw(dom, prob);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/adl/i);
  });

  it("rejects negative preconditions (positive-STRIPS engine)", () => {
    const dom = `(define (domain d) (:requirements :strips :negative-preconditions)
      (:action a :parameters ()
        :precondition (and (not (p))) :effect (and (q))))`;
    const prob = `(define (problem p) (:domain d) (:init) (:goal (and (q))))`;
    const res = pddlToRaw(dom, prob);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/negat/i);
  });

  it("errors on missing goal", () => {
    const dom = `(define (domain d) (:action a :effect (and (p))))`;
    const prob = `(define (problem p) (:domain d) (:init (p)))`;
    expect(pddlToRaw(dom, prob).ok).toBe(false);
  });
});
