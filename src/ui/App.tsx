// Three-panel app: left = controls, center = graph canvas, right = explanations.

import { useEffect, useMemo, useRef, useState } from "react";
import { DOMAINS } from "../engine/domains";
import { expandGraph } from "../engine/graphplan";
import { extractPlan } from "../engine/extract";
import { solve } from "../engine/solver";
import { serialize } from "../view/serialize";
import type { Problem } from "../engine/types";
import { GraphCanvas, type Selection, type Toggles } from "./GraphCanvas";
import { ExplanationPanel } from "./ExplanationPanel";
import { ProblemBuilder } from "./ProblemBuilder";

// Deep-link params: ?domain=cake&extract=1&builder=1
const params = new URLSearchParams(
  typeof window !== "undefined" ? window.location.search : "",
);

const CUSTOM_KEY = "mini-graphplan:custom-problems";

function loadCustom(): Problem[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function App() {
  const initialCustom = useRef(loadCustom()).current;
  const [customProblems, setCustomProblems] = useState<Problem[]>(initialCustom);
  const [showBuilder, setShowBuilder] = useState(params.get("builder") === "1");

  const allProblems = useMemo(
    () => [...DOMAINS, ...customProblems],
    [customProblems],
  );
  const lookup = (id: string) => allProblems.find((p) => p.id === id);

  const [domainId, setDomainId] = useState(() => {
    const want = params.get("domain");
    const known = [
      ...DOMAINS.map((d) => d.id),
      ...initialCustom.map((p) => p.id),
    ];
    // No default domain: start on an empty canvas unless a valid ?domain= is given.
    return want && known.includes(want) ? want : "";
  });
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [stepCol, setStepCol] = useState<number>(0); // revealed columns (inclusive)
  const [extracted, setExtracted] = useState(params.get("extract") === "1");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [rightOpen, setRightOpen] = useState(true);
  const [toggles, setToggles] = useState<Toggles>({
    showMutex: true,
    showNoOp: true,
    planOnly: false,
    showDeps: true,
  });

  const problem = useMemo(
    () => (domainId ? lookup(domainId) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [domainId, allProblems],
  );

  // Persist custom problems.
  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(customProblems));
    } catch {
      /* storage full / unavailable — ignore */
    }
  }, [customProblems]);

  function addCustomProblem(p: Problem) {
    setCustomProblems((cs) => [...cs, p]);
    setDomainId(p.id);
  }

  function deleteCurrentCustom() {
    if (!problem?.custom) return;
    setCustomProblems((cs) => cs.filter((c) => c.id !== problem.id));
    setDomainId("");
  }

  function downloadProblem() {
    if (!problem) return;
    const { id, name, description, literals, actions, init, goals, complementary } =
      problem;
    const payload = {
      id,
      name,
      description,
      literals: literals.map((l) => l.id),
      actions: actions.map((a) => ({
        id: a.id,
        name: a.name,
        preconditions: a.preconditions,
        addEffects: a.addEffects,
        delEffects: a.delEffects,
      })),
      init,
      goals,
      ...(complementary ? { complementary } : {}),
    };
    downloadJson(payload, `${id}.problem.json`);
  }

  // Solve = expand-then-extract outer loop. Returns the graph expanded to the
  // solution level (or fullest tried) plus the extraction result. Null when no
  // domain is selected (empty canvas).
  const solved = useMemo(() => (problem ? solve(problem) : null), [problem]);
  const graph = solved?.graph ?? null;
  const goalLevel = solved?.solvedLevel ?? -1;
  const extraction =
    solved && solved.extraction.success ? solved.extraction : null;

  const totalCols = graph
    ? graph.stateLevels.length + graph.actionLevels.length - 1
    : 0;

  // On the first render, reveal the whole graph but honor URL params
  // (?extract=1). On a real domain switch, reset stepping + hide the plan.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      setStepCol(totalCols);
      return;
    }
    setStepCol(totalCols);
    setExtracted(false);
    setSelection(null);
  }, [domainId, totalCols]);

  const vg = useMemo(
    () =>
      graph
        ? serialize(graph, {
            uptoCol: stepCol,
            extraction: extracted ? extraction : null,
          })
        : null,
    [graph, stepCol, extracted, extraction],
  );

  theme === "light"
    ? document.documentElement.setAttribute("data-theme", "light")
    : document.documentElement.removeAttribute("data-theme");

  const goalReachableNow = goalLevel >= 0 && stepCol >= goalLevel * 2;

  // Selecting something always reveals the explanation panel.
  const handleSelect = (s: Selection | null) => {
    setSelection(s);
    if (s) setRightOpen(true);
  };

  return (
    <div className={`app${rightOpen ? "" : " right-collapsed"}`}>
      {/* ---------------- LEFT ---------------- */}
      <aside className="panel left">
        <h1>
          Visual Graphplan
          <span className="sub">
            Solver <span className="author">(by Diego Scirocco)</span>
          </span>
        </h1>

        <section>
          <label className="field-label">Dominio</label>
          <select
            value={domainId}
            onChange={(e) => setDomainId(e.target.value)}
          >
            <option value="">— seleziona un dominio —</option>
            <optgroup label="Demo">
              {DOMAINS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </optgroup>
            {customProblems.length > 0 && (
              <optgroup label="Personalizzati">
                {customProblems.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <p className="desc">
            {problem
              ? problem.description
              : "Nessun dominio selezionato. Scegli una demo o aggiungi un problema."}
          </p>
          <div className="domain-actions">
            <button className="ghost small" onClick={() => setShowBuilder(true)}>
              ＋ Aggiungi problema
            </button>
            {problem && (
              <button
                className="ghost small icon-btn"
                onClick={downloadProblem}
                title="Scarica il problema in JSON"
                aria-label="Scarica JSON"
              >
                ⤓
              </button>
            )}
            {problem?.custom && (
              <button
                className="ghost small icon-btn danger"
                onClick={deleteCurrentCustom}
                title="Elimina questo problema personalizzato"
                aria-label="Elimina problema"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            )}
          </div>
        </section>

        {problem && (
        <>
        <section>
          <div className="kv">
            <span>Stato iniziale</span>
            <code>{problem.init.join(", ")}</code>
          </div>
          <div className="kv">
            <span>Goal</span>
            <code className="goal-code">{problem.goals.join(", ")}</code>
          </div>
        </section>

        <section>
          <label className="field-label">Esecuzione passo-passo</label>
          <div className="stepper">
            <button
              onClick={() => setStepCol((c) => Math.max(0, c - 1))}
              disabled={stepCol <= 0}
            >
              ◀ indietro
            </button>
            <span className="step-readout">
              {colTitle(stepCol)} <small>({stepCol + 1}/{totalCols + 1})</small>
            </span>
            <button
              onClick={() => setStepCol((c) => Math.min(totalCols, c + 1))}
              disabled={stepCol >= totalCols}
            >
              avanti ▶
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={totalCols}
            value={stepCol}
            onChange={(e) => setStepCol(Number(e.target.value))}
          />
          <div className="step-actions">
            <button onClick={() => setStepCol(0)}>⟲ S0</button>
            <button onClick={() => setStepCol(totalCols)}>espandi tutto</button>
          </div>
        </section>

        <section>
          <label className="field-label">Estrazione piano</label>
          <button
            className="primary"
            disabled={!goalReachableNow || !extraction?.success}
            onClick={() => {
              setExtracted(true);
              setToggles((t) => ({ ...t, planOnly: false }));
            }}
          >
            ▷ Estrai piano (backward)
          </button>
          {extracted && (
            <button className="ghost" onClick={() => setExtracted(false)}>
              nascondi piano
            </button>
          )}
          <ExtractStatus
            goalLevel={goalLevel}
            reachableNow={goalReachableNow}
            extraction={extraction}
            graph={graph!}
          />
        </section>
        </>
        )}

        <section>
          <label className="field-label">Viste</label>
          <Toggle
            label="Mostra mutex"
            v={toggles.showMutex}
            set={(v) => setToggles((t) => ({ ...t, showMutex: v }))}
          />
          <Toggle
            label="Mostra no-op"
            v={toggles.showNoOp}
            set={(v) => setToggles((t) => ({ ...t, showNoOp: v }))}
          />
          <Toggle
            label="Mostra dipendenze"
            v={toggles.showDeps}
            set={(v) => setToggles((t) => ({ ...t, showDeps: v }))}
          />
          <Toggle
            label="Solo piano estratto"
            v={toggles.planOnly}
            set={(v) => setToggles((t) => ({ ...t, planOnly: v }))}
          />
        </section>

        <section className="footer-controls">
          <button
            className="ghost"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "☀ light" : "🌙 dark"}
          </button>
          {graph && (
            <button className="ghost" onClick={() => exportJson(graph)}>
              ⤓ Grafo
            </button>
          )}
        </section>

        <Legend />
      </aside>

      {/* ---------------- CENTER ---------------- */}
      <main className="panel center">
        {vg ? (
          <GraphCanvas
            vg={vg}
            toggles={toggles}
            selection={selection}
            onSelect={handleSelect}
          />
        ) : (
          <div className="empty-canvas">
            <div className="empty-card">
              <div className="empty-icon">◇</div>
              <h2>Nessun dominio da visualizzare</h2>
              <p>
                Seleziona un <strong>dominio demo</strong> dal menu a sinistra,
                oppure <strong>aggiungi un problema</strong> (Form, JSON o PDDL)
                per costruire ed esplorare il planning graph passo dopo passo.
              </p>
              <button className="primary" onClick={() => setShowBuilder(true)}>
                ＋ Aggiungi un problema
              </button>
            </div>
          </div>
        )}
        {!rightOpen && (
          <button
            className="reveal-right"
            title="Mostra spiegazioni"
            onClick={() => setRightOpen(true)}
          >
            <span className="reveal-icon">‹</span>
            <span className="reveal-text">Spiegazioni</span>
          </button>
        )}
      </main>

      {/* ---------------- RIGHT ---------------- */}
      <aside className="panel right">
        <div className="right-head">
          <button
            className="collapse-btn"
            title="Nascondi pannello"
            onClick={() => setRightOpen(false)}
          >
            ›
          </button>
        </div>
        {graph && vg ? (
          <ExplanationPanel
            graph={graph}
            vg={vg}
            selection={selection}
            extraction={extracted ? extraction : null}
            goalLevel={goalLevel}
          />
        ) : (
          <div className="panel-empty">
            <p>
              Le spiegazioni compaiono qui una volta selezionato un dominio.
            </p>
          </div>
        )}
      </aside>

      {showBuilder && (
        <ProblemBuilder
          existingIds={allProblems.map((p) => p.id)}
          onAdd={addCustomProblem}
          onClose={() => setShowBuilder(false)}
        />
      )}
    </div>
  );
}

function colTitle(col: number): string {
  const idx = Math.floor(col / 2);
  return col % 2 === 0 ? `S${idx}` : `A${idx}`;
}

function Toggle({
  label,
  v,
  set,
}: {
  label: string;
  v: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ExtractStatus({
  goalLevel,
  reachableNow,
  extraction,
  graph,
}: {
  goalLevel: number;
  reachableNow: boolean;
  extraction: ReturnType<typeof extractPlan> | null;
  graph: ReturnType<typeof expandGraph>;
}) {
  if (goalLevel < 0) {
    const leveled = graph.leveledOffAt >= 0;
    return (
      <p className="status bad">
        I goal non sono raggiungibili.
        {leveled
          ? ` Il grafo si è livellato a S${graph.leveledOffAt}: problema irrisolvibile.`
          : ""}
      </p>
    );
  }
  if (!reachableNow) {
    return (
      <p className="status warn">
        Goal raggiungibili a S{goalLevel}. Espandi fino a quel livello per estrarre.
      </p>
    );
  }
  if (extraction?.success) {
    const steps = extraction.plan.filter((l) => l.length).length;
    return (
      <p className="status good">
        Piano estraibile a S{goalLevel} ({steps} passi azione).
      </p>
    );
  }
  return <p className="status warn">{extraction?.message}</p>;
}

function Legend() {
  return (
    <section className="legend">
      <label className="field-label">Legenda</label>
      <div className="legend-row"><span className="chip state" /> proposizione</div>
      <div className="legend-row"><span className="chip action" /> azione</div>
      <div className="legend-row"><span className="chip noop" /> no-op (persistenza)</div>
      <div className="legend-row"><span className="chip goal" /> goal</div>
      <div className="legend-row"><span className="chip planc" /> nel piano</div>
      <div className="legend-row"><span className="mutex-line" /> mutex</div>
    </section>
  );
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJson(graph: ReturnType<typeof expandGraph>) {
  downloadJson(graph, "planning-graph.json");
}
