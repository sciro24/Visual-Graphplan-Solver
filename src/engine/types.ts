// Data model for the planning graph. Literals are atomic strings; mutexes
// carry a precomputed explanation so the UI never re-derives them at render.

/** A ground literal (atomic string id, e.g. "at-A"). */
export interface Literal {
  /** Stable identifier, also used as display name. */
  id: string;
  /** Human-readable label (defaults to id). */
  name: string;
}

/** A STRIPS-style action: preconditions + add/delete effects. */
export interface Action {
  id: string;
  name: string;
  preconditions: string[];
  addEffects: string[];
  delEffects: string[];
  /** True for persistence / no-op actions synthesized by the engine. */
  isNoOp: boolean;
  /** For no-ops: the literal being carried forward. */
  noOpLiteral?: string;
}

/** The kind of action-level mutex, per Graphplan theory. */
export type ActionMutexReason =
  | "inconsistent-effects"
  | "interference"
  | "competing-needs";

/** The kind of proposition-level mutex. */
export type PropMutexReason = "negation" | "inconsistent-support";

/** An action-level mutex between two actions, with explicit justification. */
export interface ActionMutex {
  a: string; // action id
  b: string; // action id
  reason: ActionMutexReason;
  /** Human-readable explanation, precomputed for the UI. */
  explanation: string;
  /** Optional: the literal(s) that triggered the mutex. */
  via?: string[];
}

/** A proposition-level mutex between two literals, with explicit justification. */
export interface PropMutex {
  a: string; // literal id
  b: string; // literal id
  reason: PropMutexReason;
  explanation: string;
}

/** A proposition level S_k. */
export interface StateLevel {
  index: number;
  /** Literal ids present at this level. */
  literals: string[];
  propMutexes: PropMutex[];
}

/** An action level A_k. */
export interface ActionLevel {
  index: number;
  /** Action ids present at this level. */
  actions: string[];
  actionMutexes: ActionMutex[];
}

/** A fully expanded planning graph. */
export interface PlanningGraph {
  stateLevels: StateLevel[];
  actionLevels: ActionLevel[];
  /** All actions referenced by the graph, keyed by id (incl. synthesized no-ops). */
  actionsById: Record<string, Action>;
  /** All literals referenced, keyed by id. */
  literalsById: Record<string, Literal>;
  /** Index of the state level at which the graph leveled off (-1 if never). */
  leveledOffAt: number;
  /** Goal literals for the problem. */
  goals: string[];
}

/** One step of the backward plan extraction. */
export interface ExtractionStep {
  /** State level the goal set lives at. */
  level: number;
  /** Goals being supported at this level. */
  goalSet: string[];
  /** Action ids chosen in A_(level-1) to support the goals (incl. no-ops). */
  chosenActions: string[];
  /** Union of preconditions of chosen actions = subgoals at level-1. */
  inducedSubgoals: string[];
}

/** Result of running plan extraction. */
export interface ExtractionResult {
  success: boolean;
  /** Steps from the satisfying level back to S0 (ordered high->low level). */
  steps: ExtractionStep[];
  /** The level at which extraction was attempted. */
  attemptedAtLevel: number;
  /** Plan as ordered action layers (S0->goal), excluding no-ops, for display. */
  plan: string[][];
  /** Diagnostic message when success is false. */
  message?: string;
}

/** A demo planning problem. */
export interface Problem {
  id: string;
  name: string;
  description: string;
  literals: Literal[];
  actions: Action[];
  init: string[];
  goals: string[];
  /** User-declared complementary pairs (e.g. ["on","off"]), mutex by negation. */
  complementary?: [string, string][];
  /** True for problems created by the user via the builder (not built-in). */
  custom?: boolean;
}
