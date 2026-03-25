import { getDb } from "../lib/db.js";

const VECTOR_DIMENSIONS = 128;

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hashToken(token) {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) {
    hash = ((hash << 5) - hash + token.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function embedText(text) {
  const vector = Array(VECTOR_DIMENSIONS).fill(0);
  const tokens = tokenize(text);
  if (!tokens.length) {
    return vector;
  }

  for (const token of tokens) {
    const position = hashToken(token) % VECTOR_DIMENSIONS;
    vector[position] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

function cosineSimilarity(left, right) {
  let score = 0;
  for (let index = 0; index < VECTOR_DIMENSIONS; index += 1) {
    score += (left[index] || 0) * (right[index] || 0);
  }
  return score;
}

export function rebuildSearchIndex() {
  const db = getDb();
  db.exec("DELETE FROM search_documents");

  const nodes = db.prepare("SELECT id, kind, label, refId, payload FROM graph_nodes").all();
  const insert = db.prepare(
    "INSERT INTO search_documents (id, sourceType, sourceId, label, content, embedding, payload) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const transaction = db.transaction((batch) => {
    for (const row of batch) {
      const payload = JSON.parse(row.payload || "{}");
      const content = [
        row.kind,
        row.label,
        row.refId,
        ...Object.entries(payload).map(([key, value]) => `${key} ${String(value ?? "")}`),
      ].join(" ");
      insert.run(
        row.id,
        row.kind,
        row.id,
        row.label,
        content,
        JSON.stringify(embedText(content)),
        JSON.stringify(payload),
      );
    }
  });

  transaction(nodes);
}

export function semanticSearch(query, limit = 8) {
  const db = getDb();
  const queryEmbedding = embedText(query);
  const identifierMatches = String(query).match(/\b\d{6,}\b/g) || [];
  const documents = db
    .prepare("SELECT * FROM search_documents LIMIT 5000")
    .all()
    .map((row) => ({
      ...row,
      embedding: JSON.parse(row.embedding || "[]"),
      payload: JSON.parse(row.payload || "{}"),
    }));

  return documents
    .map((document) => ({
      ...document,
      score:
        cosineSimilarity(queryEmbedding, document.embedding) +
        exactMatchBoost(document, query, identifierMatches),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function exactMatchBoost(document, query, identifierMatches) {
  let boost = 0;
  const normalizedQuery = String(query || "").toLowerCase();
  const content = String(document.content || "").toLowerCase();
  const label = String(document.label || "").toLowerCase();
  const sourceId = String(document.sourceId || "").toLowerCase();

  if (label === normalizedQuery || sourceId === normalizedQuery) {
    boost += 5;
  }

  for (const identifier of identifierMatches) {
    if (content.includes(identifier.toLowerCase())) {
      boost += 4;
    }
    if (label.includes(identifier.toLowerCase())) {
      boost += 3;
    }
    if (sourceId.includes(identifier.toLowerCase())) {
      boost += 3;
    }
  }

  return boost;
}
