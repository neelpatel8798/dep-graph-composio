import { fetchAllTools } from "./fetch-tools.ts";
import { inferDependencies } from "./infer-deps.ts";
import { buildGraph } from "./build-graph.ts";
import { generateHTML } from "./visualize.ts";
import { writeFile } from "fs/promises";

const noCache = process.argv.includes("--no-cache");

if (!process.env.COMPOSIO_API_KEY) {
  console.error("Error: COMPOSIO_API_KEY is not set");
  process.exit(1);
}

console.log("=== Tool Dependency Graph Builder ===\n");

const tools = await fetchAllTools(noCache);
console.log(`Total tools: ${tools.length}\n`);

const edges = await inferDependencies(tools, noCache);


const graph = buildGraph(tools, edges);

await writeFile("graph.json", JSON.stringify(graph, null, 2), "utf-8");
console.log(`Graph written to graph.json`);

await generateHTML(graph);

console.log(`\nDone.`);
console.log(`  graph.json — machine-readable dependency graph`);
console.log(`  index.html — interactive visualization (open in browser)`);
console.log(`\nStats:`);
console.log(`  Tools: ${graph.meta.totalTools}`);
console.log(`  Toolkits: ${graph.meta.toolkits.join(", ")}`);
console.log(`  Dependencies: ${graph.meta.edgeCount}`);
