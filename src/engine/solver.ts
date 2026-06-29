// ============================================================================
// Visual Graphplan Solver — solver outer loop (expand → extract → repeat)
//
// The pure expansion in graphplan.ts can stop at the first level where the
// goals are non-mutex, but that level is not always sufficient for extraction
// (classic example: goals interact and need an extra "redo" level — Sussman
// anomaly, Have-Cake). This module implements Graphplan's outer loop:
//
//   expand one more level → if goals reachable at the frontier, try to extract
//   → on success stop; otherwise keep expanding until the graph levels off.
//
// Keeping it separate leaves expandGraph/extractPlan small and independently
// testable.
// ============================================================================

import { expandGraph, firstGoalLevel, goalsReachable } from "./graphplan";
import { extractPlan } from "./extract";
import type { ExtractionResult, PlanningGraph, Problem } from "./types";

export interface SolveResult {
  /** Graph expanded to the level where the plan was found (or fullest tried). */
  graph: PlanningGraph;
  extraction: ExtractionResult;
  /** State level at which a plan was extracted, or -1 if unsolved. */
  solvedLevel: number;
}

export function solve(problem: Problem, maxLevels = 14): SolveResult {
  let graph = expandGraph(problem, {
    stopWhenGoalsReachable: false,
    maxLevels: 1,
  });

  for (let target = 1; target <= maxLevels; target++) {
    graph = expandGraph(problem, {
      stopWhenGoalsReachable: false,
      maxLevels: target,
    });

    const frontier = graph.stateLevels[graph.stateLevels.length - 1];
    if (goalsReachable(graph.goals, frontier)) {
      const r = extractPlan(graph, frontier.index);
      if (r.success) {
        return { graph, extraction: r, solvedLevel: frontier.index };
      }
    }

    // Once the graph has leveled off, one extra frontier level is enough to be
    // sure no new plan can appear → declare unsolvable.
    if (graph.leveledOffAt >= 0 && target > graph.leveledOffAt + 1) break;
  }

  // Unsolved: return the fullest graph with a best-effort (failing) extraction.
  const gl = firstGoalLevel(graph);
  const extraction: ExtractionResult =
    gl >= 0
      ? extractPlan(graph, gl)
      : {
          success: false,
          steps: [],
          attemptedAtLevel: -1,
          plan: [],
          message: graph.leveledOffAt >= 0
            ? `Il grafo si è livellato a S${graph.leveledOffAt} e i goal non sono raggiungibili: problema irrisolvibile.`
            : "Goal non raggiungibili entro il limite di livelli.",
        };
  return { graph, extraction, solvedLevel: -1 };
}
