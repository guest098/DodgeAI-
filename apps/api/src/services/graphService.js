import { getDb } from "../lib/db.js";

function parseNode(row) {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    group: row.groupName,
    refId: row.refId,
    payload: JSON.parse(row.payload),
  };
}

function parseEdge(row) {
  return {
    id: row.id,
    source: row.source,
    target: row.target,
    relationship: row.relationship,
    payload: JSON.parse(row.payload || "{}"),
  };
}

function addNodeId(target, value) {
  if (!value || String(value).includes("undefined") || String(value) === "null") {
    return;
  }
  target.add(String(value));
}

export function getSeedGraph(limit = 80) {
  const db = getDb();
  const seedCustomers = db
    .prepare(
      `
      SELECT soldToParty, COUNT(*) AS billingCount
      FROM billing_document_headers
      WHERE soldToParty IS NOT NULL AND soldToParty != ''
      GROUP BY soldToParty
      ORDER BY billingCount DESC, soldToParty ASC
      LIMIT ?
      `,
    )
    .all(3);

  const customerIds = seedCustomers.map((row) => row.soldToParty);
  if (!customerIds.length) {
    return { nodes: [], links: [] };
  }

  const customerPlaceholders = customerIds.map(() => "?").join(", ");
  const flowRows = db
    .prepare(
      `
      SELECT
        bdh.soldToParty,
        bdh.billingDocument,
        bdh.accountingDocument,
        bdi.billingDocumentItem,
        bdi.material,
        odi.deliveryDocument,
        odi.deliveryDocumentItem,
        odi.plant,
        soi.salesOrder,
        soi.salesOrderItem
      FROM billing_document_headers bdh
      LEFT JOIN billing_document_items bdi
        ON bdi.billingDocument = bdh.billingDocument
      LEFT JOIN outbound_delivery_items odi
        ON odi.deliveryDocument = bdi.referenceSdDocument
       AND odi.deliveryDocumentItem = bdi.referenceSdDocumentItem
      LEFT JOIN sales_order_items soi
        ON soi.salesOrder = odi.referenceSdDocument
       AND soi.salesOrderItem = ltrim(odi.referenceSdDocumentItem, '0')
      WHERE bdh.soldToParty IN (${customerPlaceholders})
      ORDER BY bdh.soldToParty, bdh.billingDocument, bdi.billingDocumentItem
      `,
    )
    .all(...customerIds);

  const selectedIds = new Set();
  for (const row of flowRows) {
    addNodeId(selectedIds, `customer:${row.soldToParty}`);
    addNodeId(selectedIds, `billing:${row.billingDocument}`);
    addNodeId(selectedIds, `billing-item:${row.billingDocument}:${row.billingDocumentItem}`);
    addNodeId(selectedIds, `journal:${row.accountingDocument}`);
    addNodeId(selectedIds, `delivery:${row.deliveryDocument}`);
    addNodeId(selectedIds, `delivery-item:${row.deliveryDocument}:${row.deliveryDocumentItem}`);
    addNodeId(selectedIds, `sales-order:${row.salesOrder}`);
    addNodeId(selectedIds, `sales-order-item:${row.salesOrder}:${row.salesOrderItem}`);
    addNodeId(selectedIds, `product:${row.material}`);
    addNodeId(selectedIds, `plant:${row.plant}`);
  }

  const preferredKinds = [
    "customer:",
    "billing:",
    "journal:",
    "delivery:",
    "sales-order:",
    "product:",
    "plant:",
    "billing-item:",
    "delivery-item:",
    "sales-order-item:",
  ];

  const nodeIds = [...selectedIds]
    .sort((left, right) => {
      const leftIndex = preferredKinds.findIndex((prefix) => left.startsWith(prefix));
      const rightIndex = preferredKinds.findIndex((prefix) => right.startsWith(prefix));
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    })
    .slice(0, limit);
  if (!nodeIds.length) {
    return { nodes: [], links: [] };
  }

  const placeholders = nodeIds.map(() => "?").join(", ");
  const nodes = db
    .prepare(`SELECT * FROM graph_nodes WHERE id IN (${placeholders})`)
    .all(...nodeIds)
    .map(parseNode);
  const links = db
    .prepare(`SELECT * FROM graph_edges WHERE source IN (${placeholders}) AND target IN (${placeholders}) LIMIT 320`)
    .all(...nodeIds, ...nodeIds)
    .map(parseEdge);
  return { nodes, links };
}

