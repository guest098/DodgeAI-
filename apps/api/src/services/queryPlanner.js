import {
  createJsonObjectChatCompletion,
} from "./llmService.js";
import { schemaSummaryForPrompt } from "./schemaCatalog.js";

const QUERY_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "entities", "filters", "target", "query", "answerStyle"],
  properties: {
    intent: { type: "string" },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "type"],
        properties: {
          name: { type: "string" },
          type: { type: "string" },
          identifier: { type: "string" },
        },
      },
    },
    filters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "operator"],
        properties: {
          field: { type: "string" },
          operator: { type: "string" },
          value: {
            anyOf: [
              { type: "string" },
              { type: "number" },
              { type: "boolean" },
              { type: "array", items: { type: ["string", "number", "boolean"] } },
              { type: "null" },
            ],
          },
        },
      },
    },
    target: {
      type: "string",
      enum: ["sql", "graph"],
    },
    answerStyle: { type: "string" },
    query: {
      type: "object",
      additionalProperties: false,
      properties: {
        sql: {
          type: "object",
          additionalProperties: false,
          required: ["from", "select"],
          properties: {
            from: {
              type: "object",
              additionalProperties: false,
              required: ["table", "alias"],
              properties: {
                table: { type: "string" },
                alias: { type: "string" },
              },
            },
            joins: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["table", "alias", "on"],
                properties: {
                  type: { type: "string" },
                  table: { type: "string" },
                  alias: { type: "string" },
                  on: {
                    type: "object",
                    additionalProperties: false,
                    required: ["left", "right"],
                    properties: {
                      left: {
                        type: "object",
                        additionalProperties: false,
                        required: ["alias", "column"],
                        properties: {
                          alias: { type: "string" },
                          column: { type: "string" },
                        },
                      },
                      right: {
                        type: "object",
                        additionalProperties: false,
                        required: ["alias", "column"],
                        properties: {
                          alias: { type: "string" },
                          column: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
            select: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["type"],
                properties: {
                  type: { type: "string", enum: ["column", "aggregate"] },
                  tableAlias: { type: "string" },
                  column: { type: "string" },
                  aggregate: { type: "string" },
                  distinct: { type: "boolean" },
                  as: { type: "string" },
                },
              },
            },
            filters: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["tableAlias", "column", "operator"],
                properties: {
                  tableAlias: { type: "string" },
                  column: { type: "string" },
                  operator: { type: "string" },
                  value: {
                    anyOf: [
                      { type: "string" },
                      { type: "number" },
                      { type: "boolean" },
                      { type: "array", items: { type: ["string", "number", "boolean"] } },
                      { type: "null" },
                    ],
                  },
                },
              },
            },
            groupBy: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["tableAlias", "column"],
                properties: {
                  tableAlias: { type: "string" },
                  column: { type: "string" },
                },
              },
            },
            orderBy: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  tableAlias: { type: "string" },
                  column: { type: "string" },
                  expression: { type: "string" },
                  direction: { type: "string" },
                },
              },
            },
            limit: { type: "number" },
          },
        },
        cypher: {
          type: "object",
          additionalProperties: false,
          properties: {
            start: {
              type: "object",
              additionalProperties: false,
              required: ["alias", "label"],
              properties: {
                alias: { type: "string" },
                label: { type: "string" },
                filters: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["property", "operator"],
                    properties: {
                      property: { type: "string" },
                      operator: { type: "string" },
                      value: {
                        anyOf: [
                          { type: "string" },
                          { type: "number" },
                          { type: "boolean" },
                          { type: "array", items: { type: ["string", "number", "boolean"] } },
                          { type: "null" },
                        ],
                      },
                    },
                  },
                },
              },
            },
            traversals: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["fromAlias", "toAlias", "direction"],
                properties: {
                  fromAlias: { type: "string" },
                  toAlias: { type: "string" },
                  toLabel: { type: "string" },
                  direction: { type: "string" },
                  relationship: { type: "string" },
                  relAlias: { type: "string" },
                  minHops: { type: "number" },
                  maxHops: { type: "number" },
                },
              },
            },
            where: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["alias", "property", "operator"],
                properties: {
                  alias: { type: "string" },
                  property: { type: "string" },
                  operator: { type: "string" },
                  value: {
                    anyOf: [
                      { type: "string" },
                      { type: "number" },
                      { type: "boolean" },
                      { type: "array", items: { type: ["string", "number", "boolean"] } },
                      { type: "null" },
                    ],
                  },
                },
              },
            },
            return: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["type", "alias", "as"],
                properties: {
                  type: { type: "string", enum: ["property", "aggregate"] },
                  alias: { type: "string" },
                  property: { type: "string" },
                  aggregate: { type: "string" },
                  as: { type: "string" },
                },
              },
            },
            orderBy: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["expression"],
                properties: {
                  expression: { type: "string" },
                  direction: { type: "string" },
                },
              },
            },
            limit: { type: "number" },
          },
        },
      },
    },
  },
};

function formatHistory(history) {
  return history
    .slice(-4)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
}

