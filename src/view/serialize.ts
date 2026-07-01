// Map the engine's PlanningGraph into a flat visual model: nodes positioned by
// column (level) and row (sorted index), causal edges separated from mutex
// edges. Layout is deterministic, never force-directed.

import { pairKey } from "../engine/graphplan";
import type {
  ActionMutex,
  ExtractionResult,
  PlanningGraph,
  PropMutex,
} from "../engine/types";

export type ColumnKind = "state" | "action";

export interface VisualNode {
  id: string; // unique view id: "S1:have-cake" / "A0:eat"
  refId: string; // engine id (literal id or action id)
  label: string;
  kind: ColumnKind;
  col: number; // column index (0 = S0, 1 = A0, 2 = S1, ...)
  row: number; // vertical slot within column
  x: number;
  y: number;
  isNoOp: boolean;
  isGoal: boolean;
  inPlan: boolean; // highlighted as part of extracted plan
}

export type EdgeKind =
  | "precondition" // state literal -> action
  | "add" // action -> state literal
  | "del" // action -> state literal (delete)
  | "mutex-action"
  | "mutex-prop";

export interface VisualEdge {
  id: string;
  from: string; // view node id
  to: string; // view node id
  kind: EdgeKind;
  /** explanation for mutex edges */
  explanation?: string;
  reason?: string;
}

export interface ColumnMeta {
  col: number;
  kind: ColumnKind;
  /** S0 / A0 / S1 ... */
  title: string;
  index: number; // level index
  propCount?: number;
  actionCount?: number;
  mutexCount: number;
  goalsPresent?: number;
  goalsBlocked?: number;
  leveledOff?: boolean;
}

export interface VisualGraph {
  nodes: VisualNode[];
  edges: VisualEdge[];
  columns: ColumnMeta[];
  width: number;
  height: number;
}

// layout constants
const COL_W = 220;
const COL_GAP = 60;
const ROW_H = 46;
const TOP_PAD = 70;
const LEFT_PAD = 30;

export interface SerializeOptions {
  /** highest column (level pair) to include; -1 = all */
  uptoCol?: number;
  extraction?: ExtractionResult | null;
}