export function getNode(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM graph_nodes WHERE id = ?").get(id);
  return row ? parseNode(row) : null;
}

export function getNeighbors(id) {
  const db = getDb();
  const links = db.prepare("SELECT * FROM graph_edges WHERE source = ? OR target = ? LIMIT 100").all(id, id).map(parseEdge);
  const nodeIds = [...new Set(links.flatMap((edge) => [edge.source, edge.target]))];
  if (!nodeIds.length) {
    return { nodes: [], links: [] };
  }
  const placeholders = nodeIds.map(() => "?").join(", ");
  const nodes = db.prepare(`SELECT * FROM graph_nodes WHERE id IN (${placeholders})`).all(...nodeIds).map(parseNode);
  return { nodes, links };
}

export function searchNodes(query, limit = 10) {
  const db = getDb();
  const normalized = `%${query}%`;
  return db
    .prepare(
      `SELECT * FROM graph_nodes
       WHERE label LIKE ? OR refId LIKE ? OR kind LIKE ?
       ORDER BY label ASC
       LIMIT ?`,
    )
    .all(normalized, normalized, normalized, limit)
    .map(parseNode);
}

export function getGraphStats() {
  const db = getDb();
  const nodeCount = db.prepare("SELECT COUNT(*) AS count FROM graph_nodes").get().count;
  const edgeCount = db.prepare("SELECT COUNT(*) AS count FROM graph_edges").get().count;
  const groups = db
    .prepare("SELECT kind, COUNT(*) AS count FROM graph_nodes GROUP BY kind ORDER BY count DESC")
    .all();

  return {
    backend: "sqlite",
    nodeCount,
    edgeCount,
    groups,
  };
}

export function getInitialVisibleNodes(limit = 80) {
  return getSeedGraph(limit);
}

export function traceBillingPathSqlite(billingDocument) {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        bdh.billingDocument,
        bdh.accountingDocument,
        bdi.billingDocumentItem,
        odi.deliveryDocument,
        odi.deliveryDocumentItem,
        soi.salesOrder,
        soi.salesOrderItem,
        je.clearingAccountingDocument
      FROM billing_document_headers bdh
      LEFT JOIN billing_document_items bdi
        ON bdi.billingDocument = bdh.billingDocument
      LEFT JOIN outbound_delivery_items odi
        ON odi.deliveryDocument = bdi.referenceSdDocument
       AND odi.deliveryDocumentItem = bdi.referenceSdDocumentItem
      LEFT JOIN sales_order_items soi
        ON soi.salesOrder = odi.referenceSdDocument
       AND soi.salesOrderItem = ltrim(odi.referenceSdDocumentItem, '0')
      LEFT JOIN journal_entry_items_accounts_receivable je
        ON je.accountingDocument = bdh.accountingDocument
      WHERE bdh.billingDocument = ?
      `,
    )
    .all(billingDocument);

  const nodeIds = [];
  const dedup = new Set();
  const addNodeId = (value) => {
    if (!value || dedup.has(value)) {
      return;
    }
    dedup.add(value);
    nodeIds.push(value);
  };

  for (const row of rows) {
    addNodeId(`sales-order:${row.salesOrder}`);
    addNodeId(`sales-order-item:${row.salesOrder}:${row.salesOrderItem}`);
    addNodeId(`delivery:${row.deliveryDocument}`);
    addNodeId(`delivery-item:${row.deliveryDocument}:${row.deliveryDocumentItem}`);
    addNodeId(`billing:${row.billingDocument}`);
    addNodeId(`billing-item:${row.billingDocument}:${row.billingDocumentItem}`);
    addNodeId(`journal:${row.accountingDocument}`);
    addNodeId(`payment:${row.clearingAccountingDocument}`);
  }

  const validNodeIds = nodeIds.filter((value) => !value.includes("undefined") && !value.endsWith(":null"));
  if (!validNodeIds.length) {
    return { nodes: [], links: [] };
  }

  const placeholders = validNodeIds.map(() => "?").join(", ");
  const nodes = db
    .prepare(`SELECT * FROM graph_nodes WHERE id IN (${placeholders})`)
    .all(...validNodeIds)
    .map(parseNode);
  const links = db
    .prepare(`SELECT * FROM graph_edges WHERE source IN (${placeholders}) AND target IN (${placeholders})`)
    .all(...validNodeIds, ...validNodeIds)
    .map(parseEdge);

  return { nodes, links };
}

export async function traceBillingPath(billingDocument) {
  return traceBillingPathSqlite(billingDocument);
}
