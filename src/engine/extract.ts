// Backward plan extraction: pick non-mutex supporters for the goals at S_k,
// recurse on their preconditions down to S0, with DFS backtracking.

import { firstGoalLevel, goalsReachable, pairKey } from "./graphplan";
import type {
  ExtractionResult,
  ExtractionStep,
  PlanningGraph,
} from "./types";

interface SearchCtx {
  graph: PlanningGraph;
  steps: ExtractionStep[];
}

/** Extract a plan at the given (or first goal-satisfying) level. */
export function extractPlan(
  graph: PlanningGraph,
  level?: number,
): ExtractionResult {
  const startLevel = level ?? firstGoalLevel(graph);

  if (startLevel < 0) {
    return {
      success: false,
      steps: [],
      attemptedAtLevel: -1,
      plan: [],
      message:
        "I goal non sono raggiungibili (presenti e non-mutex) a nessun livello espanso.",
    };
  }

  const goalLevel = graph.stateLevels[startLevel];
  if (!goalsReachable(graph.goals, goalLevel)) {
    return {
      success: false,
      steps: [],
      attemptedAtLevel: startLevel,
      plan: [],
      message: `Il goal test fallisce al livello S${startLevel}.`,
    };
  }

  const ctx: SearchCtx = { graph, steps: [] };
  const ok = search(ctx, dedupe(graph.goals), startLevel);

  if (!ok) {
    return {
      success: false,
      steps: [],
      attemptedAtLevel: startLevel,
      plan: [],
      message: `Estrazione fallita a S${startLevel} nonostante il goal test: nessuna combinazione di azioni non-mutex supporta i goal lungo tutta la regressione. Serve espandere ulteriormente il grafo.`,
    };
  }

  // steps were pushed deepest-first; order high level -> low level
  const steps = [...ctx.steps].sort((s1, s2) => s2.level - s1.level);
  const plan = buildPlanLayers(steps);

  return {
    success: true,
    steps,
    attemptedAtLevel: startLevel,
    plan,
  };
}

/** True if goals at `level` can be regressed all the way to S0. */
function search(ctx: SearchCtx, goals: string[], level: number): boolean {
  if (level === 0) {
    // base case: all goals must already hold in S0
    const s0 = new Set(ctx.graph.stateLevels[0].literals);
    return goals.every((g) => s0.has(g));
  }

  const actionLevel = ctx.graph.actionLevels[level - 1];
  const mutexSet = new Set(
    actionLevel.actionMutexes.map((m) => pairKey(m.a, m.b)),
  );

  // For each goal, candidate supporting actions present in A_(level-1).
  const candidates: string[][] = goals.map((g) =>
    actionLevel.actions.filter((aid) =>
      ctx.graph.actionsById[aid].addEffects.includes(g),
    ),
  );

  // Some goal has no supporter -> impossible.
  if (candidates.some((c) => c.length === 0)) return false;

  // Backtracking selection: choose one supporter per goal, reject if any two
  // chosen actions are mutex. Reuse a chosen action for multiple goals freely.
  const chosen = new Set<string>();

  const pick = (gi: number): boolean => {
    if (gi === goals.length) {
      const chosenArr = [...chosen];
      const subgoals = dedupe(
        chosenArr.flatMap((aid) => ctx.graph.actionsById[aid].preconditions),
      );
      const step: ExtractionStep = {
        level,
        goalSet: goals,
        chosenActions: chosenArr,
        inducedSubgoals: subgoals,
      };
      ctx.steps.push(step);
      if (search(ctx, subgoals, level - 1)) return true;
      ctx.steps.pop();
      return false;
    }

    for (const cand of candidates[gi]) {
      // already supports this goal via an existing choice?
      if (chosen.has(cand)) {
        if (pick(gi + 1)) return true;
        continue;
      }
      // mutex with anything already chosen?
      let conflict = false;
      for (const c of chosen) {
        if (mutexSet.has(pairKey(cand, c))) {
          conflict = true;
          break;
        }
      }
      if (conflict) continue;
      chosen.add(cand);
      if (pick(gi + 1)) return true;
      chosen.delete(cand);
    }
    return false;
  };

  return pick(0);
}

/** Turn ordered steps into per-time-step action layers, excluding no-ops. */
function buildPlanLayers(steps: ExtractionStep[]): string[][] {
  // steps ordered high->low level; reverse to get chronological S0->goal
  const chrono = [...steps].sort((a, b) => a.level - b.level);
  return chrono.map((s) =>
    s.chosenActions.filter(
      (aid) => !aid.startsWith("noop:"),
    ),
  );
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}
