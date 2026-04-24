export interface DepResult {
  from: string;
  via: string;
  confidence: number;
  reasoning: string;
}

export function parseLLMResponse(text: string, targetSlug: string): DepResult[] {
  if (!text || text.trim().length === 0) return [];

  // Extract JSON from markdown code blocks if present
  const jsonMatch =
    text.match(/```(?:json)?\s*([\s\S]*?)```/) ??
    text.match(/(\{[\s\S]*\})/);

  const jsonText = jsonMatch ? jsonMatch[1] : text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText?.trim() ?? "");
  } catch {
    console.warn(`[parser] Invalid JSON for ${targetSlug}: ${text.slice(0, 80)}...`);
    return [];
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as any).dependencies)
  ) {
    console.warn(`[parser] Unexpected shape for ${targetSlug}`);
    return [];
  }

  const results: DepResult[] = [];
  for (const dep of (parsed as any).dependencies) {
    if (typeof dep !== "object" || dep === null) continue;
    const from = typeof dep.from === "string" ? dep.from.trim() : null;
    const via = typeof dep.via === "string" ? dep.via.trim() : null;
    const confidence =
      typeof dep.confidence === "number"
        ? Math.min(1, Math.max(0, dep.confidence))
        : 0.5;
    const reasoning =
      typeof dep.reasoning === "string" ? dep.reasoning : "";

    if (!from || !via) continue;
    results.push({ from, via, confidence, reasoning });
  }

  return results;
}
