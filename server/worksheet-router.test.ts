import { describe, expect, it } from "vitest";
import {
  checkGenerateRateLimit,
  createAsciiStorageObjectName,
  isSupportedWorksheetMime,
  resetGenerateRateLimiter,
  worksheetUploadSchema,
} from "./routers/worksheets.js";

describe("worksheet upload contract", () => {
  it("accepts the three supported worksheet source groups", () => {
    expect(isSupportedWorksheetMime("application/pdf")).toBe(true);
    expect(isSupportedWorksheetMime("text/plain")).toBe(true);
    expect(isSupportedWorksheetMime("image/png")).toBe(true);
    expect(isSupportedWorksheetMime("application/msword")).toBe(false);
  });

  it("requires bounded name, mime type, and file payload before AI generation", () => {
    expect(worksheetUploadSchema.safeParse({
      name: "분수 학습지.txt",
      mimeType: "text/plain",
      base64: "ZmluZQ==",
      sourceText: "1/2를 알아봅시다.",
    }).success).toBe(true);
    expect(worksheetUploadSchema.safeParse({ name: "", mimeType: "text/plain", base64: "" }).success).toBe(false);
    expect(worksheetUploadSchema.safeParse({
      name: "긴 파일 이름.txt",
      mimeType: "text/plain",
      base64: "ZmluZQ==",
      sourceText: "x".repeat(50_001),
    }).success).toBe(false);
  });

  it("uses ASCII-only object names while preserving the original name for app metadata", () => {
    expect(createAsciiStorageObjectName("수학 분수 학습지.pdf")).toBe("source.pdf");
    expect(createAsciiStorageObjectName("기초-연산.PNG")).toBe("source.png");
    expect(createAsciiStorageObjectName("한글 파일명")).toBe("source");
    expect(/^[\x20-\x7E]+$/.test(createAsciiStorageObjectName("수학 학습지.pdf"))).toBe(true);
  });

  it("enforces sliding-window rate limits per client IP", () => {
    resetGenerateRateLimiter();
    const baseTime = 1_700_000_000_000;
    for (let i = 0; i < 20; i++) {
      expect(checkGenerateRateLimit("203.0.113.10", baseTime + i * 1000).allowed).toBe(true);
    }
    const blocked = checkGenerateRateLimit("203.0.113.10", baseTime + 25_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    // Different IP remains unaffected
    expect(checkGenerateRateLimit("203.0.113.99", baseTime + 25_000).allowed).toBe(true);
    resetGenerateRateLimiter();
  });
});
