import type { RawTool } from "./fetch-tools.ts";
import type { Edge } from "./infer-deps.ts";


export interface GraphNode {
  id: string;
  name: string;
  toolkit: string;
  description: string;
  inDegree: number;
  outDegree: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  via: string;
  confidence: number;
  reasoning: string;
  method: "schema-match" | "llm";
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: {
    totalTools: number;
    toolkits: string[];
    edgeCount: number;
    generatedAt: string;
  };
}

export function buildGraph(tools: RawTool[], edges: Edge[]): Graph {
  const degreeCounts: Record<string, { in: number; out: number }> = {};
  for (const t of tools) degreeCounts[t.slug] = { in: 0, out: 0 };

  for (const e of edges) {
    if (degreeCounts[e.from]) degreeCounts[e.from]!.out++;
    if (degreeCounts[e.to]) degreeCounts[e.to]!.in++;
  }

  // Pre-compute radial layout positions, grouped by toolkit
  const toolkitGroups: Record<string, RawTool[]> = {};
  for (const t of tools) {
    if (!toolkitGroups[t.toolkit]) toolkitGroups[t.toolkit] = [];
    toolkitGroups[t.toolkit]!.push(t);
  }
  const cx = 640, cy = 400;
  const positions: Record<string, { x: number; y: number }> = {};
  const tkList = Object.keys(toolkitGroups);
  tkList.forEach((tk, tkIdx) => {
    const group = toolkitGroups[tk]!;
    const ringR = 120 + tkIdx * 180;
    group.forEach((t, i) => {
      const angle = (i / group.length) * 2 * Math.PI - Math.PI / 2;
      positions[t.slug] = {
        x: Math.round(cx + ringR * Math.cos(angle)),
        y: Math.round(cy + ringR * Math.sin(angle)),
      };
    });
  });

  const nodes: GraphNode[] = tools.map((t) => ({
    id: t.slug,
    name: t.name,
    toolkit: t.toolkit,
    description: t.description.slice(0, 200),
    inDegree: degreeCounts[t.slug]?.in ?? 0,
    outDegree: degreeCounts[t.slug]?.out ?? 0,
    x: positions[t.slug]?.x ?? cx,
    y: positions[t.slug]?.y ?? cy,
  }));

  const graphEdges: GraphEdge[] = edges.map((e) => ({
    from: e.from,
    to: e.to,
    via: e.via,
    confidence: e.confidence,
    reasoning: e.reasoning,
    method: e.method,
  }));

  const toolkits = [...new Set(tools.map((t) => t.toolkit))];

  return {
    nodes,
    edges: graphEdges,
    meta: {
      totalTools: tools.length,
      toolkits,
      edgeCount: edges.length,
      generatedAt: new Date().toISOString(),
    },
  };
}
