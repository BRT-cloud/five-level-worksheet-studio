import { describe, expect, it } from "vitest";
import { createWorksheetExport, sanitizeExportFilename, worksheetContentParagraphs } from "./worksheet-export";

const worksheet = {
  worksheetTitle: "분수의 덧셈",
  levelLabel: "보통",
  title: "분수의 덧셈을 해 봅시다",
  learningGoal: "분모가 같은 분수를 더할 수 있다.",
  content: "문제를 읽고 답하세요.\n\n1. 1/4 + 2/4 =\n\n2. 계산한 방법을 설명하세요.",
};

describe("worksheet document exports", () => {
  it("builds Word and HWPX files as ZIP-based document payloads", async () => {
    const [docx, hwpx] = await Promise.all([
      createWorksheetExport(worksheet, "docx"),
      createWorksheetExport(worksheet, "hwpx"),
    ]);
    expect(docx.filename).toBe("분수의 덧셈_보통.docx");
    expect(hwpx.filename).toBe("분수의 덧셈_보통.hwpx");
    expect(Array.from(docx.bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
    expect(Array.from(hwpx.bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
  });

  it("keeps printable non-empty worksheet lines and safe download names", () => {
    expect(worksheetContentParagraphs(worksheet.content)).toEqual([
      "문제를 읽고 답하세요.",
      "1. 1/4 + 2/4 =",
      "2. 계산한 방법을 설명하세요.",
    ]);
    expect(sanitizeExportFilename('수학: <심화>?')).toBe("수학 심화");
  });
});
