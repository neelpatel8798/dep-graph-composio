import { Composio } from "@composio/core";
import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";

export interface ParamDef {
  type?: string;
  description?: string;
  title?: string;
  examples?: string[];
}

export interface RawTool {
  slug: string;
  name: string;
  description: string;
  toolkit: string;
  inputParameters: {
    properties: Record<string, ParamDef>;
    required?: string[];
  };
  outputParameters: {
    properties: Record<string, ParamDef & { $ref?: string }>;
  };
  tags?: string[];
}

const CACHE_DIR = "cache";

async function fetchToolkit(
  composio: Composio,
  toolkit: string,
  cacheFile: string,
  noCache: boolean
): Promise<RawTool[]> {
  if (!noCache && existsSync(cacheFile)) {
    console.log(`  Using cached ${toolkit} tools`);
    const raw = await readFile(cacheFile, "utf-8");
    return JSON.parse(raw) as RawTool[];
  }

  console.log(`  Fetching ${toolkit} from Composio...`);
  const raw = await (composio.tools as any).getRawComposioTools({
    toolkits: [toolkit],
    limit: 1000,
  });

  const normalized: RawTool[] = (raw as any[]).map((t: any) => ({
    slug: t.slug ?? t.name,
    name: t.name ?? t.slug,
    description: t.description ?? "",
    toolkit: typeof t.toolkit === "object" ? t.toolkit.slug : (t.toolkit ?? toolkit),
    inputParameters: t.inputParameters ?? { properties: {} },
    outputParameters: t.outputParameters ?? { properties: {} },
    tags: t.tags ?? [],
  }));

  await writeFile(cacheFile, JSON.stringify(normalized, null, 2), "utf-8");
  console.log(`  Wrote ${normalized.length} ${toolkit} tools to ${cacheFile}`);
  return normalized;
}

export async function fetchAllTools(noCache = false): Promise<RawTool[]> {
  await mkdir(CACHE_DIR, { recursive: true });
  const composio = new Composio();
  const [googleTools, githubTools] = await Promise.all([
    fetchToolkit(composio, "googlesuper", `${CACHE_DIR}/googlesuper.json`, noCache),
    fetchToolkit(composio, "github", `${CACHE_DIR}/github.json`, noCache),
  ]);
  return [...googleTools, ...githubTools];
}