function formatSemanticMatches(matches) {
  return matches
    .slice(0, 4)
    .map(
      (match, index) =>
        `${index + 1}. [${match.sourceType}] ${match.label} | sourceId=${match.sourceId} | score=${match.score.toFixed(4)} | keyFields=${JSON.stringify(Object.fromEntries(Object.entries(match.payload || {}).slice(0, 6)))}`,
    )
    .join("\n");
}

export async function planQuery({ question, history, semanticMatches }) {
  const graphAvailable = false;
  const systemPrompt = `
You are a query planner for an SAP order-to-cash analytics system.
Your job is to convert the user's natural-language question into a safe structured query plan.

Rules:
- Only answer questions about the provided SAP order-to-cash dataset.
- If the question is a greeting, acknowledgment, or short conversational message with no data request, return intent="small_talk", target="sql", and an empty SQL plan that does not access data.
- If the question is outside domain, return target=sql with a query that selects nothing useful and intent="out_of_domain".
- Prefer SQL for tabular aggregates and entity lookups.
- Prefer graph for path traversal, neighborhood exploration, shortest path, or relationship-centric questions only when graph execution is available.
- Use only tables, labels, columns, and relationships from the schema.
- Do not invent tables or columns.
- Produce compact plans with the minimum joins needed.
- If the user asks a follow-up, use conversation history and semantic matches to resolve references.
- If semantic matches contain an exact identifier match in payload fields, treat that as the strongest grounding signal.
- For questions like "find the journal entry linked to this", if a semantic match shows a journal entry whose payload contains the referenced document number, query that journal entry table using the matching payload field.
- For questions like "Trace the full flow of billing document 91150182", start from billing_document_headers.billingDocument or the BillingDocument refId and then join outward to billing items, deliveries, sales orders, and journal entries.
- If the question contains a specific numeric identifier such as a billing document, prefer exact equality filters on the identifier field rather than broad semantic exploration.
- Do not mark clearly in-domain SAP order-to-cash questions as out_of_domain just because they are phrased generally.
`;

  const userPrompt = `
SCHEMA
${schemaSummaryForPrompt()}

CONVERSATION HISTORY
${formatHistory(history)}

SEMANTIC MATCHES
${formatSemanticMatches(semanticMatches)}

USER QUESTION
${question}

GRAPH EXECUTION AVAILABLE
${graphAvailable ? "yes" : "no"}

Return only a valid JSON query plan.
`;

  return createJsonObjectChatCompletion({
    systemPrompt,
    userPrompt: `${userPrompt}

Return a JSON object matching this shape exactly:
${JSON.stringify(QUERY_PLAN_SCHEMA, null, 2)}`,
    temperature: 0,
  });
}

export async function repairQueryPlan({
  question,
  history,
  semanticMatches,
  invalidPlan,
  validationError,
}) {
  const graphAvailable = false;

  const systemPrompt = `
You are repairing a failed query plan for an SAP order-to-cash analytics system.
You must return a corrected JSON query plan that uses only valid schema fields.

Rules:
- Only use tables, columns, labels, and relationships from the schema.
- Do not reuse invalid fields from the failed plan.
- Keep the user's original intent.
- If graph execution is not available, do not return target="graph".
- Return only valid JSON.
`;

  const userPrompt = `
SCHEMA
${schemaSummaryForPrompt()}

GRAPH EXECUTION AVAILABLE
${graphAvailable ? "yes" : "no"}

CONVERSATION HISTORY
${formatHistory(history)}

SEMANTIC MATCHES
${formatSemanticMatches(semanticMatches)}

USER QUESTION
${question}

INVALID PLAN
${JSON.stringify(invalidPlan, null, 2)}

VALIDATION ERROR
${validationError}

Return a corrected JSON query plan.
`;

  return createJsonObjectChatCompletion({
    systemPrompt,
    userPrompt: `${userPrompt}

Return a JSON object matching this shape exactly:
${JSON.stringify(QUERY_PLAN_SCHEMA, null, 2)}`,
    temperature: 0,
  });
}

export async function replanForEmptyResults({
  question,
  history,
  semanticMatches,
  previousPlan,
}) {
  const graphAvailable = false;

  const systemPrompt = `
You are replanning a query because the previous query returned no rows.
Return a corrected JSON query plan that preserves the user's intent but uses more direct exact filters and simpler joins when possible.
`;

  const userPrompt = `
SCHEMA
${schemaSummaryForPrompt()}

GRAPH EXECUTION AVAILABLE
${graphAvailable ? "yes" : "no"}

CONVERSATION HISTORY
${formatHistory(history)}

SEMANTIC MATCHES
${formatSemanticMatches(semanticMatches)}

USER QUESTION
${question}

PREVIOUS PLAN
${JSON.stringify(previousPlan, null, 2)}

The previous plan executed successfully but returned zero rows.
Create a better plan using the strongest exact identifier match available.

Return a JSON object matching this shape exactly:
${JSON.stringify(QUERY_PLAN_SCHEMA, null, 2)}
`;

  return createJsonObjectChatCompletion({
    systemPrompt,
    userPrompt,
    temperature: 0,
  });
}
