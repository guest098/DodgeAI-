import { createChatCompletion, streamChatCompletion } from "./llmService.js";

function buildUserPrompt({ question, plan, execution, history }) {
  return `
QUESTION
${question}

PLANNER OUTPUT
${JSON.stringify({
  intent: plan.intent,
  target: plan.target,
  entities: plan.entities,
  filters: plan.filters,
}, null, 2)}

EXECUTED QUERY
${execution.queryText}

QUERY PARAMETERS
${JSON.stringify(execution.params || {}, null, 2)}

RESULT ROWS
${JSON.stringify(execution.rows.slice(0, 8), null, 2)}

RECENT HISTORY
${JSON.stringify(history.slice(-4), null, 2)}

Write a concise answer grounded only in the result rows.
Use natural business language, not raw database phrasing.
If there is a single exact match, answer with one clean sentence.
If the user asks for a linked identifier or document number, prefer:
"The <entity> linked to <reference> is <value>."
If the user asks for a trace or flow, describe it as a short ordered sequence.
If the result shows a tie for the top rank, explicitly say it is a tie and list all tied entities visible in the result rows.
If there are no rows, clearly say that no matching records were found.
Never fabricate facts.
`;
}

const SYSTEM_PROMPT = `
You are an SAP order-to-cash analytics assistant.
Answer only using the executed query results.
Be concise, direct, and dataset-grounded.
Prefer polished business sentences over raw values.
`;

function deterministicFallbackAnswer({ question, plan, execution }) {
  if (
    (plan.intent === "journal_lookup" || plan.answerStyle === "linked_identifier") &&
    execution.rows?.length
  ) {
    const first = execution.rows[0];
    return `The journal entry number linked to billing document ${first.referenceDocument} is ${first.accountingDocument}.`;
  }

  if (
    (plan.intent === "trace_billing_flow" || plan.answerStyle === "flow_trace") &&
    execution.rows?.length
  ) {
    const first = execution.rows[0];
    return `Billing document ${first.billingDocument} links to delivery ${first.deliveryDocument || "not found"}, sales order ${first.salesOrder || "not found"}, and journal entry ${first.accountingDocument || "not found"}.`;
  }

  if (
    (plan.intent === "broken_sales_orders" || plan.answerStyle === "anomaly_summary") &&
    execution.rows?.length
  ) {
    const broken = execution.rows.filter(
      (row) =>
        Number(row.deliveryCount || 0) === 0 ||
        Number(row.billingCount || 0) === 0 ||
        Number(row.billingCount || 0) < Number(row.deliveryCount || 0),
    );
    if (!broken.length) {
      return "I did not find sales orders with broken or incomplete flows in the current dataset.";
    }
    const sample = broken
      .slice(0, 5)
      .map((row) => row.salesOrder)
      .join(", ");
    return `I found ${broken.length} sales orders with broken or incomplete flows. Example sales orders include ${sample}.`;
  }

  if (
    (plan.intent === "top_billed_products" || plan.answerStyle === "top_ranked_summary") &&
    execution.rows?.length
  ) {
    const topCount = execution.rows[0].billingDocumentCount;
    const leaders = execution.rows
      .filter((row) => row.billingDocumentCount === topCount)
      .map((row) => row.product);
    if (leaders.length > 1) {
      return `The highest number of billing documents is ${topCount}, shared by products ${leaders.join(" and ")}.`;
    }
    return `The product ${leaders[0]} is linked to the highest number of billing documents, with ${topCount} documents.`;
  }

  if (!execution.rows?.length) {
    const numericId = String(question).match(/\b\d{6,}\b/)?.[0];
    if (numericId && plan.intent === "trace_billing_flow") {
      return `No matching records were found for billing document ${numericId}.`;
    }
  }

  return null;
}

export async function synthesizeAnswer({ question, plan, execution, history }) {
  if (plan.intent === "small_talk") {
    return "Hi! I can help you explore the SAP order-to-cash dataset. Ask about orders, deliveries, billing documents, journal entries, payments, customers, products, or broken process flows.";
  }

  if (plan.intent === "clarification") {
    return "Please provide the business document or entity you want me to analyze so I can query the SAP order-to-cash dataset.";
  }

  const fallback = deterministicFallbackAnswer({ question, plan, execution });
  if (fallback) {
    return fallback;
  }
  return createChatCompletion({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt({ question, plan, execution, history }),
    temperature: 0.1,
  });
}

export async function streamSynthesizedAnswer({
  question,
  plan,
  execution,
  history,
  onToken,
}) {
  if (plan.intent === "small_talk") {
    onToken(
      "Hi! I can help you explore the SAP order-to-cash dataset. Ask about orders, deliveries, billing documents, journal entries, payments, customers, products, or broken process flows.",
    );
    return;
  }

  if (plan.intent === "clarification") {
    onToken(
      "Please provide the business document or entity you want me to analyze so I can query the SAP order-to-cash dataset.",
    );
    return;
  }

  const fallback = deterministicFallbackAnswer({ question, plan, execution });
  if (fallback) {
    onToken(fallback);
    return;
  }
  return streamChatCompletion({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt({ question, plan, execution, history }),
    temperature: 0.1,
    onToken,
  });
}
