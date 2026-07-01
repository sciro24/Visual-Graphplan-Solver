// Modal to add a custom problem, either by uploading/pasting JSON or by
// filling a smart form. Mutexes stay automatic (computed by the engine); the
// user only optionally declares complementary literal pairs. Everything is
// validated through engine/validate before it can be added.

import { useMemo, useState } from "react";
import { LIMITS, validateProblem } from "../engine/validate";
import { pddlToRaw } from "../engine/pddl";
import type { Problem } from "../engine/types";

interface Props {
  existingIds: string[];
  onAdd: (p: Problem) => void;
  onClose: () => void;
}

type Mode = "form" | "json" | "pddl";

interface FormAction {
  name: string;
  pre: string;
  add: string;
  del: string;
}

const EMPTY_ACTION: FormAction = { name: "", pre: "", add: "", del: "" };

/** Split a free-text list on commas / whitespace / newlines. */
function splitAtoms(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function ProblemBuilder({ existingIds, onAdd, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("form");

  // form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [actions, setActions] = useState<FormAction[]>([{ ...EMPTY_ACTION }]);
  const [init, setInit] = useState("");
  const [goals, setGoals] = useState("");
  const [complementary, setComplementary] = useState("");

  // json state
  const [jsonText, setJsonText] = useState("");

  // pddl state
  const [pddlDomain, setPddlDomain] = useState("");
  const [pddlProblem, setPddlProblem] = useState("");

  // Build a raw problem (and any parse error) from the active mode.
  const { raw, parseError } = useMemo<{
    raw: unknown;
    parseError: string | null;
  }>(() => {
    if (mode === "json") {
      if (!jsonText.trim()) return { raw: null, parseError: null };
      try {
        return { raw: JSON.parse(jsonText), parseError: null };
      } catch (e) {
        return { raw: null, parseError: (e as Error).message };
      }
    }
    if (mode === "pddl") {
      if (!pddlDomain.trim() || !pddlProblem.trim())
        return { raw: null, parseError: null };
      const res = pddlToRaw(pddlDomain, pddlProblem);
      return res.ok
        ? { raw: res.raw, parseError: null }
        : { raw: null, parseError: res.errors.join(" ") };
    }
    const built = {
      name,
      description,
      actions: actions
        .filter((a) => a.name.trim())
        .map((a) => ({
          name: a.name.trim(),
          preconditions: splitAtoms(a.pre),
          addEffects: splitAtoms(a.add),
          delEffects: splitAtoms(a.del),
        })),
      init: splitAtoms(init),
      goals: splitAtoms(goals),
      complementary: complementary
        .split("\n")
        .map((line) => splitAtoms(line))
        .filter((p) => p.length >= 2)
        .map((p) => [p[0], p[1]] as [string, string]),
    };
    return { raw: built, parseError: null };
  }, [
    mode,
    jsonText,
    pddlDomain,
    pddlProblem,
    name,
    description,
    actions,
    init,
    goals,
    complementary,
  ]);

  const result = useMemo(
    () => (raw ? validateProblem(raw, existingIds) : null),
    [raw, existingIds],
  );

  const derivedLiterals = result?.problem?.literals.map((l) => l.id) ?? [];

  // Popup listing which required form fields are still empty.
  const [missingPopup, setMissingPopup] = useState<string[] | null>(null);

  // Required-field check for the form mode (asterisk-marked fields).
  function formMissing(): string[] {
    if (mode !== "form") return [];
    const miss: string[] = [];
    if (!name.trim()) miss.push("Nome");
    if (splitAtoms(init).length === 0) miss.push("Stato iniziale");
    if (splitAtoms(goals).length === 0) miss.push("Goal");
    if (actions.filter((a) => a.name.trim()).length === 0)
      miss.push("Almeno un'azione");
    return miss;
  }

  // Hide the two "missing required" engine errors in the form: they are already
  // signalled by the red asterisks and the submit-time popup.
  const shownErrors = (result?.errors ?? []).filter(
    (e) => mode !== "form" || !e.startsWith("Serve almeno"),
  );

  function updateAction(i: number, patch: Partial<FormAction>) {
    setActions((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }

  function loadFile(file: File) {
    const reader = new FileReader();
    const isPddl = /\.pddl$/i.test(file.name);
    reader.onload = () => {
      const text = String(reader.result);
      if (isPddl) {
        setMode("pddl");
        // route domain vs problem files by their (define (domain|problem ...))
        if (/\(\s*define\s*\(\s*problem/i.test(text)) setPddlProblem(text);
        else setPddlDomain(text);
      } else {
        setMode("json");
        setJsonText(text);
      }
    };
    reader.readAsText(file);
  }

  function loadPddlInto(target: "domain" | "problem", file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      if (target === "domain") setPddlDomain(text);
      else setPddlProblem(text);
    };
    reader.readAsText(file);
  }

  function submit() {
    const miss = formMissing();
    if (miss.length) {
      setMissingPopup(miss);
      return;
    }
    if (result?.ok && result.problem) {
      onAdd(result.problem);
      onClose();
      return;
    }
    // Still invalid for other reasons (dup id, bad atom names, …): surface them.
    if (result && !result.ok) setMissingPopup(result.errors);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Aggiungi problema</h2>
          <button className="collapse-btn" onClick={onClose} title="Chiudi">
            ✕
          </button>
        </header>

        <div className="modal-tabs">
          <button
            className={mode === "form" ? "tab active" : "tab"}
            onClick={() => setMode("form")}
          >
            Form
          </button>
          <button
            className={mode === "json" ? "tab active" : "tab"}
            onClick={() => setMode("json")}
          >
            JSON
          </button>
          <button
            className={mode === "pddl" ? "tab active" : "tab"}
            onClick={() => setMode("pddl")}
          >
            PDDL
          </button>
        </div>

        <div className="modal-body">
          {mode === "json" ? (
            <div className="json-pane">
              <div className="pane-head">
                <p className="hint">
                  Incolla un problema in formato JSON (schema: name, actions[],
                  init[], goals[], opzionale literals[] e complementary[]).
                </p>
                <label className="ghost small file-tab">
                  ⤒ Carica file
                  <input
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) loadFile(f);
                    }}
                  />
                </label>
              </div>
              <textarea
                className="json-area"
                spellCheck={false}
                placeholder={JSON_PLACEHOLDER}
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
              />
              {parseError && (
                <p className="status bad">JSON non valido: {parseError}</p>
              )}
            </div>
          ) : mode === "pddl" ? (
            <div className="pddl-pane">
              <p className="hint">
                Incolla o carica un dominio e un problema PDDL. Sottoinsieme
                supportato: <code>:strips</code>, <code>:typing</code>,{" "}
                <code>:negative-preconditions</code>, <code>:equality</code>. Le
                azioni vengono istanziate (grounding) sugli oggetti dichiarati,
                potate per tipo.
              </p>
              <div className="pddl-grid">
                <div className="pddl-col">
                  <div className="pddl-col-head">
                    <span>Dominio</span>
                    <label className="ghost small file-tab">
                      ⤒ file
                      <input
                        type="file"
                        accept=".pddl"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) loadPddlInto("domain", f);
                        }}
                      />
                    </label>
                  </div>
                  <textarea
                    className="json-area"
                    spellCheck={false}
                    placeholder={PDDL_DOMAIN_PLACEHOLDER}
                    value={pddlDomain}
                    onChange={(e) => setPddlDomain(e.target.value)}
                  />
                </div>
                <div className="pddl-col">
                  <div className="pddl-col-head">
                    <span>Problema</span>
                    <label className="ghost small file-tab">
                      ⤒ file
                      <input
                        type="file"
                        accept=".pddl"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) loadPddlInto("problem", f);
                        }}
                      />
                    </label>
                  </div>
                  <textarea
                    className="json-area"
                    spellCheck={false}
                    placeholder={PDDL_PROBLEM_PLACEHOLDER}
                    value={pddlProblem}
                    onChange={(e) => setPddlProblem(e.target.value)}
                  />
                </div>
              </div>
              {parseError && (
                <p className="status bad">PDDL non valido: {parseError}</p>
              )}
            </div>
          ) : (
            <div className="form-pane">
              <div className="frow">
                <label>
                  Nome <span className="req">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Es. Light Switch"
                />
              </div>
              <div className="frow">
                <label>Descrizione</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Breve descrizione didattica"
                />
              </div>

              <div className="frow">
                <label>
                  Stato iniziale <span className="req">*</span>
                </label>
                <input
                  value={init}
                  onChange={(e) => setInit(e.target.value)}
                  placeholder="es. off, door-closed"
                />
              </div>
              <div className="frow">
                <label>
                  Goal <span className="req">*</span>
                </label>
                <input
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  placeholder="es. on"
                />
              </div>

              <div className="actions-block">
                <div className="ab-head">
                  <span>
                    Azioni <span className="req">*</span>
                  </span>
                  <button
                    className="ghost small"
                    onClick={() => setActions((a) => [...a, { ...EMPTY_ACTION }])}
                  >
                    + azione
                  </button>
                </div>
                {actions.map((a, i) => (
                  <div className="action-card" key={i}>
                    <div className="ac-top">
                      <input
                        className="ac-name"
                        value={a.name}
                        onChange={(e) => updateAction(i, { name: e.target.value })}
                        placeholder={`azione ${i + 1} (nome)`}
                      />
                      {actions.length > 1 && (
                        <button
                          className="ghost small"
                          onClick={() =>
                            setActions((as) => as.filter((_, j) => j !== i))
                          }
                          title="Rimuovi"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="ac-grid">
                      <label>pre</label>
                      <input
                        value={a.pre}
                        onChange={(e) => updateAction(i, { pre: e.target.value })}
                        placeholder="precondizioni"
                      />
                      <label className="add">add</label>
                      <input
                        value={a.add}
                        onChange={(e) => updateAction(i, { add: e.target.value })}
                        placeholder="add effects"
                      />
                      <label className="del">del</label>
                      <input
                        value={a.del}
                        onChange={(e) => updateAction(i, { del: e.target.value })}
                        placeholder="delete effects"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="frow">
                <label>
                  Coppie complementari <small>(opzionale, una per riga)</small>
                </label>
                <textarea
                  className="comp-area"
                  value={complementary}
                  onChange={(e) => setComplementary(e.target.value)}
                  placeholder={"light-on, light-off\ndoor-open, door-closed"}
                />
                <p className="hint tiny">
                  Le mutex strutturali (effetti inconsistenti, interference,
                  competing needs, supporto inconsistente) sono calcolate
                  automaticamente. Qui dichiari solo coppie che si escludono per
                  natura e che il motore non può dedurre.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* live validation */}
        <div className="modal-validation">
          <div className="mv-head">
            <span className="mv-title">Vincoli e validazione</span>
            {result && (
              <span
                className={`mv-badge ${
                  result.ok ? "good" : shownErrors.length ? "bad" : "warn"
                }`}
              >
                {shownErrors.length > 0
                  ? `${shownErrors.length} errori`
                  : result.warnings.length > 0
                    ? `${result.warnings.length} avvisi`
                    : "ok"}
              </span>
            )}
          </div>
          {!result && (
            <p className="hint tiny">
              Compila i campi: qui compaiono in tempo reale i vincoli non
              rispettati (limiti su azioni/letterali/effetti, letterali non
              dichiarati, goal irraggiungibili…).
            </p>
          )}
          {derivedLiterals.length > 0 && (
            <div className="derived">
              <span className="dl-title">
                Letterali rilevati ({derivedLiterals.length}/{LIMITS.literals})
              </span>
              <div className="dl-items">
                {derivedLiterals.map((l) => (
                  <code key={l}>{l}</code>
                ))}
              </div>
            </div>
          )}
          {shownErrors.map((e, i) => (
            <p className="status bad" key={`e${i}`}>
              ⃠ {e}
            </p>
          ))}
          {result?.warnings.map((w, i) => (
            <p className="status warn" key={`w${i}`}>
              ⚠ {w}
            </p>
          ))}
          {result?.ok && (
            <p className="status good">
              ✓ Problema valido — pronto da aggiungere.
            </p>
          )}
        </div>

        <footer className="modal-foot">
          <button className="ghost" onClick={onClose}>
            Annulla
          </button>
          {/* In form mode the button stays enabled so the missing-fields popup
              can fire; JSON/PDDL keep the strict disabled-until-valid behavior. */}
          <button
            className="primary"
            disabled={mode === "form" ? false : !result?.ok}
            onClick={submit}
          >
            Aggiungi e visualizza
          </button>
        </footer>
      </div>

      {missingPopup && (
        <div
          className="popup-backdrop"
          onClick={() => setMissingPopup(null)}
        >
          <div className="popup" onClick={(e) => e.stopPropagation()}>
            <h3>Campi obbligatori mancanti</h3>
            <p className="hint">
              Completa i seguenti campi prima di aggiungere il problema:
            </p>
            <ul className="popup-list">
              {missingPopup.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
            <div className="popup-foot">
              <button className="primary" onClick={() => setMissingPopup(null)}>
                Ho capito
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const JSON_PLACEHOLDER = `{
  "name": "Light Switch",
  "actions": [
    { "name": "turn on",  "preconditions": ["off"], "addEffects": ["on"],  "delEffects": ["off"] },
    { "name": "turn off", "preconditions": ["on"],  "addEffects": ["off"], "delEffects": ["on"] }
  ],
  "init": ["off"],
  "goals": ["on"]
}`;

const PDDL_DOMAIN_PLACEHOLDER = `(define (domain gripper)
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
    :effect (and (at ?b ?r) (free) (not (carry ?b)))))`;

const PDDL_PROBLEM_PLACEHOLDER = `(define (problem gripper-1)
  (:domain gripper)
  (:objects rooma roomb - room  ball1 - ball)
  (:init (at-robot rooma) (at ball1 rooma) (free))
  (:goal (and (at ball1 roomb))))`;
