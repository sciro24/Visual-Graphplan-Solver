// Center panel: deterministic level-based rendering of the planning graph.
// Causal edges drawn as SVG bezier curves; mutex edges as dashed red arcs.
// Nodes are absolutely positioned HTML for crisp text + easy interaction.

import { useMemo, type MouseEvent } from "react";
import type {
  VisualEdge,
  VisualGraph,
  VisualNode,
} from "../view/serialize";

const NODE_W = 150;
const NODE_H = 30;

export interface Selection {
  type: "node" | "edge";
  id: string;
}

interface Props {
  vg: VisualGraph;
  toggles: Toggles;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
}

export interface Toggles {
  showMutex: boolean;
  showNoOp: boolean;
  planOnly: boolean;
  showDeps: boolean;
}

export function GraphCanvas({ vg, toggles, selection, onSelect }: Props) {
  const nodeById = useMemo(() => {
    const m = new Map<string, VisualNode>();
    for (const n of vg.nodes) m.set(n.id, n);
    return m;
  }, [vg]);

  const visibleNodes = vg.nodes.filter((n) => {
    if (toggles.planOnly && !n.inPlan && n.kind === "action") return false;
    if (!toggles.showNoOp && n.isNoOp) return false;
    return true;
  });
  const visibleIds = new Set(visibleNodes.map((n) => n.id));

  const visibleEdges = vg.edges.filter((e) => {
    if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) return false;
    const isMutex = e.kind === "mutex-action" || e.kind === "mutex-prop";
    if (isMutex) return toggles.showMutex;
    if (e.kind === "del") return false;
    if (!toggles.showDeps && !isMutex) {
      // when deps hidden, keep only edges touching plan nodes
      const a = nodeById.get(e.from);
      const b = nodeById.get(e.to);
      if (!(a?.inPlan || b?.inPlan)) return false;
    }
    if (toggles.planOnly && !isMutex) {
      const a = nodeById.get(e.from);
      const b = nodeById.get(e.to);
      if (!(a?.inPlan && b?.inPlan)) return false;
    }
    return true;
  });

  return (
    <div className="canvas-wrap">
      <div
        className="canvas"
        style={{ width: vg.width, height: vg.height }}
        onClick={() => onSelect(null)}
      >
        {/* column headers + bands */}
        {vg.columns.map((c) => (
          <div
            key={c.col}
            className={`col-band ${c.kind}`}
            style={{ left: nodeXForCol(vg, c.col) - 16, width: NODE_W + 32 }}
          >
            <div className="col-head">
              <span className="col-title">{c.title}</span>
              {c.leveledOff && <span className="leveloff">leveled-off</span>}
              <div className="col-meta">
                {c.kind === "state" ? (
                  <>
                    <span>{c.propCount} prop</span>
                    <span>{c.mutexCount} mutex</span>
                    {(c.goalsPresent ?? 0) > 0 && (
                      <span className="goal-meta">
                        goal {c.goalsPresent}
                        {(c.goalsBlocked ?? 0) > 0 ? ` · ${c.goalsBlocked} bloccati` : " ok"}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span>{c.actionCount} act</span>
                    <span>{c.mutexCount} mutex</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* edges */}
        <svg className="edges" width={vg.width} height={vg.height}>
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="arrowhead" />
            </marker>
          </defs>
          {visibleEdges.map((e) => (
            <EdgePath
              key={e.id}
              edge={e}
              from={nodeById.get(e.from)!}
              to={nodeById.get(e.to)!}
              selected={selection?.type === "edge" && selection.id === e.id}
              onSelect={onSelect}
            />
          ))}
        </svg>

        {/* nodes */}
        {visibleNodes.map((n) => (
          <NodeView
            key={n.id}
            node={n}
            selected={selection?.type === "node" && selection.id === n.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function nodeXForCol(vg: VisualGraph, col: number): number {
  const n = vg.nodes.find((x) => x.col === col);
  return n ? n.x : 0;
}

function NodeView({
  node,
  selected,
  onSelect,
}: {
  node: VisualNode;
  selected: boolean;
  onSelect: (s: Selection) => void;
}) {
  const cls = [
    "node",
    node.kind,
    node.isNoOp ? "noop" : "",
    node.isGoal ? "goal" : "",
    node.inPlan ? "in-plan" : "",
    selected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls}
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
      onClick={(ev) => {
        ev.stopPropagation();
        onSelect({ type: "node", id: node.id });
      }}
      title={node.label}
    >
      {node.isNoOp && <span className="noop-icon">↻</span>}
      <span className="node-label">{node.label}</span>
    </div>
  );
}

function EdgePath({
  edge,
  from,
  to,
  selected,
  onSelect,
}: {
  edge: VisualEdge;
  from: VisualNode;
  to: VisualNode;
  selected: boolean;
  onSelect: (s: Selection) => void;
}) {
  const isMutex = edge.kind === "mutex-action" || edge.kind === "mutex-prop";
  if (isMutex) {
    // vertical dashed arc within a column
    const x = from.x + NODE_W + 6;
    const y1 = from.y + NODE_H / 2;
    const y2 = to.y + NODE_H / 2;
    const midY = (y1 + y2) / 2;
    const bulge = Math.min(60, 18 + Math.abs(y2 - y1) * 0.25);
    const d = `M ${from.x + NODE_W} ${y1} C ${x + bulge} ${y1}, ${x + bulge} ${y2}, ${to.x + NODE_W} ${y2}`;
    const pick = (ev: MouseEvent) => {
      ev.stopPropagation();
      onSelect({ type: "edge", id: edge.id });
    };
    return (
      <g className="mutex-group" data-mid={midY}>
        {/* wide invisible hit area so the arc is easy to hover/click */}
        <path d={d} className="edge mutex-hit" onClick={pick} />
        <path
          d={d}
          className={`edge mutex ${selected ? "sel" : ""}`}
          onClick={pick}
        />
      </g>
    );
  }
  // causal edge: from right edge of `from` to left edge of `to`
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const dx = (x2 - x1) * 0.5;
  const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  const cls = `edge ${edge.kind} ${from.inPlan && to.inPlan ? "plan" : ""}`;
  return <path d={d} className={cls} markerEnd="url(#arrow)" />;
}
