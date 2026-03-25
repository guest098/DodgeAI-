# AI Session Summary

This document is a truthful summary of the AI-assisted development workflow used to build this project. It is written as a reconstruction of the major work sessions and iteration patterns reflected in the codebase.

## Session 1: Project framing and dataset understanding

### Objective

Understand the SAP order-to-cash dataset, identify the main business entities, and choose an architecture that could support both graph exploration and natural-language querying.

### Main prompts / working themes

- Understand the dataset structure and all folders
- Identify the real order-to-cash flow in the data
- Choose a storage model for graph + analytics
- Plan the graph entities and relationships

### Decisions made

- Use SQLite as the primary datastore because it is simple to run locally and well-suited to the dataset size
- Keep the original dataset represented as normalized tables
- Build `graph_nodes` and `graph_edges` as materialized graph structures for visualization
- Model the real dataset flow instead of forcing a generic purchase-order example

### Result

The project was grounded around a real business chain:

`SalesOrder -> SalesOrderItem -> Delivery -> DeliveryItem -> BillingDocument -> JournalEntry -> Payment`

with supporting entities such as:

- Customer
- Address
- Product
- Plant
- ScheduleLine

## Session 2: Ingestion and graph materialization

### Objective

Load the full dataset, normalize identifiers, and build graph nodes and edges from real relationships.

### Main prompts / working themes

- Ingest every folder in the provided dataset
- Avoid partial coverage of the SAP data
- Normalize item ids and linked references
- Prevent duplicate graph node creation during ingestion

### Problems encountered

- Duplicate graph node ids during ingest
- Cross-table item mismatches caused by padded ids such as `000010` vs `10`
- Initial graph slices looked too sparse because many low-signal leaf entities dominated the seed

### Fixes made

- Switched graph inserts to idempotent behavior
- Normalized item identifiers more consistently
- Included all dataset folders, not just the main transactional ones
- Revised graph seeding to prefer connected business-flow entities instead of random leaves

### Result

The graph now comes from real dataset relationships and covers the full archive rather than only the core flow.

## Session 3: Dynamic query planning

### Objective

Replace hardcoded routing with a real LLM-driven planning layer that converts natural language into structured query plans.

### Main prompts / working themes

- Remove keyword-based if/else query routing
- Remove fixed SQL query catalogs as the primary mechanism
- Convert natural language into structured plan JSON
- Build SQL dynamically from validated plan objects

### Decisions made

- Use the LLM as a planner rather than allowing it to emit raw SQL directly
- Require plans to describe:
  - intent
  - entities
  - filters
  - target
  - SQL plan structure
- Validate all plans against the known schema before execution

### Problems encountered

- Invalid column guesses from the LLM
- Alias mismatches
- Empty-result plans for valid questions
- Non-executable plans missing a valid `from` block

### Fixes made

- Added plan validation and repair loops
- Added clearer execution errors for malformed plans
- Added recovery behavior for empty-result replanning
- Kept a narrow deterministic recovery layer for high-value flows when the planner fails completely

### Result

The system now uses an LLM-first planning architecture while keeping execution constrained to validated query structures.

## Session 4: Provider resilience and free-tier limitations

### Objective

Make the chat system usable under free-tier quotas and temporary provider instability.

### Main prompts / working themes

- Use free-tier LLM APIs only
- Improve reliability when one provider rate-limits
- Reduce token waste and repeated failures
- Add fallback providers

### Decisions made

- Use Google Gemini as the primary provider
- Add Groq as the first fallback
- Add OpenRouter as the second fallback
- Insert rate limiting and fallback delays between provider attempts

### Problems encountered

- Gemini quota exhaustion
- Groq token-per-minute limits
- JSON validation failures on structured outputs
- Slow or hanging responses when waiting for provider completion

### Fixes made

- Added provider chaining with retry delays
- Added a minimum interval between provider calls
- Reduced prompt size in several places
- Shifted more answer formatting to deterministic code paths where possible

### Result

The app is more demo-resilient and less dependent on a single provider being available at all times.

## Session 5: Grounded answers, memory, and search

### Objective

Improve answer quality while keeping responses tied to the dataset.

### Main prompts / working themes

- Ensure answers are grounded in query results
- Support follow-up questions with memory
- Improve fuzzy matching for ids and business entities
- Highlight referenced nodes in the graph

### Decisions made

- Store conversation history in SQLite
- Build a local semantic/hybrid search layer over indexed documents
- Return referenced graph node ids from executed results
- Use deterministic answer synthesis for some high-confidence result shapes

### Result

The system now supports:

- backend conversation memory
- semantic/hybrid grounding
- graph node highlighting from chat answers
- more controlled answer phrasing for document-trace and identifier lookup questions

## Session 6: Graph UX and visual refinement

### Objective

Match the reference UI closely while keeping the graph readable and interactive.

### Main prompts / working themes

- Match the clean split layout from the reference screenshot
- Keep graph interactions stable during zoom and selection
- Improve initial clustering and node differentiation
- Place the metadata card near the selected node

### Problems encountered

- Initial graph looked sparse or scattered
- Auto-fit behavior kept zooming out after multiple clicks
- Some node interactions caused the layout to collapse
- Chat scrolling affected the whole page instead of staying inside the panel

### Fixes made

- Reworked initial graph seeding around connected business flows
- Limited auto-fit to initial load
- Disabled unstable drag behavior
- Added internal chat scroll
- Implemented `Minimize` and `Hide Granular Overlay`
- Moved node detail positioning closer to the selected bubble
- Improved initial node color differentiation based on connectivity

### Result

The UI now better matches the assignment reference and supports the required exploration actions:

- expand nodes
- inspect metadata
- view relationships
- query alongside the graph

## Session 7: Requirement hardening and submission preparation

### Objective

Recheck the project against the assignment criteria and make the repository easier to submit.

### Main prompts / working themes

- Verify alignment with graph construction requirements
- Verify support for the required example queries
- Document architecture decisions clearly
- Prepare simple run instructions

### Files added or improved

- `README.md`
- `HOW_TO_RUN.md`
- architecture diagram asset
- refined environment configuration examples

### Result

The repository now includes:

- a clearer architecture explanation
- database and query-planning rationale
- run instructions
- a cleaner submission narrative

## Debugging pattern used throughout

The AI-assisted workflow followed a repeated pattern:

1. inspect the current code or runtime error
2. narrow the failure to one layer
3. patch the smallest safe fix
4. rerun the same user-facing scenario
5. harden the solution if the same class of error could recur

This was especially common for:

- ingestion normalization
- malformed query plans
- provider rate limits
- stream/response handling
- graph layout issues

## Summary of AI-assisted work

AI assistance was used for:

- architecture exploration
- schema and graph-model reasoning
- refactor planning
- prompt design
- debugging runtime failures
- UI iteration
- documentation cleanup

The final implementation reflects an iterative workflow focused on:

- grounded answers
- clean graph modeling
- dynamic query planning
- demo reliability
- alignment with the assignment requirements
