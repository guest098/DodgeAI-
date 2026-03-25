import { Router } from "express";
import {
  getGraphStats,
  getNeighbors,
  getNode,
  getSeedGraph,
  traceBillingPath,
} from "../services/graphService.js";
import { semanticSearch } from "../services/semanticSearchService.js";

export const graphRouter = Router();

graphRouter.get("/stats", (_req, res) => {
  res.json(getGraphStats());
});

graphRouter.get("/seed", (_req, res) => {
  res.json(getSeedGraph());
});

graphRouter.get("/search", (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) {
    res.status(400).json({ error: "q is required" });
    return;
  }
  res.json({ matches: semanticSearch(query) });
});

graphRouter.get("/node/:id", (req, res) => {
  const node = getNode(req.params.id);
  if (!node) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  res.json(node);
});

graphRouter.get("/neighbors/:id", (req, res) => {
  res.json(getNeighbors(req.params.id));
});

graphRouter.get("/trace/billing/:billingDocument", async (req, res) => {
  res.json(await traceBillingPath(req.params.billingDocument));
});
