// ============================================================================
// Visual Graphplan Solver — problem validation & normalization
//
// Turns arbitrary user input (parsed JSON or form data) into a clean, safe
// `Problem`, or a list of human-readable errors. Designed to be "smart":
//   - literals can be omitted and are derived from everything referenced;
//   - action ids are derived from names when missing;
//   - structural mutexes stay automatic (engine), the user only optionally
//     declares complementary pairs the engine cannot infer.
//
// Hard limits keep the planning graph small enough to expand/extract in the
// browser without freezing.
// ============================================================================

import type { Action, Literal, Problem } from "./types";

export const LIMITS = {
  literals: 40,
  actions: 60,
  preconditions: 12,
  effects: 12,
  goals: 12,
  init: 30,
  nameLen: 60,
};

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Present only when ok === true. */
  problem?: Problem;
}

interface RawAction {
  id?: unknown;
  name?: unknown;
  preconditions?: unknown;
  addEffects?: unknown;
  delEffects?: unknown;
}

interface RawProblem {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  literals?: unknown;
  actions?: unknown;
  init?: unknown;
  goals?: unknown;
  complementary?: unknown;
}

const ATOM_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function slug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "x";
}

function asStringArray(v: unknown): string[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") return null;
    const t = x.trim();
    if (t) out.push(t);
  }
  return out;
}

/**
 * Validate + normalize a raw problem. `existingIds` is used to keep generated
 * ids unique against already-loaded problems.
 */
