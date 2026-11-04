import { describe, expect, it } from "vitest";
import { isRetryableStatus, toGeminiContents, toGeminiSchema } from "./_core/llm";

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

  it("converts base64 data URLs to Gemini inlineData and rejects non-data URLs", () => {
    const contents = toGeminiContents([
      { role: "system", content: "system prompt" },
      {
        role: "user",
        content: [
          { type: "text", text: "이미지를 분석하세요." },
          { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
          { type: "file_url", file_url: { url: "data:application/pdf;base64,JVBERi0xLjQK", mime_type: "application/pdf" } },
        ],
      },
    ]);

    expect(contents).toHaveLength(1);
    expect(contents[0]?.parts).toEqual([
      { text: "이미지를 분석하세요." },
      { inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } },
      { inlineData: { mimeType: "application/pdf", data: "JVBERi0xLjQK" } },
    ]);

    expect(() =>
      toGeminiContents([
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: "https://example.com/worksheet.png" } }],
        },
      ])
    ).toThrow("base64 data URL");
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
});

