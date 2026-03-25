function extractLongNumber(question) {
  const match = String(question || "").match(/\b\d{6,}\b/);
  return match ? match[0] : null;
}

function normalize(text) {
  return String(text || "").toLowerCase();
}

export function detectCoreQuestion(question) {
  const text = normalize(question);
  const id = extractLongNumber(question);

  if (
    text.includes("highest number of billing") ||
    text.includes("products are associated with the highest number of billing documents")
  ) {
    return { kind: "plan", plan: makeTopProductsPlan() };
  }

  if (
    (text.includes("trace") || text.includes("full flow")) &&
    text.includes("billing document") &&
    !id
  ) {
    return {
      kind: "clarification",
      message: "Please provide a billing document number so I can trace the full flow from sales order to delivery, billing, and journal entry.",
    };
  }

  if ((text.includes("trace") || text.includes("full flow")) && text.includes("billing") && id) {
    return { kind: "plan", plan: makeTraceBillingPlan(id) };
  }

  if ((text.includes("journal") || text.includes("accounting")) && id) {
    return { kind: "plan", plan: makeJournalLookupPlan(id) };
  }

  if (
    text.includes("broken") ||
    text.includes("incomplete flows") ||
    text.includes("delivered but not billed") ||
    text.includes("billed without delivery")
  ) {
    return { kind: "plan", plan: makeBrokenFlowsPlan() };
  }

  return null;
}

function makeTopProductsPlan() {
  return {
    intent: "top_billed_products",
    entities: [{ name: "products", type: "Product" }],
    filters: [],
    target: "sql",
    answerStyle: "top_ranked_summary",
    query: {
      sql: {
        from: { table: "billing_document_items", alias: "bdi" },
        joins: [
          {
            type: "LEFT",
            table: "products",
            alias: "p",
            on: {
              left: { alias: "bdi", column: "material" },
              right: { alias: "p", column: "product" },
            },
          },
          {
            type: "LEFT",
            table: "product_descriptions",
            alias: "pd",
            on: {
              left: { alias: "p", column: "product" },
              right: { alias: "pd", column: "product" },
            },
          },
        ],
        select: [
          { type: "column", tableAlias: "bdi", column: "material", as: "product" },
          { type: "aggregate", aggregate: "COUNT", tableAlias: "bdi", column: "billingDocument", distinct: true, as: "billingDocumentCount" },
        ],
        groupBy: [{ tableAlias: "bdi", column: "material" }],
        orderBy: [{ expression: "billingDocumentCount", direction: "DESC" }],
        limit: 10,
      },
    },
  };
}

function makeTraceBillingPlan(billingDocument) {
  return {
    intent: "trace_billing_flow",
    entities: [{ name: billingDocument, type: "BillingDocument", identifier: `billing:${billingDocument}` }],
    filters: [{ field: "billingDocument", operator: "=", value: billingDocument }],
    target: "sql",
    answerStyle: "flow_trace",
    query: {
      sql: {
        from: { table: "billing_document_headers", alias: "bdh" },
        joins: [
          {
            type: "LEFT",
            table: "billing_document_items",
            alias: "bdi",
            on: {
              left: { alias: "bdh", column: "billingDocument" },
              right: { alias: "bdi", column: "billingDocument" },
            },
          },
          {
            type: "LEFT",
            table: "outbound_delivery_items",
            alias: "odi",
            on: {
              left: { alias: "bdi", column: "referenceSdDocument" },
              right: { alias: "odi", column: "deliveryDocument" },
            },
          },
          {
            type: "LEFT",
            table: "journal_entry_items_accounts_receivable",
            alias: "je",
            on: {
              left: { alias: "bdh", column: "accountingDocument" },
              right: { alias: "je", column: "accountingDocument" },
            },
          },
        ],
        select: [
          { type: "column", tableAlias: "bdh", column: "billingDocument", as: "billingDocument" },
          { type: "column", tableAlias: "bdi", column: "referenceSdDocument", as: "deliveryDocument" },
          { type: "column", tableAlias: "odi", column: "referenceSdDocument", as: "salesOrder" },
          { type: "column", tableAlias: "bdh", column: "accountingDocument", as: "accountingDocument" },
          { type: "column", tableAlias: "je", column: "clearingAccountingDocument", as: "clearingAccountingDocument" },
        ],
        filters: [{ tableAlias: "bdh", column: "billingDocument", operator: "=", value: billingDocument }],
        limit: 20,
      },
    },
  };
}

function makeJournalLookupPlan(referenceDocument) {
  return {
    intent: "journal_lookup",
    entities: [{ name: referenceDocument, type: "ReferenceDocument" }],
    filters: [{ field: "referenceDocument", operator: "=", value: referenceDocument }],
    target: "sql",
    answerStyle: "linked_identifier",
    query: {
      sql: {
        from: { table: "journal_entry_items_accounts_receivable", alias: "je" },
        select: [
          { type: "column", tableAlias: "je", column: "accountingDocument", as: "accountingDocument" },
          { type: "column", tableAlias: "je", column: "referenceDocument", as: "referenceDocument" },
          { type: "column", tableAlias: "je", column: "customer", as: "customer" },
        ],
        filters: [{ tableAlias: "je", column: "referenceDocument", operator: "=", value: referenceDocument }],
        limit: 10,
      },
    },
  };
}

function makeBrokenFlowsPlan() {
  return {
    intent: "broken_sales_orders",
    entities: [{ name: "sales orders", type: "SalesOrder" }],
    filters: [],
    target: "sql",
    answerStyle: "anomaly_summary",
    query: {
      sql: {
        from: { table: "sales_order_headers", alias: "soh" },
        joins: [
          {
            type: "INNER",
            table: "sales_order_items",
            alias: "soi",
            on: {
              left: { alias: "soh", column: "salesOrder" },
              right: { alias: "soi", column: "salesOrder" },
            },
          },
          {
            type: "LEFT",
            table: "outbound_delivery_items",
            alias: "odi",
            on: {
              left: { alias: "soi", column: "salesOrder" },
              right: { alias: "odi", column: "referenceSdDocument" },
            },
          },
          {
            type: "LEFT",
            table: "billing_document_items",
            alias: "bdi",
            on: {
              left: { alias: "odi", column: "deliveryDocument" },
              right: { alias: "bdi", column: "referenceSdDocument" },
            },
          },
        ],
        select: [
          { type: "column", tableAlias: "soh", column: "salesOrder", as: "salesOrder" },
          { type: "aggregate", aggregate: "COUNT", tableAlias: "soi", column: "rowKey", distinct: true, as: "itemCount" },
          { type: "aggregate", aggregate: "COUNT", tableAlias: "odi", column: "rowKey", distinct: true, as: "deliveryCount" },
          { type: "aggregate", aggregate: "COUNT", tableAlias: "bdi", column: "rowKey", distinct: true, as: "billingCount" },
        ],
        groupBy: [{ tableAlias: "soh", column: "salesOrder" }],
        orderBy: [{ expression: "salesOrder", direction: "ASC" }],
        limit: 50,
      },
    },
  };
}

export function fallbackPlanQuery(question) {
  return detectCoreQuestion(question)?.plan || null;
}
