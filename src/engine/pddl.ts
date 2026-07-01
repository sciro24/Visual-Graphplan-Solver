// ============================================================================
// Visual Graphplan Solver — PDDL front-end (parser + grounder)
//
// Parses a *lifted* PDDL domain + problem pair and grounds it into the flat,
// propositional shape the rest of the engine consumes (the same object
// `validateProblem` accepts). Grounding instantiates every action over the
// declared objects, pruned by the type hierarchy so the planning graph stays
// small and readable — which is exactly what makes typing worth supporting in
// a didactic tool.
//
// Supported subset: :strips, :typing, :negative-preconditions (modeled as
// delete effects), :equality (as a binding filter). Rejected with a clear
// message: disjunctions, quantifiers (forall/exists), conditional effects
// (when), numeric fluents, durative actions.
// ============================================================================

/** The raw problem shape consumed by `validateProblem`. */
export interface RawProblemInput {
  name: string;
  description: string;
  actions: {
    name: string;
    preconditions: string[];
    addEffects: string[];
    delEffects: string[];
  }[];
  init: string[];
  goals: string[];
}

export interface PddlResult {
  ok: boolean;
  errors: string[];
  raw?: RawProblemInput;
}

/** Parse + ground a PDDL domain/problem pair. Never throws. */
export function pddlToRaw(domainText: string, problemText: string): PddlResult {
  try {
    const domain = parseDomain(domainText);
    const problem = parseProblem(problemText);
    const raw = ground(domain, problem);
    return { ok: true, errors: [], raw };
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
}

// ---------------------------------------------------------------------------
// S-expression reader
// ---------------------------------------------------------------------------

type SExpr = string | SExpr[];

class PddlError extends Error {}

function tokenize(src: string): string[] {
  // strip line comments starting with ';'
  const noComments = src.replace(/;[^\n]*/g, " ");
  const tokens = noComments.match(/\(|\)|[^\s()]+/g);
  return tokens ?? [];
}

/** Parse the whole source into the list of top-level forms. */
function readForms(src: string): SExpr[] {
  const tokens = tokenize(src);
  let i = 0;

  function readForm(): SExpr {
    const t = tokens[i++];
    if (t === undefined) throw new PddlError("PDDL incompleto: parentesi non chiuse.");
    if (t === "(") {
      const list: SExpr[] = [];
      while (tokens[i] !== ")") {
        if (tokens[i] === undefined)
          throw new PddlError("PDDL incompleto: manca ')'.");
        list.push(readForm());
      }
      i++; // consume ')'
      return list;
    }
    if (t === ")") throw new PddlError("PDDL malformato: ')' inatteso.");
    return t;
  }

  const forms: SExpr[] = [];
  while (i < tokens.length) forms.push(readForm());
  return forms;
}

const isList = (x: SExpr): x is SExpr[] => Array.isArray(x);
const sym = (x: SExpr): string => (typeof x === "string" ? x.toLowerCase() : "");

/** Find the `(define (KIND NAME) ...)` form and return its body + declared name. */
function findDefine(
  src: string,
  kind: "domain" | "problem",
): { name: string; body: SExpr[] } {
  for (const form of readForms(src)) {
    if (!isList(form) || sym(form[0]) !== "define") continue;
    const head = form[1];
    if (isList(head) && sym(head[0]) === kind) {
      const name = typeof head[1] === "string" ? head[1] : kind;
      return { name, body: form.slice(2) };
    }
  }
  throw new PddlError(`Non trovo (define (${kind} ...)).`);
}

// ---------------------------------------------------------------------------
// Typed-list parsing:  a b - block  c d - room  e f   (untyped => object)
// ---------------------------------------------------------------------------

interface Typed {
  name: string;
  type: string;
}

function parseTypedList(items: SExpr[]): Typed[] {
  const out: Typed[] = [];
  let buffer: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (typeof it !== "string")
      throw new PddlError("Lista tipizzata malformata (atteso simbolo).");
    if (it === "-") {
      const type = items[i + 1];
      if (typeof type !== "string")
        throw new PddlError("Manca il nome del tipo dopo '-'.");
      for (const n of buffer) out.push({ name: n, type: type.toLowerCase() });
      buffer = [];
      i++; // skip the type token
    } else {
      buffer.push(it);
    }
  }
  for (const n of buffer) out.push({ name: n, type: "object" });
  return out;
}

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

