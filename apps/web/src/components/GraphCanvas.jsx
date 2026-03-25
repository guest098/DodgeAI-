import { useEffect, useMemo, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";

const colorByGroup = {
  "sales-order": { stroke: "#6fa9ff", fill: "#f7fbff" },
  "sales-order-item": { stroke: "#7fb4ff", fill: "#f7fbff" },
  schedule: { stroke: "#86bbff", fill: "#f7fbff" },
  delivery: { stroke: "#6fa9ff", fill: "#f7fbff" },
  "delivery-item": { stroke: "#7fb4ff", fill: "#f7fbff" },
  product: { stroke: "#6fa9ff", fill: "#f7fbff" },
  plant: { stroke: "#7fb4ff", fill: "#f7fbff" },
  storage: { stroke: "#7fb4ff", fill: "#f7fbff" },
  billing: { stroke: "#e48d8d", fill: "#fff7f7" },
  "billing-item": { stroke: "#e48d8d", fill: "#fff7f7" },
  journal: { stroke: "#e48d8d", fill: "#fff7f7" },
  payment: { stroke: "#e48d8d", fill: "#fff7f7" },
  customer: { stroke: "#e48d8d", fill: "#fff7f7" },
  address: { stroke: "#e48d8d", fill: "#fff7f7" },
};

function paletteForNode(node) {
  const group = String(node.group || "").toLowerCase();

  if (group.includes("sales-order-item")) return colorByGroup["sales-order-item"];
  if (group.includes("sales-order")) return colorByGroup["sales-order"];
  if (group.includes("schedule")) return colorByGroup.schedule;
  if (group.includes("delivery-item")) return colorByGroup["delivery-item"];
  if (group.includes("delivery")) return colorByGroup.delivery;
  if (group.includes("billing-item")) return colorByGroup["billing-item"];
  if (group.includes("billing")) return colorByGroup.billing;
  if (group.includes("journal")) return colorByGroup.journal;
  if (group.includes("payment")) return colorByGroup.payment;
  if (group.includes("customer")) return colorByGroup.customer;
  if (group.includes("address")) return colorByGroup.address;
  if (group.includes("plant")) return colorByGroup.plant;
  if (group.includes("storage")) return colorByGroup.storage;
  if (group.includes("product")) return colorByGroup.product;

  return colorByGroup["sales-order"];
}

function nodeIdFromLinkEnd(value) {
  return typeof value === "object" ? value.id : value;
}

function buildDegreeMap(graph) {
  const degreeMap = new Map();
  for (const node of graph.nodes || []) {
    degreeMap.set(node.id, 0);
  }
  for (const link of graph.links || []) {
    const sourceId = nodeIdFromLinkEnd(link.source);
    const targetId = nodeIdFromLinkEnd(link.target);
    degreeMap.set(sourceId, (degreeMap.get(sourceId) || 0) + 1);
    degreeMap.set(targetId, (degreeMap.get(targetId) || 0) + 1);
  }
  return degreeMap;
}

function paletteForDegree(degree) {
  if (degree >= 18) {
    return { stroke: "#3b82f6", fill: "#dbeafe" };
  }
  if (degree >= 10) {
    return { stroke: "#60a5fa", fill: "#eff6ff" };
  }
  if (degree >= 5) {
    return { stroke: "#f59e0b", fill: "#fffbeb" };
  }
  return { stroke: "#ef4444", fill: "#fff1f2" };
}

export function GraphCanvas({
  graph,
  selectedNode,
  highlightedNodeIds,
  isMinimized,
  showGranularOverlay,
  onToggleMinimized,
  onToggleGranularOverlay,
  onNodeSelect,
}) {
  const graphRef = useRef(null);
  const shellRef = useRef(null);
  const hasAutoFitRef = useRef(false);
  const selectedEntries = selectedNode
    ? Object.entries(selectedNode.payload).filter(([, value]) => value !== null && value !== "")
    : [];
  const highlightedSet = new Set(highlightedNodeIds || []);
  const degreeMap = buildDegreeMap(graph);
  const selectedConnectionCount = useMemo(
    () =>
      selectedNode
        ? graph.links.filter(
            (link) =>
              nodeIdFromLinkEnd(link.source) === selectedNode.id ||
              nodeIdFromLinkEnd(link.target) === selectedNode.id,
          ).length
        : 0,
    [graph.links, selectedNode],
  );

  useEffect(() => {
    if (!graphRef.current || isMinimized || !graph.nodes?.length || hasAutoFitRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      graphRef.current?.zoomToFit(400, 48);
      graphRef.current?.centerAt(0, 0, 400);
      hasAutoFitRef.current = true;
    }, 500);

    return () => clearTimeout(timer);
  }, [graph, isMinimized]);

  return (
    <div
      ref={shellRef}
      className={`graph-canvas-shell ${isMinimized ? "is-minimized" : ""} ${
        showGranularOverlay ? "show-overlay" : "hide-overlay"
      }`}
    >
      <div className="graph-toolbar">
        <div className="toolbar-cluster">
          <button type="button" className="icon-expand" onClick={onToggleMinimized}>
            {isMinimized ? "Expand" : "Minimize"}
          </button>
          <button
            type="button"
            className="dark icon-layers"
            onClick={onToggleGranularOverlay}
          >
            {showGranularOverlay ? "Hide Granular Overlay" : "Show Granular Overlay"}
          </button>
        </div>
      </div>
      {isMinimized ? (
        <div className="graph-minimized-state">
          <div className="graph-minimized-title">Graph minimized</div>
          <div className="graph-minimized-copy">
            Expand the graph to continue exploring nodes and relationships.
          </div>
        </div>
      ) : (
      <ForceGraph2D
        ref={graphRef}
        graphData={graph}
        nodeLabel={(node) => `${node.kind}: ${node.label}`}
        minZoom={0.25}
        maxZoom={6}
        enableNodeDrag={false}
        warmupTicks={30}
        linkColor={(link) =>
          selectedNode &&
          (nodeIdFromLinkEnd(link.source) === selectedNode.id ||
            nodeIdFromLinkEnd(link.target) === selectedNode.id)
            ? "rgba(37, 99, 235, 0.95)"
            : showGranularOverlay
              ? "rgba(125, 183, 255, 0.5)"
              : "rgba(125, 183, 255, 0.18)"
        }
        linkWidth={(link) =>
          selectedNode &&
          (nodeIdFromLinkEnd(link.source) === selectedNode.id ||
            nodeIdFromLinkEnd(link.target) === selectedNode.id)
            ? 2.6
            : showGranularOverlay
              ? 1.4
              : 0.7
        }
        onNodeClick={onNodeSelect}
        cooldownTicks={60}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const isSelected = selectedNode?.id === node.id;
          const isHighlighted = highlightedSet.has(node.id);
          const palette = paletteForDegree(degreeMap.get(node.id) || 0);
          const scale = globalScale || 1;
          const radius = (isSelected ? 9 : 4.8) / Math.sqrt(scale);
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
          ctx.fillStyle = isHighlighted
            ? "#0f60ff"
            : palette.fill;
          ctx.fill();
          ctx.lineWidth = isSelected ? 2.2 : 1.2;
          ctx.strokeStyle = isHighlighted
            ? "#0f60ff"
            : palette.stroke;
          ctx.stroke();

          if (isSelected) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius + 5 / Math.sqrt(scale), 0, 2 * Math.PI, false);
            ctx.strokeStyle = "rgba(15, 96, 255, 0.18)";
            ctx.lineWidth = 5 / Math.sqrt(scale);
            ctx.stroke();
          }

          if (!isSelected && isHighlighted) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius + 4 / Math.sqrt(scale), 0, 2 * Math.PI, false);
            ctx.strokeStyle = "rgba(15, 96, 255, 0.22)";
            ctx.lineWidth = 3 / Math.sqrt(scale);
            ctx.stroke();
          }
        }}
      />
      )}
      {selectedNode ? (
        <div className="node-card">
          <h3>{selectedNode.label}</h3>
          <p>Entity: {selectedNode.kind}</p>
          <div className="payload">
            {selectedEntries.slice(0, 12).map(([key, value]) => (
              <div className="payload-row" key={key}>
                <strong>
                  {key}
                  {": "}
                  {String(value ?? "")}
                </strong>
              </div>
            ))}
            <div className="payload-row">
              <span>Additional fields hidden for readability</span>
            </div>
            <div className="payload-row">
              <strong>
                Connections
                {": "}
                {selectedConnectionCount}
              </strong>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
