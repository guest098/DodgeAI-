import { useEffect, useState } from "react";
import {
  askQuestionStream,
  fetchNeighbors,
  fetchSeedGraph,
} from "./api.js";
import { GraphCanvas } from "./components/GraphCanvas.jsx";
import { ChatPanel } from "./components/ChatPanel.jsx";
import logoUrl from "./assets/dodge-logo.svg";

function mergeGraph(current, incoming) {
  const nodeMap = new Map(current.nodes.map((node) => [node.id, node]));
  const linkMap = new Map(current.links.map((link) => [link.id, link]));

  for (const node of incoming.nodes || []) {
    nodeMap.set(node.id, node);
  }
  for (const link of incoming.links || []) {
    linkMap.set(link.id, link);
  }

  return {
    nodes: [...nodeMap.values()],
    links: [...linkMap.values()],
  };
}

export default function App() {
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showGranularOverlay, setShowGranularOverlay] = useState(true);
  const [isAsking, setIsAsking] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hi! I can help you analyze the Order to Cash process.",
    },
  ]);

  useEffect(() => {
    fetchSeedGraph()
      .then(setGraph)
      .catch(() => {
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: "The graph is not ready yet. Run the ingestion command first.",
          },
        ]);
      });
  }, []);

  async function handleNodeSelect(node) {
    setSelectedNode(node);
    const neighborhood = await fetchNeighbors(node.id);
    setGraph((current) => mergeGraph(current, neighborhood));
  }

  async function handleAsk(question) {
    if (isAsking) {
      return;
    }
    setIsAsking(true);
    setMessages((current) => [...current, { role: "user", content: question }]);
    const assistantIndex = messages.length + 1;

    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        content: "",
        meta: {
          streaming: true,
          rows: [],
          referencedNodeIds: [],
        },
      },
    ]);

    askQuestionStream({
      question,
      sessionId,
      onReady: (result) => {
        if (result.sessionId) {
          setSessionId(result.sessionId);
        }
        setHighlightedNodeIds(result.referencedNodeIds || []);
        setMessages((current) =>
          current.map((message, index) =>
            index === assistantIndex
              ? {
                  ...message,
                  meta: {
                    intent: result.intent,
                    target: result.target,
                    rows: result.rows?.slice(0, 5) || [],
                    referencedNodeIds: result.referencedNodeIds || [],
                    streaming: true,
                  },
                }
              : message,
          ),
        );
      },
      onToken: (token) => {
        setMessages((current) =>
          current.map((message, index) =>
            index === assistantIndex
              ? {
                  ...message,
                  content: `${message.content || ""}${token}`,
                }
              : message,
          ),
        );
      },
      onDone: (answer) => {
        setMessages((current) =>
          current.map((message, index) =>
            index === assistantIndex
              ? {
                  ...message,
                  content: answer || message.content,
                  meta: {
                    ...(message.meta || {}),
                    streaming: false,
                  },
                }
              : message,
          ),
        );
        setIsAsking(false);
      },
      onError: (error) => {
        setMessages((current) =>
          current.map((message, index) =>
            index === assistantIndex
              ? {
                  ...message,
                  content:
                    message.content ||
                    `Request failed: ${typeof error === "string" ? error : "Request failed while waiting for the assistant response."}`,
                  meta: {
                    ...(message.meta || {}),
                    streaming: false,
                  },
                }
              : message,
          ),
        );
        setIsAsking(false);
      },
    });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="sidebar-toggle">
          <img src={logoUrl} alt="" aria-hidden="true" className="brand-icon" />
        </div>
        <div className="divider" />
        <div className="crumbs">
          <span className="crumbs-muted">Mapping</span>
          <span className="crumbs-muted">/</span>
          <span className="crumbs-strong">Order to Cash</span>
        </div>
      </header>
      <main className="content-grid">
        <section className="graph-zone">
          <section className="graph-panel">
            <GraphCanvas
              graph={graph}
              selectedNode={selectedNode}
              highlightedNodeIds={highlightedNodeIds}
              isMinimized={isMinimized}
              showGranularOverlay={showGranularOverlay}
              onToggleMinimized={() => setIsMinimized((current) => !current)}
              onToggleGranularOverlay={() =>
                setShowGranularOverlay((current) => !current)
              }
              onNodeSelect={handleNodeSelect}
            />
          </section>
        </section>
        <aside className="chat-panel">
          <ChatPanel
            logoUrl={logoUrl}
            isAsking={isAsking}
            messages={messages}
            onAsk={handleAsk}
          />
        </aside>
      </main>
    </div>
  );
}
