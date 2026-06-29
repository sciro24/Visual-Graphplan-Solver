# Visual Graphplan Solver

An interactive, didactic web app that builds, visualizes, and explains the
**Graphplan** algorithm (Blum & Furst, 1997) step by step on small
propositional planning domains. It shows the alternating layers of the planning
graph, the persistence (no-op) actions, the mutex relations between actions and
between literals, the goal test at each level, the level-off condition, and the
backward extraction of a valid plan.

Author: Diego Scirocco.

## Screenshots

Example of a planning graph as rendered by the app:

![Planning graph example](screenshots/graph-example.png)

Example of the form used to enter a custom problem:

![Custom problem form](screenshots/form-example.png)

## Goal of the Project

The app is a single-page application meant for teaching and demonstration, not
an industrial planner. The focus is the visual understanding of how Graphplan
works internally: graph construction, insertion of persistence actions,
computation of mutexes, goal testing, and backward plan extraction. The target
user is a student or a teacher who wants to observe the inner behaviour of
Graphplan on small but meaningful examples.

The engine is intentionally separated from the user interface, so the planning
logic can be read, tested, and reused independently of the visualization.

## Quick Start

Requirements: Node.js version 18 or newer.

```bash
npm install
npm run dev        # development server at http://localhost:5173
```

Other commands:

```bash
npm test           # unit and end-to-end tests for the engine (Vitest)
npm run build      # production build into dist/
npm run preview    # serve the production build
```

## Features

- Expansion of the planning graph as an alternating sequence of state levels
  and action levels (S0, A0, S1, A1, and so on).
- Automatic generation of no-op (persistence) actions for every literal present
  at a level; no-ops are treated as first-class actions but are clearly marked.
- Action mutexes: inconsistent effects, interference, and competing needs.
- Proposition mutexes: negation (user-declared complementary pairs) and
  inconsistent support.
- Goal test at every level: all goals present and no goal pair mutually
  exclusive.
- Backward plan extraction with backtracking, plus an outer expand-then-extract
  loop so problems that need extra levels (goal interactions) are solved
  correctly.
- Level-off detection: the graph is marked as stabilized when a new level adds
  no propositions and does not change the set of mutexes. If the goals are still
  not extractable, the problem is reported as unsolvable.
- Contextual explanation panel that justifies, in readable form, why a node or a
  mutex exists.

## Interface

The layout has three panels.

- Left panel: domain selector, initial state and goals, step-by-step execution
  controls (stepper and slider to build the graph one level at a time), plan
  extraction, view toggles (mutexes, no-ops, dependencies, plan-only),
  light/dark theme, and JSON export of the current graph.
- Center panel: the planning-graph canvas. The layout is deterministic and
  level-based, never force-directed, because Graphplan has an intrinsically
  layered temporal and causal structure. Propositions are rendered as pills,
  actions as cards, no-ops as dashed cards, goals are highlighted, mutexes are
  dashed red arcs, and the extracted plan is shown with a colored glow.
- Right panel: a collapsible explanation panel. Click a node or a mutex to see
  its formal justification; when nothing is selected it shows the algorithm
  state, the extracted plan, and the backward regression step by step.

Interactions include hovering or clicking an action (preconditions and add/del
effects), clicking a proposition (which actions support it), and clicking a
mutex (its formal reason).

## Demo Domains

| Domain | Teaching purpose |
|---|---|
| Gripper (simplified) | Solvable in a few levels: pick at A, move A to B, drop at B. |
| Blocksworld (2 blocks) | Solvable: pickup A, then stack A on B. |
| Rocket (parallel actions) | Shows parallel actions in the same level: load both packages, fly, unload both. |
| Spare Tire | Classic Russell and Norvig example: mounting the spare tire. |
| Sussman Anomaly (3 blocks) | Goal interaction: the subgoals cannot be achieved independently. Optimal six-step plan. |
| Monkey and Bananas | Textbook AI planning problem: go, push, climb, grab. |
| Have Cake and Eat It | Goals present but mutex at S1, extractable at S2. |
| Vault | Unsolvable: the key is missing, the graph levels off immediately. |

## Custom Problems

The "Aggiungi problema" button, under the domain selector, opens an editor with
two modes.