interface ActionSchema {
  name: string;
  params: Typed[];
  pre: SExpr[]; // list of literal forms (atom / (not atom) / (= ..) / (not (= ..)))
  eff: SExpr[];
}

interface Domain {
  name: string;
  /** child type -> parent type */
  parentOf: Map<string, string>;
  constants: Typed[];
  actions: ActionSchema[];
}

const UNSUPPORTED_REQS: Record<string, string> = {
  ":disjunctive-preconditions": "precondizioni disgiuntive (or)",
  ":existential-preconditions": "quantificatore esiste",
  ":universal-preconditions": "quantificatore per-ogni",
  ":quantified-preconditions": "precondizioni quantificate",
  ":conditional-effects": "effetti condizionali (when)",
  ":adl": "ADL (usa STRIPS + typing)",
  ":fluents": "fluenti numerici",
  ":numeric-fluents": "fluenti numerici",
  ":durative-actions": "azioni temporali",
  ":derived-predicates": "predicati derivati",
};

function parseDomain(src: string): Domain {
  const { name, body } = findDefine(src, "domain");
  const domain: Domain = {
    name,
    parentOf: new Map(),
    constants: [],
    actions: [],
  };

  for (const form of body) {
    if (!isList(form)) continue;
    const head = sym(form[0]);
    switch (head) {
      case ":requirements": {
        for (const r of form.slice(1)) {
          const key = sym(r);
          if (UNSUPPORTED_REQS[key])
            throw new PddlError(
              `Requisito PDDL non supportato: ${key} (${UNSUPPORTED_REQS[key]}).`,
            );
        }
        break;
      }
      case ":types": {
        for (const { name: t, type: parent } of parseTypedList(form.slice(1)))
          domain.parentOf.set(t, parent);
        break;
      }
      case ":constants": {
        domain.constants.push(...parseTypedList(form.slice(1)));
        break;
      }
      case ":predicates":
      case ":functions":
        // not needed for grounding; arities are validated implicitly
        break;
      case ":action":
        domain.actions.push(parseAction(form.slice(1)));
        break;
      default:
        break; // ignore unknown sections
    }
  }

  if (domain.actions.length === 0)
    throw new PddlError("Il dominio non dichiara alcuna :action.");
  return domain;
}

function parseAction(rest: SExpr[]): ActionSchema {
  const name = typeof rest[0] === "string" ? rest[0] : "";
  if (!name) throw new PddlError("Un'azione senza nome.");
  let params: Typed[] = [];
  let pre: SExpr[] = [];
  let eff: SExpr[] = [];

  for (let i = 1; i < rest.length; i += 2) {
    const key = sym(rest[i]);
    const val = rest[i + 1];
    if (key === ":parameters") {
      if (!isList(val)) throw new PddlError(`Azione "${name}": :parameters malformato.`);
      params = parseTypedList(val);
    } else if (key === ":precondition") {
      pre = flattenConj(val, name, "precondition");
    } else if (key === ":effect") {
      eff = flattenConj(val, name, "effect");
    }
  }
  return { name, params, pre, eff };
}

/** Flatten a (and ...) / single-literal formula into a list of literals. */
function flattenConj(f: SExpr, action: string, where: string): SExpr[] {
  if (f === undefined) return [];
  if (!isList(f)) throw new PddlError(`Azione "${action}": ${where} malformato.`);
  if (f.length === 0) return []; // empty ()
  const head = sym(f[0]);
  if (head === "and") return f.slice(1);
  if (head === "or" || head === "imply")
    throw new PddlError(`Azione "${action}": '${head}' non supportato in ${where}.`);
  if (head === "forall" || head === "exists")
    throw new PddlError(
      `Azione "${action}": quantificatore '${head}' non supportato in ${where}.`,
    );
  if (head === "when")
    throw new PddlError(
      `Azione "${action}": effetto condizionale 'when' non supportato.`,
    );
  return [f]; // a single literal
}