export function serialize(
  graph: PlanningGraph,
  opts: SerializeOptions = {},
): VisualGraph {
  const extraction = opts.extraction ?? null;
  const goalSet = new Set(graph.goals);

  // Interleave columns: S0, A0, S1, A1, ... The number of action levels is
  // one less than (or equal to) the number of state levels.
  const columns: ColumnMeta[] = [];
  const nodes: VisualNode[] = [];
  const nodeByKey = new Map<string, VisualNode>();

  const totalCols = graph.stateLevels.length + graph.actionLevels.length;
  const limit = opts.uptoCol === undefined || opts.uptoCol < 0
    ? totalCols - 1
    : Math.min(opts.uptoCol, totalCols - 1);

  // plan membership (action view ids that are part of the plan)
  const planActions = new Set<string>();
  if (extraction?.success) {
    for (const step of extraction.steps) {
      for (const aid of step.chosenActions) {
        planActions.add(`A${step.level - 1}:${aid}`);
      }
    }
  }
  const planLiterals = new Set<string>();
  if (extraction?.success) {
    for (const step of extraction.steps) {
      for (const g of step.goalSet) planLiterals.add(`S${step.level}:${g}`);
      for (const g of step.inducedSubgoals)
        planLiterals.add(`S${step.level - 1}:${g}`);
    }
  }

  const colX = (col: number) => LEFT_PAD + col * (COL_W + COL_GAP);

  for (let col = 0; col <= limit; col++) {
    const isState = col % 2 === 0;
    const levelIndex = Math.floor(col / 2);

    if (isState) {
      const lvl = graph.stateLevels[levelIndex];
      if (!lvl) break;
      const sorted = [...lvl.literals].sort();
      sorted.forEach((lit, row) => {
        const vn: VisualNode = {
          id: `S${levelIndex}:${lit}`,
          refId: lit,
          label: lit,
          kind: "state",
          col,
          row,
          x: colX(col),
          y: TOP_PAD + row * ROW_H,
          isNoOp: false,
          isGoal: goalSet.has(lit),
          inPlan: planLiterals.has(`S${levelIndex}:${lit}`),
        };
        nodes.push(vn);
        nodeByKey.set(vn.id, vn);
      });
      const blocked = countBlockedGoals(graph.goals, lvl.propMutexes);
      const present = graph.goals.filter((g) => lvl.literals.includes(g)).length;
      columns.push({
        col,
        kind: "state",
        title: `S${levelIndex}`,
        index: levelIndex,
        propCount: lvl.literals.length,
        mutexCount: lvl.propMutexes.length,
        goalsPresent: present,
        goalsBlocked: blocked,
        leveledOff: graph.leveledOffAt === levelIndex && levelIndex > 0,
      });
    } else {
      const lvl = graph.actionLevels[levelIndex];
      if (!lvl) break;
      const sorted = [...lvl.actions].sort(sortActions);
      sorted.forEach((aid, row) => {
        const act = graph.actionsById[aid];
        const vn: VisualNode = {
          id: `A${levelIndex}:${aid}`,
          refId: aid,
          label: act?.name ?? aid,
          kind: "action",
          col,
          row,
          x: colX(col),
          y: TOP_PAD + row * ROW_H,
          isNoOp: act?.isNoOp ?? false,
          isGoal: false,
          inPlan: planActions.has(`A${levelIndex}:${aid}`),
        };
        nodes.push(vn);
        nodeByKey.set(vn.id, vn);
      });
      columns.push({
        col,
        kind: "action",
        title: `A${levelIndex}`,
        index: levelIndex,
        actionCount: lvl.actions.length,
        mutexCount: lvl.actionMutexes.length,
      });
    }
  }

  // --- edges ---------------------------------------------------------------
  const edges: VisualEdge[] = [];

  for (let col = 1; col <= limit; col += 2) {
    const levelIndex = Math.floor(col / 2);
    const lvl = graph.actionLevels[levelIndex];
    if (!lvl) continue;
    for (const aid of lvl.actions) {
      const act = graph.actionsById[aid];
      if (!act) continue;
      const aNode = `A${levelIndex}:${aid}`;
      // precondition edges from S_levelIndex
      for (const p of act.preconditions) {
        const from = `S${levelIndex}:${p}`;
        if (nodeByKey.has(from) && nodeByKey.has(aNode)) {
          edges.push({ id: `pre:${from}->${aNode}`, from, to: aNode, kind: "precondition" });
        }
      }
      // add-effect edges to S_(levelIndex+1)
      for (const e of act.addEffects) {
        const to = `S${levelIndex + 1}:${e}`;
        if (nodeByKey.has(aNode) && nodeByKey.has(to)) {
          edges.push({ id: `add:${aNode}->${to}`, from: aNode, to, kind: "add" });
        }
      }
    }
    // action mutexes
    for (const m of lvl.actionMutexes) {
      pushMutex(edges, `A${levelIndex}`, m, "mutex-action", nodeByKey);
    }
  }

  // prop mutexes
  for (let col = 0; col <= limit; col += 2) {
    const levelIndex = Math.floor(col / 2);
    const lvl = graph.stateLevels[levelIndex];
    if (!lvl) continue;
    for (const m of lvl.propMutexes) {
      pushPropMutex(edges, `S${levelIndex}`, m, nodeByKey);
    }
  }

  const maxRows = Math.max(1, ...columns.map((c) => colRowCount(c)));
  const width = LEFT_PAD * 2 + (limit + 1) * (COL_W + COL_GAP);
  const height = TOP_PAD + maxRows * ROW_H + 40;

  return { nodes, edges, columns, width, height };
}


function colRowCount(c: ColumnMeta): number {
  return c.kind === "state" ? c.propCount ?? 0 : c.actionCount ?? 0;
}

function pushMutex(
  edges: VisualEdge[],
  prefix: string,
  m: ActionMutex,
  kind: EdgeKind,
  nodeByKey: Map<string, VisualNode>,
) {
  const from = `${prefix}:${m.a}`;
  const to = `${prefix}:${m.b}`;
  if (nodeByKey.has(from) && nodeByKey.has(to)) {
    edges.push({
      id: `mx:${from}-${to}`,
      from,
      to,
      kind,
      reason: m.reason,
      explanation: m.explanation,
    });
  }
}

function pushPropMutex(
  edges: VisualEdge[],
  prefix: string,
  m: PropMutex,
  nodeByKey: Map<string, VisualNode>,
) {
  const from = `${prefix}:${m.a}`;
  const to = `${prefix}:${m.b}`;
  if (nodeByKey.has(from) && nodeByKey.has(to)) {
    edges.push({
      id: `pmx:${from}-${to}`,
      from,
      to,
      kind: "mutex-prop",
      reason: m.reason,
      explanation: m.explanation,
    });
  }
}

function countBlockedGoals(goals: string[], mutexes: PropMutex[]): number {
  const set = new Set(mutexes.map((m) => pairKey(m.a, m.b)));
  let n = 0;
  for (let i = 0; i < goals.length; i++) {
    for (let j = i + 1; j < goals.length; j++) {
      if (set.has(pairKey(goals[i], goals[j]))) n++;
    }
  }
  return n;
}

/** Real actions first, no-ops last; alphabetical within group. */
function sortActions(a: string, b: string): number {
  const an = a.startsWith("noop:");
  const bn = b.startsWith("noop:");
  if (an !== bn) return an ? 1 : -1;
  return a < b ? -1 : a > b ? 1 : 0;
}