- Form mode: fields for name, initial state, goals, and a list of actions, each
  with preconditions, add effects, and delete effects (atoms separated by
  spaces or commas). Literals are derived automatically from what you use, so
  you do not need to declare them.
- JSON mode: paste a problem in JSON format, or load a `.json` file.

Mutexes remain automatic; they are computed by the engine. You may optionally
declare complementary literal pairs (for example, "light-on" and "light-off")
for literals that exclude each other by nature and that the engine cannot infer
structurally.

Validation is live: errors, warnings (such as an unreachable goal), and the list
of detected literals update as you type, and a problem can be added only if it is
valid. Custom problems are stored in `localStorage`, appear in the selector under
a separate group, can be deleted, and can be downloaded as JSON.

A custom problem next to the selector exposes a download-icon button (save the
problem as JSON) and, for user-created problems, a trash-icon button (delete).

Minimal importable JSON example:

```json
{
  "name": "Light Switch",
  "actions": [
    { "name": "turn on",  "preconditions": ["off"], "addEffects": ["on"],  "delEffects": ["off"] },
    { "name": "turn off", "preconditions": ["on"],  "addEffects": ["off"], "delEffects": ["on"] }
  ],
  "init": ["off"],
  "goals": ["on"]
}
```

## Limits

To keep the planning graph small enough to expand and extract in the browser
without freezing, custom problems are capped at 40 literals, 60 actions, 12
preconditions or goals per problem, and 14 expansion levels.

The model is positive STRIPS: negative preconditions are not supported.
Complementary states must be modeled with explicit literals and delete effects
(for example, "have-cake" and "no-cake"), which is a deliberate choice to keep
the model small and transparent.

Plan extraction uses depth-first backtracking without no-good memoization, so
pathological adversarial instances could be slow; in practice all demo domains
and reasonably sized custom problems solve in a few milliseconds.

## Architecture

The engine is fully separated from the user interface.

```
src/
  engine/                # Graphplan engine (no UI dependency)
    types.ts             #   data model: Literal, Action, StateLevel, ...
    graphplan.ts         #   level expansion, mutexes, goal test, level-off
    extract.ts           #   backward extraction with backtracking
    solver.ts            #   outer loop expand -> extract -> repeat
    validate.ts          #   validation / normalization of user problems
    domains.ts           #   demo problems
    graphplan.test.ts    #   engine tests (expansion, mutexes, solving, ...)
    validate.test.ts     #   validation tests
    complex.test.ts      #   stress / complex-scenario tests
  view/
    serialize.ts         # visualization mapper: PlanningGraph -> visual model
  ui/                    # React: layout, canvas, panels, styles
    App.tsx
    GraphCanvas.tsx
    ExplanationPanel.tsx
    ProblemBuilder.tsx   #   custom-problem editor (form and JSON)
    styles.css
```

See ALGORITHM.md for the algorithmic design choices.

## Algorithm Summary

1. Expansion: from the initial state S0, build action level A0 with all
   applicable actions plus a no-op per present literal, compute its mutexes,
   then build state level S1 as the union of the add effects, and compute its
   mutexes. Repeat.
2. Goal test: at each state level, check that all goals are present and no goal
   pair is mutex.
3. Backward extraction: from the first satisfying level, choose a non-mutex set
   of actions supporting all goals, regress to the union of their preconditions
   as new subgoals, and recurse down to S0, backtracking on failure. The solver
   keeps expanding and retrying until success or level-off.
4. Level-off: if a new level adds no new propositions and does not change the
   mutexes, the graph has stabilized; if the goals are still not reachable, the
   problem is unsolvable.

## Deep Links

The URL accepts `?domain=<id>` to open a specific domain (including custom ones),
`?extract=1` to show the extracted plan immediately, and `?builder=1` to open
the custom-problem editor. Example: `/?domain=cake&extract=1`.

## Testing

The engine is covered by unit and end-to-end tests run with Vitest, including
mutex computation, no-op generation, goal testing, level-off, backward
extraction on every demo domain, validation of user input, and complex
scenarios (tower building, multi-object gripper, parallel actions, and a
non-trivial unsolvable case). Run them with `npm test`.
