import { describe, expect, it, vi } from "vitest";
import {
  buildGeminiPayload,
  GEMINI_FALLBACK_MODELS,
  invokeLLM,
  isRetryableStatus,
  toGeminiContents,
  toGeminiSchema,
} from "./_core/llm";

describe("Gemini LLM adapter helpers", () => {
  it("strips additionalProperties and $schema recursively for Gemini responseSchema", () => {
    const inputSchema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      additionalProperties: false,
      properties: {
        analysis: {
          type: "object",
          additionalProperties: false,
          properties: {
            learningGoal: { type: "string" },
          },
        },
        worksheets: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              level: { type: "string" },
            },
          },
        },
      },
    };

    const converted = toGeminiSchema(inputSchema);
    const serialized = JSON.stringify(converted);
    expect(serialized).not.toContain("additionalProperties");
    expect(serialized).not.toContain("$schema");
    expect(converted).toMatchObject({
      type: "object",
      properties: {
        analysis: {
          type: "object",
          properties: { learningGoal: { type: "string" } },
        },
      },
    });
  });

  it("converts base64 data URLs to Gemini inlineData and wraps non-data URLs as text", () => {
    const contents = toGeminiContents([
      { role: "system", content: "system prompt" },
      {
        role: "user",
        content: [
          { type: "text", text: "이미지를 분석하세요." },
          { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
          { type: "file_url", file_url: { url: "data:application/pdf;base64,JVBERi0xLjQK", mime_type: "application/pdf" } },
          { type: "image_url", image_url: { url: "https://example.com/worksheet.png" } },
        ],
      },
    ]);

    expect(contents).toHaveLength(1);
    expect(contents[0]?.parts).toEqual([
      { text: "이미지를 분석하세요." },
      { inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } },
      { inlineData: { mimeType: "application/pdf", data: "JVBERi0xLjQK" } },
      { text: "[이미지 URL: https://example.com/worksheet.png]" },
    ]);
  });

  it("retries only transient HTTP status codes and never 4xx client errors", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(504)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });

  it("includes fast, high-availability flash models in fallback array", () => {
    expect(GEMINI_FALLBACK_MODELS).toContain("gemini-2.5-flash-lite");
    expect(GEMINI_FALLBACK_MODELS).toContain("gemini-2.5-flash");
    expect(GEMINI_FALLBACK_MODELS).toContain("gemini-flash-latest");
  });

  it("fails over immediately across models on HTTP 503 High Demand instead of crashing", async () => {
    const originalAiApiKey = process.env.AI_API_KEY;
    process.env.AI_API_KEY = "test-gemini-key";
    const { ENV } = await import("./_core/env");
    ENV.aiApiKey = "test-gemini-key";

    const globalFetch = vi.fn();
    vi.stubGlobal("fetch", globalFetch);

    // Call 1: primary model returns 503 High Demand
    globalFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "This model is currently experiencing high demand." } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })
    );

    // Call 2: fallback model returns 200 OK
    globalFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true }) }] }, finishReason: "stop" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    const result = await invokeLLM({
      messages: [{ role: "user", content: "안녕하세요" }],
      response_format: { type: "json_object" },
    });

    expect(globalFetch).toHaveBeenCalledTimes(2);
    expect(result.choices[0]?.message.content).toContain("ok");
    vi.unstubAllGlobals();
    if (originalAiApiKey !== undefined) {
      process.env.AI_API_KEY = originalAiApiKey;
      ENV.aiApiKey = originalAiApiKey;
    } else {
      delete process.env.AI_API_KEY;
      ENV.aiApiKey = "";
    }
  });
});