// ---------------------------------------------------------------------------
// Problem
// ---------------------------------------------------------------------------

interface ProblemDef {
  name: string;
  objects: Typed[];
  init: SExpr[];
  goal: SExpr[];
}

function parseProblem(src: string): ProblemDef {
  const { name, body } = findDefine(src, "problem");
  const def: ProblemDef = { name, objects: [], init: [], goal: [] };

  for (const form of body) {
    if (!isList(form)) continue;
    const head = sym(form[0]);
    if (head === ":objects") {
      def.objects.push(...parseTypedList(form.slice(1)));
    } else if (head === ":init") {
      def.init = form.slice(1);
    } else if (head === ":goal") {
      def.goal = flattenConj(form[1], "(goal)", "goal");
    }
  }
  if (def.goal.length === 0)
    throw new PddlError("Il problema non dichiara alcun :goal.");
  return def;
}

// ---------------------------------------------------------------------------
// Grounding
// ---------------------------------------------------------------------------

const ATOM_SANITIZE = /[^A-Za-z0-9_-]/g;

/** Turn a ground atom [pred, arg, ...] into the flat literal id the engine uses. */
function atomId(pred: string, args: string[]): string {
  const parts = [pred, ...args].map((p) => p.replace(ATOM_SANITIZE, "_"));
  return parts.join("-");
}

/** Substitute variables in an atom form; returns [predicate, ...groundArgs]. */
function instantiate(atom: SExpr[], bind: Map<string, string>): [string, string[]] {
  const pred = typeof atom[0] === "string" ? atom[0] : "";
  const args: string[] = [];
  for (let i = 1; i < atom.length; i++) {
    const a = atom[i];
    if (typeof a !== "string") throw new PddlError("Atomo annidato non supportato.");
    args.push(a.startsWith("?") ? mustBind(bind, a) : a);
  }
  return [pred, args];
}

function mustBind(bind: Map<string, string>, v: string): string {
  const o = bind.get(v);
  if (o === undefined)
    throw new PddlError(`Variabile non legata: ${v} (non è tra i :parameters).`);
  return o;
}

