import { describe, it, expect } from "bun:test";
import { parseLLMResponse } from "../src/parser.ts";

describe("parseLLMResponse", () => {
  it("parses valid JSON", () => {
    const input = JSON.stringify({
      dependencies: [
        { from: "GMAIL_LIST_THREADS", via: "thread_id", confidence: 0.9, reasoning: "provides thread_id" },
      ],
    });
    const result = parseLLMResponse(input, "GMAIL_REPLY_TO_THREAD");
    expect(result).toHaveLength(1);
    expect(result[0]!.from).toBe("GMAIL_LIST_THREADS");
    expect(result[0]!.via).toBe("thread_id");
    expect(result[0]!.confidence).toBe(0.9);
  });

  it("parses JSON inside markdown code block", () => {
    const input = "```json\n" + JSON.stringify({
      dependencies: [{ from: "GITHUB_LIST_REPOS", via: "repo_name", confidence: 0.8, reasoning: "provides repo" }],
    }) + "\n```";
    const result = parseLLMResponse(input, "GITHUB_CREATE_ISSUE");
    expect(result).toHaveLength(1);
    expect(result[0]!.from).toBe("GITHUB_LIST_REPOS");
  });

  it("returns empty array for malformed JSON", () => {
    const result = parseLLMResponse("not json at all {{{", "SOME_TOOL");
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    const result = parseLLMResponse("", "SOME_TOOL");
    expect(result).toHaveLength(0);
  });

  it("drops entries missing required fields", () => {
    const input = JSON.stringify({
      dependencies: [
        { confidence: 0.9, reasoning: "missing from and via" },
        { from: "TOOL_A", via: "param_x", confidence: 0.7, reasoning: "valid" },
      ],
    });
    const result = parseLLMResponse(input, "TARGET");
    expect(result).toHaveLength(1);
    expect(result[0]!.from).toBe("TOOL_A");
  });

  it("clamps confidence to 0-1 range", () => {
    const input = JSON.stringify({
      dependencies: [
        { from: "TOOL_A", via: "x", confidence: 1.5, reasoning: "over" },
        { from: "TOOL_B", via: "y", confidence: -0.3, reasoning: "under" },
      ],
    });
    const result = parseLLMResponse(input, "TARGET");
    expect(result[0]!.confidence).toBe(1);
    expect(result[1]!.confidence).toBe(0);
  });

  it("returns empty array when dependencies key is missing", () => {
    const result = parseLLMResponse('{"something_else": []}', "TOOL");
    expect(result).toHaveLength(0);
  });
});
