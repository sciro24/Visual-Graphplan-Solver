// Module E — Explanation layer. Renders contextual, formal-but-readable
// explanations that stay consistent with the current selection and algorithm
// state.

import type { ExtractionResult, PlanningGraph } from "../engine/types";
import type { Selection } from "./GraphCanvas";
import type { VisualGraph } from "../view/serialize";

interface Props {
  graph: PlanningGraph;
  vg: VisualGraph;
  selection: Selection | null;
  extraction: ExtractionResult | null;
  goalLevel: number;
}

export function ExplanationPanel({
  graph,
  vg,
  selection,
  extraction,
  goalLevel,
}: Props) {
  if (selection?.type === "edge") {
    const edge = vg.edges.find((e) => e.id === selection.id);
    if (edge?.explanation) {
      return (
        <div className="explain">
          <h2>Mutex · {reasonLabel(edge.reason)}</h2>
          <p className="formal">{edge.explanation}</p>
          <Glossary reason={edge.reason} />
        </div>
      );
    }
  }

  if (selection?.type === "node") {
    const node = vg.nodes.find((n) => n.id === selection.id);
    if (node?.kind === "action") {
      const act = graph.actionsById[node.refId];
      return (
        <div className="explain">
          <h2>{act.isNoOp ? "No-op · persistenza" : "Azione"}</h2>
          <h3>{act.name}</h3>
          {act.isNoOp ? (
            <p className="formal">
              Azione di persistenza sintetizzata: trasporta il letterale{" "}
              <code>{act.noOpLiteral}</code> al livello successivo se nessuna
              azione lo cancella.
            </p>
          ) : null}
          <DefList title="Precondizioni" items={act.preconditions} />
          <DefList title="Add effects" items={act.addEffects} tone="add" />
          <DefList title="Del effects" items={act.delEffects} tone="del" />
        </div>
      );
    }
    if (node?.kind === "state") {
      const { level } = parseStateId(node.id);
      const supporters = supportersOf(graph, level, node.refId);
      return (
        <div className="explain">
          <h2>Proposizione</h2>
          <h3>
            <code>{node.refId}</code>
            {node.isGoal && <span className="goal-tag">goal</span>}
          </h3>
          <p className="formal">
            Presente al livello <strong>S{level}</strong>.
          </p>
          {level === 0 ? (
            <p className="formal">Fa parte dello stato iniziale.</p>
          ) : (
            <DefList
              title={`Supportata da (in A${level - 1})`}
              items={supporters.map((a) => graph.actionsById[a]?.name ?? a)}
            />
          )}
        </div>
      );
    }
  }

  // default: algorithm overview + plan
  return (
    <div className="explain">
      <h2>Stato dell'algoritmo</h2>
      <ul className="algo-state">
        <li>
          Livelli stato: <strong>{graph.stateLevels.length}</strong>
        </li>
        <li>
          Livelli azione: <strong>{graph.actionLevels.length}</strong>
        </li>
        <li>
          Goal: <code>{graph.goals.join(", ")}</code>
        </li>
        <li>
          Primo livello con goal test OK:{" "}
          <strong>{goalLevel >= 0 ? `S${goalLevel}` : "—"}</strong>
        </li>
        <li>
          Level-off:{" "}
          <strong>
            {graph.leveledOffAt >= 0 ? `S${graph.leveledOffAt}` : "no"}
          </strong>
        </li>
      </ul>

      {extraction?.success ? (
        <>
          <h3>Piano estratto</h3>
          <ol className="plan-steps">
            {extraction.plan.map((layer, i) =>
              layer.length ? (
                <li key={i}>
                  {layer.map((a) => graph.actionsById[a]?.name ?? a).join(" ∥ ")}
                </li>
              ) : null,
            )}
          </ol>
          <h3>Regressione backward</h3>
          <div className="regression">
            {extraction.steps.map((s, i) => (
              <div className="reg-step" key={i}>
                <div className="reg-head">
                  S{s.level} → A{s.level - 1}
                </div>
                <div className="reg-body">
                  <div>
                    <span className="reg-k">goal</span>{" "}
                    {s.goalSet.join(", ")}
                  </div>
                  <div>
                    <span className="reg-k">azioni</span>{" "}
                    {s.chosenActions
                      .map((a) => graph.actionsById[a]?.name ?? a)
                      .join(", ")}
                  </div>
                  <div>
                    <span className="reg-k">subgoal</span>{" "}
                    {s.inducedSubgoals.join(", ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="hint">
          Seleziona un nodo o una linea mutex per la spiegazione formale. Usa lo
          stepper per costruire il grafo livello per livello, poi “Estrai piano”.
        </p>
      )}
    </div>
  );
}

function DefList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone?: "add" | "del";
}) {
  return (
    <div className="deflist">
      <span className="dl-title">{title}</span>
      {items.length ? (
        <div className={`dl-items ${tone ?? ""}`}>
          {items.map((x) => (
            <code key={x}>{x}</code>
          ))}
        </div>
      ) : (
        <em>—</em>
      )}
    </div>
  );
}

function Glossary({ reason }: { reason?: string }) {
  const map: Record<string, string> = {
    "inconsistent-effects":
      "Effetti inconsistenti: due azioni sono mutex se una nega (delete) ciò che l'altra produce (add).",
    interference:
      "Interferenza: un'azione cancella una precondizione dell'altra.",
    "competing-needs":
      "Competing needs: le azioni richiedono precondizioni che sono già mutex al livello precedente.",
    negation: "Negazione: due letterali complementari non possono coesistere.",
    "inconsistent-support":
      "Supporto inconsistente: ogni coppia di azioni che li produrrebbe è mutex.",
  };
  if (!reason || !map[reason]) return null;
  return <p className="glossary">{map[reason]}</p>;
}

function reasonLabel(reason?: string): string {
  const m: Record<string, string> = {
    "inconsistent-effects": "effetti inconsistenti",
    interference: "interferenza",
    "competing-needs": "competing needs",
    negation: "negazione",
    "inconsistent-support": "supporto inconsistente",
  };
  return (reason && m[reason]) || "mutex";
}

function parseStateId(id: string): { level: number; lit: string } {
  const [head, ...rest] = id.split(":");
  return { level: Number(head.slice(1)), lit: rest.join(":") };
}

function supportersOf(
  graph: PlanningGraph,
  stateLevel: number,
  lit: string,
): string[] {
  const al = graph.actionLevels[stateLevel - 1];
  if (!al) return [];
  return al.actions.filter((aid) =>
    graph.actionsById[aid]?.addEffects.includes(lit),
  );
}