function ground(domain: Domain, problem: ProblemDef): RawProblemInput {
  const objects = [...domain.constants, ...problem.objects];

  // object of declared type `t` can bind a parameter of type `target`?
  const matches = (objType: string, target: string): boolean => {
    if (target === "object") return true;
    let t: string | undefined = objType;
    const seen = new Set<string>();
    while (t && !seen.has(t)) {
      if (t === target) return true;
      seen.add(t);
      t = domain.parentOf.get(t);
    }
    return false;
  };

  const candidates = (type: string): string[] =>
    objects.filter((o) => matches(o.type, type)).map((o) => o.name);

  const actions: RawProblemInput["actions"] = [];

  for (const schema of domain.actions) {
    const lists = schema.params.map((p) => candidates(p.type));
    // a parameter with no candidate object => this schema grounds to nothing
    if (lists.some((l) => l.length === 0)) continue;

    for (const combo of cartesian(lists)) {
      const bind = new Map<string, string>();
      schema.params.forEach((p, k) => bind.set(p.name, combo[k]));

      // equality constraints act as binding filters, not state literals
      if (!satisfiesEquality(schema.pre, bind)) continue;

      const pre: string[] = [];
      const add: string[] = [];
      const del: string[] = [];

      for (const lit of schema.pre) {
        // (= ..) and (not (= ..)) are binding filters, already applied above
        if (isEquality(lit)) continue;
        if (isNegation(lit) && isEquality((lit as SExpr[])[1])) continue;
        const neg = isNegation(lit);
        const atom = neg ? (lit as SExpr[])[1] : lit;
        if (!isList(atom)) throw new PddlError(`Precondizione malformata in "${schema.name}".`);
        const [p, a] = instantiate(atom, bind);
        if (neg)
          throw new PddlError(
            `Azione "${schema.name}": precondizione negata (not ${p}) non supportata dal motore positive-STRIPS.`,
          );
        pre.push(atomId(p, a));
      }

      for (const lit of schema.eff) {
        const neg = isNegation(lit);
        const atom = neg ? (lit as SExpr[])[1] : lit;
        if (!isList(atom)) throw new PddlError(`Effetto malformato in "${schema.name}".`);
        if (isEquality(atom))
          throw new PddlError(`Azione "${schema.name}": '=' non è un effetto valido.`);
        const [p, a] = instantiate(atom, bind);
        (neg ? del : add).push(atomId(p, a));
      }

      // STRIPS add-after-delete: if a grounding both adds and deletes an atom
      // (e.g. move(x,x) with from==to and no inequality guard), the add wins,
      // so it never appears as a contradictory delete effect.
      const addSet = new Set(add);
      const argSuffix = combo.length ? `(${combo.join(",")})` : "";
      actions.push({
        name: `${schema.name}${argSuffix}`,
        preconditions: uniq(pre),
        addEffects: uniq(add),
        delEffects: uniq(del.filter((d) => !addSet.has(d))),
      });
    }
  }

  const init = problem.init.map((f) => groundStateAtom(f, "init"));
  const goals = problem.goal.map((f) => groundGoalAtom(f));

  return {
    name: problem.name,
    description: `Importato da PDDL (dominio "${domain.name}").`,
    actions,
    init: uniq(init),
    goals: uniq(goals),
  };
}

function groundStateAtom(f: SExpr, where: string): string {
  if (!isList(f)) throw new PddlError(`${where}: atomo malformato.`);
  if (sym(f[0]) === "=")
    throw new PddlError(`${where}: fluenti/uguaglianze numeriche non supportati.`);
  if (sym(f[0]) === "not")
    throw new PddlError(`${where}: letterali negati non supportati.`);
  const pred = typeof f[0] === "string" ? f[0] : "";
  const args = f.slice(1).map((a) => {
    if (typeof a !== "string") throw new PddlError(`${where}: argomento non valido.`);
    if (a.startsWith("?")) throw new PddlError(`${where}: variabile ${a} non consentita (serve un oggetto).`);
    return a;
  });
  return atomId(pred, args);
}

function groundGoalAtom(f: SExpr): string {
  if (isList(f) && sym(f[0]) === "not")
    throw new PddlError("Goal negati non supportati dal motore positive-STRIPS.");
  return groundStateAtom(f, "goal");
}

// ---- small helpers ---------------------------------------------------------

const isNegation = (f: SExpr): boolean => isList(f) && sym(f[0]) === "not";
const isEquality = (f: SExpr): boolean => isList(f) && sym(f[0]) === "=";

/** Check (= ?x ?y) / (not (= ?x ?y)) constraints against a binding. */
function satisfiesEquality(pre: SExpr[], bind: Map<string, string>): boolean {
  for (const lit of pre) {
    const neg = isNegation(lit);
    const eq = neg ? (lit as SExpr[])[1] : lit;
    if (!isEquality(eq)) continue;
    const [, x, y] = eq as SExpr[];
    const vx = resolve(x, bind);
    const vy = resolve(y, bind);
    const equal = vx === vy;
    if (neg ? equal : !equal) return false;
  }
  return true;
}

function resolve(x: SExpr, bind: Map<string, string>): string {
  if (typeof x !== "string") throw new PddlError("Uguaglianza malformata.");
  return x.startsWith("?") ? mustBind(bind, x) : x;
}

function cartesian(lists: string[][]): string[][] {
  return lists.reduce<string[][]>(
    (acc, list) => acc.flatMap((prefix) => list.map((x) => [...prefix, x])),
    [[]],
  );
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}