export function validateProblem(
  raw: unknown,
  existingIds: string[] = [],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["Il problema deve essere un oggetto JSON."], warnings };
  }
  const r = raw as RawProblem;

  const name =
    typeof r.name === "string" && r.name.trim()
      ? r.name.trim()
      : "Problema personalizzato";
  if (name.length > LIMITS.nameLen)
    errors.push(`Il nome supera ${LIMITS.nameLen} caratteri.`);

  // ---- actions ----
  if (!Array.isArray(r.actions) || r.actions.length === 0) {
    errors.push("Serve almeno un'azione (campo \"actions\").");
  }
  const rawActions: RawAction[] = Array.isArray(r.actions)
    ? (r.actions as RawAction[])
    : [];
  if (rawActions.length > LIMITS.actions)
    errors.push(`Troppe azioni: ${rawActions.length} (max ${LIMITS.actions}).`);

  const actions: Action[] = [];
  const seenIds = new Set<string>();
  rawActions.forEach((ra, i) => {
    const label = `Azione #${i + 1}`;
    const aName =
      typeof ra.name === "string" && ra.name.trim()
        ? ra.name.trim()
        : typeof ra.id === "string" && ra.id.trim()
          ? ra.id.trim()
          : "";
    if (!aName) {
      errors.push(`${label}: manca il nome.`);
      return;
    }
    let id =
      typeof ra.id === "string" && ra.id.trim() ? ra.id.trim() : slug(aName);
    if (id.startsWith("noop:")) {
      errors.push(`${label}: l'id non può iniziare con "noop:" (riservato).`);
      id = slug(aName);
    }
    if (seenIds.has(id)) {
      errors.push(`${label}: id duplicato "${id}".`);
    }
    seenIds.add(id);

    const pre = asStringArray(ra.preconditions);
    const add = asStringArray(ra.addEffects);
    const del = asStringArray(ra.delEffects);
    if (pre === null) errors.push(`${label}: "preconditions" deve essere un array di stringhe.`);
    if (add === null) errors.push(`${label}: "addEffects" deve essere un array di stringhe.`);
    if (del === null) errors.push(`${label}: "delEffects" deve essere un array di stringhe.`);
    const P = pre ?? [];
    const Ad = add ?? [];
    const De = del ?? [];

    if (P.length > LIMITS.preconditions)
      errors.push(`${label}: troppe precondizioni (max ${LIMITS.preconditions}).`);
    if (Ad.length + De.length > LIMITS.effects * 2)
      errors.push(`${label}: troppi effetti (max ${LIMITS.effects * 2}).`);
    if (Ad.length === 0 && De.length === 0)
      warnings.push(`${label} "${aName}": nessun effetto, è inutile.`);
    for (const e of Ad) {
      if (De.includes(e))
        errors.push(`${label}: "${e}" è sia add che del effect (contraddittorio).`);
    }

    actions.push({
      id,
      name: aName,
      preconditions: dedupe(P),
      addEffects: dedupe(Ad),
      delEffects: dedupe(De),
      isNoOp: false,
    });
  });

  // ---- init / goals ----
  const init = asStringArray(r.init);
  if (init === null) errors.push('"init" deve essere un array di stringhe.');
  const goals = asStringArray(r.goals);
  if (goals === null) errors.push('"goals" deve essere un array di stringhe.');
  const Init = dedupe(init ?? []);
  const Goals = dedupe(goals ?? []);
  if (Init.length > LIMITS.init)
    errors.push(`Stato iniziale troppo grande (max ${LIMITS.init}).`);
  if (Goals.length === 0) errors.push("Serve almeno un goal.");
  if (Goals.length > LIMITS.goals)
    errors.push(`Troppi goal (max ${LIMITS.goals}).`);

  // ---- literals: declared or derived ----
  const referenced = new Set<string>();
  for (const a of actions)
    for (const x of [...a.preconditions, ...a.addEffects, ...a.delEffects])
      referenced.add(x);
  for (const x of Init) referenced.add(x);
  for (const x of Goals) referenced.add(x);

  let declaredLiterals: string[] | null = null;
  if (r.literals !== undefined) {
    if (Array.isArray(r.literals)) {
      declaredLiterals = [];
      for (const l of r.literals as unknown[]) {
        if (typeof l === "string") declaredLiterals.push(l.trim());
        else if (
          l &&
          typeof l === "object" &&
          typeof (l as Literal).id === "string"
        )
          declaredLiterals.push((l as Literal).id.trim());
        else errors.push('Ogni elemento di "literals" deve essere una stringa o {id}.');
      }
    } else {
      errors.push('"literals" deve essere un array.');
    }
  }

  const literalSet = new Set(
    declaredLiterals && declaredLiterals.length
      ? declaredLiterals
      : [...referenced],
  );

  // any referenced atom not in the declared set is an error (typo guard)
  if (declaredLiterals && declaredLiterals.length) {
    for (const x of referenced) {
      if (!literalSet.has(x))
        errors.push(`Letterale "${x}" usato ma non dichiarato in "literals".`);
    }
  }

  // bad atom names
  for (const x of literalSet) {
    if (!ATOM_RE.test(x))
      errors.push(`Nome letterale non valido: "${x}" (usa lettere, cifre, - _).`);
  }
  if (literalSet.size > LIMITS.literals)
    errors.push(`Troppi letterali: ${literalSet.size} (max ${LIMITS.literals}).`);

  // ---- reachability sanity (warnings only) ----
  const producible = new Set(Init);
  for (const a of actions) for (const e of a.addEffects) producible.add(e);
  for (const g of Goals) {
    if (!producible.has(g))
      warnings.push(
        `Goal "${g}" non è nello stato iniziale né prodotto da alcuna azione: irraggiungibile.`,
      );
  }
  for (const x of Init)
    if (!literalSet.has(x))
      errors.push(`Stato iniziale: "${x}" non è tra i letterali.`);
  for (const g of Goals)
    if (!literalSet.has(g)) errors.push(`Goal: "${g}" non è tra i letterali.`);

  // ---- complementary pairs ----
  const complementary: [string, string][] = [];
  if (r.complementary !== undefined) {
    if (!Array.isArray(r.complementary)) {
      errors.push('"complementary" deve essere un array di coppie.');
    } else {
      for (const pair of r.complementary as unknown[]) {
        if (
          Array.isArray(pair) &&
          pair.length === 2 &&
          typeof pair[0] === "string" &&
          typeof pair[1] === "string"
        ) {
          const a = pair[0].trim();
          const b = pair[1].trim();
          if (!literalSet.has(a) || !literalSet.has(b))
            errors.push(`Coppia complementare [${a}, ${b}]: letterale non dichiarato.`);
          else complementary.push([a, b]);
        } else {
          errors.push("Ogni coppia complementare deve essere [stringa, stringa].");
        }
      }
    }
  }

  if (errors.length) return { ok: false, errors, warnings };

  // ---- build final problem ----
  const baseId =
    typeof r.id === "string" && slug(r.id) ? slug(r.id) : slug(name);
  const id = uniqueId(baseId, existingIds);

  const problem: Problem = {
    id,
    name,
    description:
      typeof r.description === "string"
        ? r.description.trim()
        : "Problema caricato dall'utente.",
    literals: [...literalSet].sort().map((x) => ({ id: x, name: x })),
    actions,
    init: Init,
    goals: Goals,
    complementary: complementary.length ? complementary : undefined,
    custom: true,
  };

  return { ok: true, errors, warnings, problem };
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

function uniqueId(base: string, existing: string[]): string {
  const set = new Set(existing);
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
