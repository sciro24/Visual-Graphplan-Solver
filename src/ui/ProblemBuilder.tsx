// Modal to add a custom problem, either by uploading/pasting JSON or by
// filling a smart form. Mutexes stay automatic (computed by the engine); the
// user only optionally declares complementary literal pairs. Everything is
// validated through engine/validate before it can be added.

import { useMemo, useState } from "react";
import { LIMITS, validateProblem } from "../engine/validate";
import type { Problem } from "../engine/types";

interface Props {
  existingIds: string[];
  onAdd: (p: Problem) => void;
  onClose: () => void;
}

type Mode = "form" | "json";

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

  // Build a raw problem (and any JSON parse error) from the active mode.
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
  }, [mode, jsonText, name, description, actions, init, goals, complementary]);

  const result = useMemo(
    () => (raw ? validateProblem(raw, existingIds) : null),
    [raw, existingIds],
  );

  const derivedLiterals = result?.problem?.literals.map((l) => l.id) ?? [];

  function updateAction(i: number, patch: Partial<FormAction>) {
    setActions((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }

  function loadFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setMode("json");
      setJsonText(String(reader.result));
    };
    reader.readAsText(file);
  }

  function submit() {
    if (result?.ok && result.problem) {
      onAdd(result.problem);
      onClose();
    }
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
          <label className="tab file-tab">
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

        <div className="modal-body">
          {mode === "json" ? (
            <div className="json-pane">
              <p className="hint">
                Incolla un problema in formato JSON (schema: name, actions[],
                init[], goals[], opzionale literals[] e complementary[]).
              </p>
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
          ) : (
            <div className="form-pane">
              <div className="frow">
                <label>Nome</label>
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
                <label>Stato iniziale</label>
                <input
                  value={init}
                  onChange={(e) => setInit(e.target.value)}
                  placeholder="es. off, door-closed"
                />
              </div>
              <div className="frow">
                <label>Goal</label>
                <input
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  placeholder="es. on"
                />
              </div>

              <div className="actions-block">
                <div className="ab-head">
                  <span>Azioni</span>
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
          {result?.errors.map((e, i) => (
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
          <button className="primary" disabled={!result?.ok} onClick={submit}>
            Aggiungi e visualizza
          </button>
        </footer>
      </div>
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
