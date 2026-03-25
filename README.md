# SAP Order-to-Cash Context Graph

Node.js + React system for turning the SAP order-to-cash dataset into a connected graph and querying it through a natural-language chat interface.

## What This Builds

The project solves the assignment in three layers:

- ingest the SAP dataset into a structured relational store
- materialize business entities and relationships as a graph
- let users ask natural-language questions that are translated into validated SQL and returned as grounded answers

The UI combines:

- a graph exploration surface
- node metadata inspection
- node expansion
- a chat panel for natural-language querying

## Architecture Decisions

### 1. Split data storage from query experience

I chose a hybrid architecture built on top of SQLite:

- normalized relational tables preserve the original dataset structure
- `graph_nodes` and `graph_edges` provide a graph abstraction for exploration
- `search_documents` supports semantic and hybrid grounding for fuzzy references

This keeps ingestion simple and inspectable while still supporting graph-style traversal in the UI.

### 2. Keep the graph grounded in the actual dataset

The graph is not mocked or hand-authored. It is built from real dataset joins across the order-to-cash process:

- `SalesOrder -> SalesOrderItem`
- `SalesOrderItem -> Product`
- `SalesOrderItem -> DeliveryItem`
- `Delivery -> DeliveryItem`
- `DeliveryItem -> Plant`
- `BillingDocument -> BillingItem`
- `BillingItem -> DeliveryItem`
- `BillingDocument -> JournalEntry`
- `JournalEntry -> Payment`
- `Customer -> SalesOrder`
- `Customer -> BillingDocument`
- `Customer -> Address`

This lets the graph reflect the true business flow rather than a visual-only approximation.

### 3. Use LLM planning, but validate before execution

The system is intentionally not a static query catalog. Instead:

- the LLM converts natural language into a structured query plan
- the backend validates that plan against an allowlisted schema catalog
- only validated SQL is executed

This gives flexibility for unseen in-domain questions while keeping execution safe and data-backed.

### 4. Keep the frontend simple and task-focused

The UI is designed around the assignment’s core actions:

- view the graph
- expand business context
- inspect metadata
- ask a question
- highlight referenced nodes in the answer

The goal is clarity and demo reliability rather than a dashboard with many unrelated panels.

## Database Choice

SQLite was chosen as the primary database for this submission.

Why SQLite:

- zero external infrastructure required
- easy local setup and reproducible demo flow
- strong fit for the dataset size
- simple to inspect during debugging
- supports both relational analytics and materialized graph tables in one place

Instead of introducing a separate graph database, the project uses:

- normalized source tables for analytics and joins
- `graph_nodes` / `graph_edges` for graph traversal and visualization

This keeps the architecture lightweight while still meeting the graph modeling requirement.

## LLM Prompting Strategy

The LLM layer is designed as a planner, not as a free-form answer generator.

### Query planning

The planner prompt asks the model to return structured JSON containing:

- `intent`
- `entities`
- `filters`
- `target`
- SQL execution plan details

The prompt is constrained with:

- the known dataset schema
- available entities and relationships
- instructions to stay within the SAP order-to-cash domain
- instructions to prefer exact ids and document numbers when present

### Answer generation

After query execution:

- the response is synthesized from actual query results
- referenced node ids are returned for graph highlighting
- deterministic answer formatting is used for several high-value business question shapes

This reduces hallucination risk and keeps answers grounded in the dataset.

### Provider strategy

The provider chain is:

1. Google Gemini
2. Groq
3. OpenRouter

This improves resilience under free-tier limits and timeout conditions.

## Guardrails

The system includes multiple guardrail layers.

### Domain guardrails

The assistant is restricted to the provided SAP order-to-cash dataset and rejects unrelated prompts such as:

- general knowledge
- creative writing
- off-topic questions

Rejection response:

`This system is designed to answer questions related to the provided SAP order-to-cash dataset only.`

### Execution guardrails

- generated plans are validated before execution
- only known tables, columns, aliases, and operators are allowed
- SQL is assembled from validated plan objects rather than raw LLM text
- graph expansion only uses materialized graph entities from the dataset

### Grounding guardrails

- answers are based on executed query results
- graph node highlighting comes from referenced dataset entities
- conversation memory is stored server-side so follow-up questions remain contextual

## Graph Model

### Core business nodes

- `SalesOrder`
- `SalesOrderItem`
- `Delivery`
- `DeliveryItem`
- `BillingDocument`
- `BillingItem`
- `JournalEntry`
- `Payment`

### Supporting nodes

- `Customer`
- `Address`
- `Product`
- `Plant`
- `ScheduleLine`
- assignment and master-data support entities from the dataset

### Graph behavior in the UI

- initial graph seed is generated from real connected order-to-cash flows
- clicking a node expands real neighbors from `graph_edges`
- selecting a node opens a metadata card near the highlighted bubble
- chat answers can highlight referenced nodes

## Bonus Features Implemented

- natural language to structured SQL planning
- semantic / hybrid entity grounding
- streaming chat responses with SSE
- backend conversation memory
- graph node highlighting from answers

## Repository Structure

```text
apps/
  api/
    src/
      ingest/
      routes/
      services/
  web/
    src/
      components/
dataset/
README.md
HOW_TO_RUN.md
```

## Setup

Copy `.env.example` to `.env` and configure:

```env
PORT=4000
DATASET_ROOT=./dataset/sap-o2c-data
SQLITE_PATH=./apps/api/data/o2c.sqlite
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash-lite
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-20b
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-oss-20b:free
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_APP_NAME=sap-order-to-cash-graph
```

## Run Locally

Install dependencies:

```bash
npm install
```

Ingest the dataset:

```bash
npm run ingest
```

Start the API and frontend:

```bash
npm run dev
```

Local URLs:

- frontend: `http://localhost:5173`
- health check: `http://localhost:4000/api/health`

## API Surface

- `GET /api/health`
- `GET /api/graph/seed`
- `GET /api/graph/node/:id`
- `GET /api/graph/neighbors/:id`
- `GET /api/graph/stats`
- `GET /api/graph/search?q=...`
- `GET /api/graph/trace/billing/:billingDocument`
- `POST /api/chat`
- `GET /api/chat/stream?question=...&sessionId=...`

## Example Questions

- `Which products are associated with the highest number of billing documents?`
- `Trace the full flow of billing document 91150182`
- `Identify sales orders that have broken or incomplete flows`
- `91150187 - Find the journal entry number linked to this?`

## Submission Notes

This repository is designed to satisfy the assignment requirements around:

- graph construction
- graph visualization
- dynamic natural-language querying
- grounded answers
- guardrails

For submission, include:

- working demo link
- public GitHub repository
- this README
- AI coding session logs / transcripts
