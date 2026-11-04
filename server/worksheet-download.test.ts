import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context.js";

vi.mock("./worksheet-export.js", () => ({
  createWorksheetExport: vi.fn(),
  createWorksheetBundle: vi.fn(),
}));

import { appRouter } from "./routers.js";
import { storeEphemeralWorksheet } from "./routers/worksheets.js";
import { createWorksheetBundle, createWorksheetExport } from "./worksheet-export.js";

function createContext(): TrpcContext {
  return {
    user: null,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("worksheets.download", () => {
  it("returns a browser-safe base64 payload for a cached level worksheet", async () => {
    const now = new Date();
    storeEphemeralWorksheet({
      id: 8,
      userId: 0,
      title: "분수의 덧셈",
      originalName: "분수.txt",
      originalMime: "text/plain",
      originalFileKey: null,
      sourceText: "1/4 + 2/4",
      subject: "수학",
      gradeBand: "중학교 1학년",
      status: "ready",
      analysis: null,
      createdAt: now,
      updatedAt: now,
      levels: [{
        id: 15,
        worksheetId: 8,
        level: "보통",
        title: "분수의 덧셈을 해 봅시다",
        learningGoal: "분모가 같은 분수를 더한다.",
        content: "1. 1/4 + 2/4 =",
        answerGuide: "3/4",
        updatedAt: now,
      }],
    });
    vi.mocked(createWorksheetExport).mockResolvedValue({
      bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
      filename: "분수의 덧셈_보통.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const caller = appRouter.createCaller(createContext());
    const result = await caller.worksheets.download({ worksheetId: 8, levelId: 15, format: "docx" });

    expect(createWorksheetExport).toHaveBeenCalledWith(expect.objectContaining({
      worksheetTitle: "분수의 덧셈",
      levelLabel: "보통",
      title: "분수의 덧셈을 해 봅시다",
    }), "docx", false);
    expect(result).toMatchObject({
      filename: "분수의 덧셈_보통.docx",
      base64: "UEsDBA==",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  });

  it("supports stateless browser-local downloads without login via inline snapshot", async () => {
    vi.mocked(createWorksheetExport).mockResolvedValue({
      bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
      filename: "일차방정식_매우 쉬움.hwpx",
      mimeType: "application/vnd.hancom.hwpx",
    });

    const caller = appRouter.createCaller(createContext());
    const result = await caller.worksheets.download({
      worksheetId: 999999,
      levelId: 1,
      format: "hwpx",
      includeAnswerGuide: true,
      snapshot: {
        worksheetTitle: "일차방정식",
        levelLabel: "매우 쉬움",
        title: "일차방정식 기초",
        learningGoal: "등식의 성질을 이해한다.",
        content: "1. x + 2 = 5",
        answerGuide: "1. x = 3",
      },
    });

    expect(result.filename).toBe("일차방정식_매우 쉬움.hwpx");
    expect(result.base64).toBe("UEsDBA==");
  });

  it("returns one ZIP download payload containing the prescribed five levels", async () => {
    const levelNames = ["매우 쉬움", "쉬움", "보통", "어려움", "매우 어려움"] as const;
    const now = new Date();
    storeEphemeralWorksheet({
      id: 9,
      userId: 0,
      title: "분수의 덧셈",
      originalName: "분수.txt",
      originalMime: "text/plain",
      originalFileKey: null,
      sourceText: "1/4 + 2/4",
      subject: "수학",
      gradeBand: "중학교 1학년",
      status: "ready",
      analysis: null,
      createdAt: now,
      updatedAt: now,
      levels: levelNames.map((level, index) => ({
        id: index + 1,
        worksheetId: 9,
        level,
        title: `${level} 분수 학습지`,
        learningGoal: "분모가 같은 분수를 더한다.",
        content: `${index + 1}. 계산하세요.`,
        answerGuide: "정답 안내",
        updatedAt: now,
      })),
    });
    vi.mocked(createWorksheetBundle).mockResolvedValue({
      bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
      filename: "분수의 덧셈_5단계_전체묶음.zip",
      mimeType: "application/zip",
    });

    const caller = appRouter.createCaller(createContext());
    const result = await caller.worksheets.downloadBundle({ worksheetId: 9, format: "hwpx", includeAnswerGuide: true });

    expect(createWorksheetBundle).toHaveBeenCalledWith(expect.objectContaining({
      worksheetTitle: "분수의 덧셈",
      levels: expect.arrayContaining([expect.objectContaining({ levelLabel: "매우 쉬움" }), expect.objectContaining({ levelLabel: "매우 어려움" })]),
    }), "hwpx", true);
    expect(result).toMatchObject({ filename: "분수의 덧셈_5단계_전체묶음.zip", base64: "UEsDBA==", mimeType: "application/zip" });
  });
});
