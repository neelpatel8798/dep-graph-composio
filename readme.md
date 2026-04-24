# Tool Dependency Graph — Composio (Google Super + GitHub)

## What I built

A two-pass dependency inference system that maps which Composio API tools must run before other tools can execute, visualized as an interactive D3.js graph.

### Problem

When an agent wants to call `GMAIL_REPLY_TO_THREAD`, it needs a `thread_id`. That value can only come from `GMAIL_LIST_THREADS` (or similar). The agent needs to know this dependency upfront — either to fetch it automatically or ask the user for it. This system builds that dependency map across 1304 tools (437 Google Super + 867 GitHub).

### How it works

**Pass 1 — Schema matching** (`src/infer-deps.ts`: `schemaMatch`)

Deterministic, no API calls. For each tool's required input parameters, checks whether any other tool's output schema produces a matching field name.

Extended with:
- **Synonym expansion**: `email` ↔ `emailaddress`/`useremail`, `repo` ↔ `repository`, `owner` ↔ `username`/`login`, `sha` ↔ `commitsha`/`ref`, `threadid` ↔ `id` (when context matches), etc. (~40 synonym pairs)
- **Contextual ID matching**: If a tool's slug contains a domain keyword (e.g., `THREAD`, `ISSUE`, `PULL`) and it outputs a plain `id` field, it gets indexed under the domain-specific key (`threadid`, `issuenumber`, `prnumber`). This catches the very common pattern where list/get tools return `id` but consumers require `thread_id`.
- Confidence: exact field match = 0.85, synonym/contextual = 0.72

Result: **2606 schema-matched edges**

**Pass 2 — LLM inference** (`src/infer-deps.ts`: `llmInferForTool`)

For tools where required params had no schema match, sends the tool description + unsatisfied params to `anthropic/claude-haiku-4.5` via OpenRouter. The LLM uses semantic reasoning and API domain knowledge to infer likely producers.

- Concurrency: 8 parallel requests
- System prompt includes all 1304 known tool slugs so LLM can only reference real tools
- Confidence capped at 0.85 (lower than schema matches to reflect uncertainty)
- LLM edges are cached separately so schema can be refreshed independently

Result: **278 LLM-inferred edges**

**Total: 2884 dependency edges**

### Caching + CLI flags

```
bun run src/index.ts              # use cached tools + dependencies
bun run src/index.ts --no-cache   # re-fetch everything (tools + LLM inference)
bun run src/index.ts --refresh-schema  # re-run schema matching, keep cached LLM edges
```

### Visualization (`src/visualize.ts`)

Interactive D3.js arc diagram embedded in `index.html`:

- **Arc layout**: Tools arranged in toolkit rings (Google Super inner, GitHub outer), with stable deterministic jitter per node (hash of slug) so layout doesn't jump on filter changes
- **Node sizing**: Radius scales with degree (in + out edges), capped to prevent overlap
- **Hub glow**: Top 15 nodes by degree get a color glow — these are the most-connected tools (e.g., tools that many others depend on)
- **Filters**: By toolkit, by action type (read/write/delete/list/create/other), full-text search, confidence slider
- **Sidebar**: Click any node to see its precursors (tools it depends on) and consumers (tools that depend on it), with `via` parameter shown for each edge
- **Tooltip**: Hover any node for description + degree stats
- **Reset**: One-click filter reset
- **Legend**: Toolkit color key, action type colors, degree/glow explanation
- **Accessibility**: `aria-label` on inputs, `role="img"` on SVG, WCAG-compliant contrast

### Project structure

```
src/
  index.ts        — entrypoint, CLI flags
  fetch-tools.ts  — Composio SDK fetcher, caches per toolkit
  infer-deps.ts   — two-pass inference (schema + LLM)
  build-graph.ts  — assembles Graph object with degree counts + positions
  visualize.ts    — generates self-contained index.html
  parser.ts       — LLM JSON response parser
graph.json        — machine-readable dependency graph
index.html        — interactive visualization (open in browser)
cache/            — cached tool schemas + dependency edges
```

## Setup

1. Get a Composio API key from https://platform.composio.dev
2. Get an OpenRouter API key from https://openrouter.ai (needs credits for LLM pass)
3. Install [Bun](https://bun.sh): `curl -fsSL https://bun.sh/install | bash`
4. `bun install`
5. Set env vars: `COMPOSIO_API_KEY=... OPENROUTER_API_KEY=... bun run src/index.ts`

Or use a `.env` file.

## Submit

```
sh upload.sh <your_email>
sh upload.sh <your_email> --skip-session
```

## Agent session tracing

`upload.sh` collects recent local agent sessions into `agent-sessions/` before creating the submission zip. Includes activity from Codex, Claude Code, OpenCode, and Cursor within a 90-minute window. Use `--skip-session` to skip.
