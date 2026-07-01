// Graphplan expansion: build alternating prop/action levels, compute mutexes,
// detect level-off. Backward extraction lives in extract.ts.

import type {
  Action,
  ActionLevel,
  ActionMutex,
  Literal,
  PlanningGraph,
  Problem,
  PropMutex,
  StateLevel,
} from "./types";

/** Canonical key for an unordered pair, used to dedupe mutexes. */
function pairKey(x: string, y: string): string {
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

/** Build the no-op (persistence) action for a literal. */
export function makeNoOp(literal: string): Action {
  return {
    id: `noop:${literal}`,
    name: `persist ${literal}`,
    preconditions: [literal],
    addEffects: [literal],
    delEffects: [],
    isNoOp: true,
    noOpLiteral: literal,
  };
}

/** Inconsistent effects: one action deletes what the other adds. */
export function hasInconsistentEffects(a: Action, b: Action): string[] {
  const via: string[] = [];
  for (const e of a.addEffects) if (b.delEffects.includes(e)) via.push(e);
  for (const e of b.addEffects) if (a.delEffects.includes(e)) via.push(e);
  return via;
}

/** Interference: one action deletes a precondition of the other. */
export function hasInterference(a: Action, b: Action): string[] {
  const via: string[] = [];
  for (const p of b.preconditions) if (a.delEffects.includes(p)) via.push(p);
  for (const p of a.preconditions) if (b.delEffects.includes(p)) via.push(p);
  return via;
}

/** Competing needs: preconditions of a and b are mutex at the previous level. */
export function hasCompetingNeeds(
  a: Action,
  b: Action,
  propMutexSet: Set<string>,
): string[] {
  const via: string[] = [];
  for (const pa of a.preconditions) {
    for (const pb of b.preconditions) {
      if (pa !== pb && propMutexSet.has(pairKey(pa, pb))) {
        via.push(`${pa}↔${pb}`);
      }
    }
  }
  return via;
}

/** Compute all action mutexes for a set of actions, given prev-level prop mutexes. */
export function computeActionMutexes(
  actions: Action[],
  propMutexSet: Set<string>,
): ActionMutex[] {
  const result: ActionMutex[] = [];
  for (let i = 0; i < actions.length; i++) {
    for (let j = i + 1; j < actions.length; j++) {
      const a = actions[i];
      const b = actions[j];

      const ie = hasInconsistentEffects(a, b);
      if (ie.length) {
        result.push({
          a: a.id,
          b: b.id,
          reason: "inconsistent-effects",
          via: ie,
          explanation: `"${a.name}" e "${b.name}" hanno effetti inconsistenti: una aggiunge e l'altra cancella ${ie.join(", ")}.`,
        });
        continue;
      }

      const itf = hasInterference(a, b);
      if (itf.length) {
        result.push({
          a: a.id,
          b: b.id,
          reason: "interference",
          via: itf,
          explanation: `Interferenza: una azione cancella una precondizione dell'altra (${itf.join(", ")}).`,
        });
        continue;
      }

      const cn = hasCompetingNeeds(a, b, propMutexSet);
      if (cn.length) {
        result.push({
          a: a.id,
          b: b.id,
          reason: "competing-needs",
          via: cn,
          explanation: `Competing needs: le precondizioni ${cn.join(", ")} sono mutex al livello precedente, quindi le azioni non possono essere applicate insieme.`,
        });
      }
    }
  }
  return result;
}

/**
 * Proposition mutexes: declared-complementary pairs (negation), plus
 * inconsistent support (every supporter pair of p and q is mutex).
 */
export function computePropMutexes(
  literals: string[],
  supporters: Map<string, string[]>, // literal -> action ids that add it
  actionMutexSet: Set<string>,
  declaredNegations: Set<string>,
): PropMutex[] {
  const result: PropMutex[] = [];
  for (let i = 0; i < literals.length; i++) {
    for (let j = i + 1; j < literals.length; j++) {
      const p = literals[i];
      const q = literals[j];

      if (declaredNegations.has(pairKey(p, q))) {
        result.push({
          a: p,
          b: q,
          reason: "negation",
          explanation: `"${p}" e "${q}" sono letterali complementari: non possono valere simultaneamente.`,
        });
        continue;
      }

      const sp = supporters.get(p) ?? [];
      const sq = supporters.get(q) ?? [];
      if (sp.length === 0 || sq.length === 0) continue;

      // inconsistent support: every supporter of p is mutex with every supporter of q
      let allMutex = true;
      for (const ap of sp) {
        for (const aq of sq) {
          if (ap === aq || !actionMutexSet.has(pairKey(ap, aq))) {
            allMutex = false;
            break;
          }
        }
        if (!allMutex) break;
      }
      if (allMutex) {
        result.push({
          a: p,
          b: q,
          reason: "inconsistent-support",
          explanation: `Supporto inconsistente: ogni coppia di azioni che produce "${p}" e "${q}" è mutex, quindi i due letterali non sono raggiungibili insieme.`,
        });
      }
    }
  }
  return result;
}

export interface ExpandOptions {
  /** Maximum number of state levels to build (safety bound). */
  maxLevels?: number;
  /** Stop as soon as goals are present & non-mutex (else expand to level-off). */
  stopWhenGoalsReachable?: boolean;
}

/** Expand the graph until goals are reachable or it levels off. */
export function expandGraph(
  problem: Problem,
  opts: ExpandOptions = {},
): PlanningGraph {
  const maxLevels = opts.maxLevels ?? 12;
  const stopWhenGoals = opts.stopWhenGoalsReachable ?? true;

  const literalsById: Record<string, Literal> = {};
  for (const l of problem.literals) literalsById[l.id] = l;
  const actionsById: Record<string, Action> = {};
  for (const a of problem.actions) actionsById[a.id] = a;

  // User-declared complementary pairs (structural negations are derived anyway).
  const declaredNegations = new Set<string>(
    (problem.complementary ?? []).map(([a, b]) => pairKey(a, b)),
  );

  const stateLevels: StateLevel[] = [];
  const actionLevels: ActionLevel[] = [];

  // S0
  stateLevels.push({
    index: 0,
    literals: dedupe(problem.init),
    propMutexes: [],
  });

  let leveledOffAt = -1;

  for (let k = 0; k < maxLevels; k++) {
    const sk = stateLevels[k];
    const skSet = new Set(sk.literals);
    const propMutexSet = new Set(sk.propMutexes.map((m) => pairKey(m.a, m.b)));

    // --- Build action level A_k -------------------------------------------
    const applicable: Action[] = [];
    // real actions whose preconditions hold and are not pairwise prop-mutex
    for (const act of problem.actions) {
      if (!act.preconditions.every((p) => skSet.has(p))) continue;
      if (precondsAreMutex(act.preconditions, propMutexSet)) continue;
      applicable.push(act);
    }
    // no-ops for every present literal
    for (const lit of sk.literals) applicable.push(makeNoOp(lit));

    const actionMutexes = computeActionMutexes(applicable, propMutexSet);
    actionLevels.push({
      index: k,
      actions: applicable.map((a) => a.id),
      actionMutexes,
    });
    for (const a of applicable) if (!actionsById[a.id]) actionsById[a.id] = a;

    const actionMutexSet = new Set(
      actionMutexes.map((m) => pairKey(m.a, m.b)),
    );

    // --- Build state level S_(k+1) ----------------------------------------
    const supporters = new Map<string, string[]>();
    for (const act of applicable) {
      for (const e of act.addEffects) {
        if (!supporters.has(e)) supporters.set(e, []);
        supporters.get(e)!.push(act.id);
      }
    }
    const nextLiterals = dedupe([...supporters.keys()]);
    const nextPropMutexes = computePropMutexes(
      nextLiterals,
      supporters,
      actionMutexSet,
      declaredNegations,
    );

    const nextLevel: StateLevel = {
      index: k + 1,
      literals: nextLiterals,
      propMutexes: nextPropMutexes,
    };

    // --- Level-off detection ----------------------------------------------
    if (
      sameLiteralSet(sk.literals, nextLiterals) &&
      sameMutexSet(sk.propMutexes, nextPropMutexes)
    ) {
      leveledOffAt = k;
      stateLevels.push(nextLevel);
      break;
    }

    stateLevels.push(nextLevel);

    // --- Early stop when goals reachable ----------------------------------
    if (
      stopWhenGoals &&
      goalsReachable(problem.goals, nextLevel)
    ) {
      break;
    }
  }

  return {
    stateLevels,
    actionLevels,
    actionsById,
    literalsById,
    leveledOffAt,
    goals: problem.goals,
  };
}

/** True if all goals are present at the level and no goal pair is mutex. */
export function goalsReachable(goals: string[], level: StateLevel): boolean {
  const set = new Set(level.literals);
  if (!goals.every((g) => set.has(g))) return false;
  const mset = new Set(level.propMutexes.map((m) => pairKey(m.a, m.b)));
  for (let i = 0; i < goals.length; i++) {
    for (let j = i + 1; j < goals.length; j++) {
      if (mset.has(pairKey(goals[i], goals[j]))) return false;
    }
  }
  return true;
}

/** Index of first state level satisfying the goal test, or -1. */
export function firstGoalLevel(graph: PlanningGraph): number {
  for (const lvl of graph.stateLevels) {
    if (goalsReachable(graph.goals, lvl)) return lvl.index;
  }
  return -1;
}

// --- helpers ---------------------------------------------------------------

function precondsAreMutex(
  preconds: string[],
  propMutexSet: Set<string>,
): boolean {
  for (let i = 0; i < preconds.length; i++) {
    for (let j = i + 1; j < preconds.length; j++) {
      if (propMutexSet.has(pairKey(preconds[i], preconds[j]))) return true;
    }
  }
  return false;
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)].sort();
}

function sameLiteralSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

function sameMutexSet(a: PropMutex[], b: PropMutex[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b.map((m) => pairKey(m.a, m.b)));
  return a.every((m) => sb.has(pairKey(m.a, m.b)));
}

export { pairKey };
