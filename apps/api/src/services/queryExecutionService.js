import { getDb } from "../lib/db.js";
import { buildCypherQuery, buildSqlQuery } from "./queryBuilder.js";

function collectReferencedNodeIds(plan, rows, semanticMatches) {
  const ids = new Set();

  for (const match of semanticMatches || []) {
    if (match.sourceId) {
      ids.add(match.sourceId);
    }
  }

  for (const entity of plan.entities || []) {
    if (entity.identifier) {
      ids.add(String(entity.identifier));
    }
  }

  for (const row of rows || []) {
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined) {
        continue;
      }
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes("salesorder")) {
        ids.add(`sales-order:${value}`);
      } else if (lowerKey.includes("deliverydocument")) {
        ids.add(`delivery:${value}`);
      } else if (lowerKey.includes("billingdocument")) {
        ids.add(`billing:${value}`);
      } else if (lowerKey.includes("accountingdocument")) {
        ids.add(`journal:${value}`);
      } else if (lowerKey === "product" || lowerKey.includes("material")) {
        ids.add(`product:${value}`);
      } else if (lowerKey.includes("customer") || lowerKey.includes("businesspartner")) {
        ids.add(`customer:${value}`);
      }
    }
  }

  return [...ids]
    .filter(Boolean)
    .map((value) => String(value))
    .map((value) => (value.includes(":") ? value : value));
}

export async function executePlan(plan, semanticMatches = []) {
  if (
    plan.intent === "out_of_domain" ||
    plan.intent === "small_talk" ||
    plan.intent === "clarification" ||
    !plan.query
  ) {
    return {
      target: plan.target,
      queryText: "",
      rows: [],
      referencedNodeIds: [],
    };
  }

  if (plan.target === "graph") {
    throw new Error("Graph execution is not enabled in this build");
  }

  const compiled = buildSqlQuery(plan);
  const rows = getDb().prepare(compiled.text).all(compiled.params);
  return {
    target: "sql",
    queryText: compiled.text,
    params: compiled.params,
    rows,
    referencedNodeIds: collectReferencedNodeIds(plan, rows, semanticMatches),
  };
}
