import { writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import type { RawTool } from "./fetch-tools.ts";
import { parseLLMResponse } from "./parser.ts";

export interface Edge {
  from: string;
  to: string;
  via: string; // parameter name on the consumer
  confidence: number;
  reasoning: string;
  method: "schema-match" | "llm";
}

const CACHE_FILE = "cache/dependencies.json";
const CONCURRENCY = 8;
const MODEL = "anthropic/claude-haiku-4.5";

// ---------------------------------------------------------------------------
// Pass 1: deterministic schema-based matching
// Match required input params of consumer to output field names of producers.
// ---------------------------------------------------------------------------
function schemaMatch(tools: RawTool[]): Edge[] {
  // Build index: output field name → tools that produce it
  const outputIndex = new Map<string, string[]>();
  for (const tool of tools) {
    const outProps = tool.outputParameters?.properties ?? {};
    for (const key of Object.keys(outProps)) {
      const norm = normalizeKey(key);
      if (!outputIndex.has(norm)) outputIndex.set(norm, []);
      outputIndex.get(norm)!.push(tool.slug);
    }
  }

  const edges: Edge[] = [];
  const seen = new Set<string>();

  for (const consumer of tools) {
    const required = consumer.inputParameters?.required ?? [];
    for (const param of required) {
      const norm = normalizeKey(param);
      const producers = (outputIndex.get(norm) ?? []).filter(
        (s) => s !== consumer.slug
      );
      for (const producerSlug of producers) {
        const key = `${producerSlug}→${consumer.slug}:${param}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          from: producerSlug,
          to: consumer.slug,
          via: param,
          confidence: 0.85,
          reasoning: `${producerSlug} outputs a field matching '${param}' required by ${consumer.slug}`,
          method: "schema-match",
        });
      }
    }
  }
  return edges;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, "");
}

// ---------------------------------------------------------------------------
// Pass 2: LLM inference for tools whose required params had no schema match
// ---------------------------------------------------------------------------
function buildSystemPrompt(allTools: RawTool[]): string {
  const slugList = allTools.map((t) => t.slug).join(", ");
  return `You are a dependency analyst for Composio API tools.

Known tool slugs: ${slugList}

Given a target tool and its required parameters that were NOT satisfied by schema matching, identify which other tools likely produce values for those parameters based on naming, semantics, and API domain knowledge.

Respond ONLY with valid JSON:
{"dependencies":[{"from":"source_slug","via":"param_name","confidence":0.75,"reasoning":"one sentence"}]}

Return empty array if none. Only use slugs from the known list. Confidence must be 0.5-0.85 (lower than schema matches). Never include the tool itself.`;
}

async function callOpenRouter(
  apiKey: string,
  system: string,
  user: string
): Promise<string> {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/dep-graph",
      "X-Title": "dep-graph",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenRouter ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as any;
  return data.choices?.[0]?.message?.content ?? "";
}

async function llmInferForTool(
  apiKey: string,
  tool: RawTool,
  unsatisfiedParams: string[],
  systemPrompt: string
): Promise<Edge[]> {
  const props = tool.inputParameters?.properties ?? {};
  const paramDetails = unsatisfiedParams
    .map((p) => {
      const def = props[p] as any;
      return `  - ${p} (${def?.type ?? "string"}): ${(def?.description ?? "").slice(0, 100)}`;
    })
    .join("\n");

  const userPrompt = `Target: ${tool.slug} (${tool.toolkit})
Description: ${tool.description.slice(0, 200)}
Unsatisfied required params (not found via schema matching):
${paramDetails}

Which tools produce values for these params?`;

  try {
    const text = await callOpenRouter(apiKey, systemPrompt, userPrompt);
    const parsed = parseLLMResponse(text, tool.slug);
    return parsed
      .filter((d) => unsatisfiedParams.includes(d.via))
      .map((dep) => ({
        from: dep.from,
        to: tool.slug,
        via: dep.via,
        confidence: Math.min(dep.confidence, 0.85),
        reasoning: dep.reasoning,
        method: "llm" as const,
      }));
  } catch (err) {
    console.warn(`  [warn] ${tool.slug}: ${(err as Error).message.slice(0, 80)}`);
    return [];
  }
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onProgress?: (done: number, total: number) => void
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < tasks.length) {
      const idx = next++;
      results[idx] = await tasks[idx]!();
      done++;
      onProgress?.(done, tasks.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

export async function inferDependencies(
  tools: RawTool[],
  noCache = false
): Promise<Edge[]> {
  if (!noCache && existsSync(CACHE_FILE)) {
    console.log(`Using cached dependencies from ${CACHE_FILE}`);
    const raw = await readFile(CACHE_FILE, "utf-8");
    return JSON.parse(raw) as Edge[];
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set. Run scaffold.sh first.");

  const knownSlugs = new Set(tools.map((t) => t.slug));

  // --- Pass 1: schema-based matching (fast, deterministic) ---
  console.log("Pass 1: schema-based dependency matching...");
  const schemaEdges = schemaMatch(tools);
  console.log(`  Found ${schemaEdges.length} schema-matched edges`);

  // Build set of (consumer, param) pairs already satisfied
  const satisfied = new Set<string>();
  for (const e of schemaEdges) satisfied.add(`${e.to}:${e.via}`);

  // --- Pass 2: LLM for remaining unsatisfied required params ---
  const llmTargets: { tool: RawTool; unsatisfied: string[] }[] = [];
  for (const tool of tools) {
    const required = tool.inputParameters?.required ?? [];
    const unsatisfied = required.filter((p) => !satisfied.has(`${tool.slug}:${p}`));
    if (unsatisfied.length > 0) llmTargets.push({ tool, unsatisfied });
  }

  console.log(`Pass 2: LLM inference for ${llmTargets.length} tools with unsatisfied params...`);
  console.log(`  Model: ${MODEL} | Concurrency: ${CONCURRENCY}`);

  const systemPrompt = buildSystemPrompt(tools);
  let lastPct = 0;

  const tasks = llmTargets.map(
    ({ tool, unsatisfied }) =>
      () =>
        llmInferForTool(apiKey, tool, unsatisfied, systemPrompt)
  );

  const llmEdgeLists = await runWithConcurrency(tasks, CONCURRENCY, (done, total) => {
    const pct = Math.floor((done / total) * 100);
    if (pct >= lastPct + 10) {
      lastPct = pct;
      process.stdout.write(`  ${pct}% (${done}/${total})\n`);
    }
  });

  const llmEdges = llmEdgeLists.flat().filter(
    (e) => knownSlugs.has(e.from) && knownSlugs.has(e.to) && e.from !== e.to
  );
  console.log(`  Found ${llmEdges.length} LLM-inferred edges`);

  // --- Merge and deduplicate ---
  const seen = new Set<string>();
  const allEdges: Edge[] = [];

  for (const edge of [...schemaEdges, ...llmEdges]) {
    const key = `${edge.from}→${edge.to}:${edge.via}`;
    if (seen.has(key)) continue;
    seen.add(key);
    allEdges.push(edge);
  }

  console.log(`Total edges: ${allEdges.length}`);
  await writeFile(CACHE_FILE, JSON.stringify(allEdges, null, 2), "utf-8");
  return allEdges;
}
