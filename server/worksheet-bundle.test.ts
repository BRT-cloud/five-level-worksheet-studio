import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createWorksheetBundle, createWorksheetExport } from "./worksheet-export";

const makeLevel = (levelLabel: string, index: number) => ({
  worksheetTitle: "분수의 덧셈",
  levelLabel,
  title: `${levelLabel} 분수 학습지`,
  learningGoal: "분모가 같은 분수를 더한다.",
  content: `${index}. 1/4 + 2/4 =`,
  answerGuide: `${index}. 3/4\n교사용 조정 메모: 분수 막대를 제공합니다.`,
});

describe("worksheet bundle exports", () => {
  it("adds the student information form and includes answers only when selected", async () => {
    const withoutAnswer = await createWorksheetExport(makeLevel("보통", 1), "docx", false);
    const withAnswer = await createWorksheetExport(makeLevel("보통", 1), "docx", true);
    const plainXml = await (await JSZip.loadAsync(withoutAnswer.bytes)).file("word/document.xml")!.async("string");
    const answerXml = await (await JSZip.loadAsync(withAnswer.bytes)).file("word/document.xml")!.async("string");
    expect(plainXml).toContain("학교");
    expect(plainXml).toContain("이름");
    expect(plainXml).not.toContain("교사용 정답");
    expect(answerXml).toContain("교사용 정답");
  });

  it("packages all five level worksheets in one ZIP archive", async () => {
    const bundle = await createWorksheetBundle({
      worksheetTitle: "분수의 덧셈",
      levels: ["매우 쉬움", "쉬움", "보통", "어려움", "매우 어려움"].map(makeLevel),
    }, "hwpx", true);
    const zip = await JSZip.loadAsync(bundle.bytes);
    const entries = Object.keys(zip.files).filter(name => name.endsWith(".hwpx"));
    expect(bundle.filename).toBe("분수의 덧셈_5단계_전체묶음.zip");
    expect(entries).toHaveLength(5);
    expect(entries).toContain("01_매우 쉬움_매우 쉬움 분수 학습지.hwpx");
    expect(entries).toContain("05_매우 어려움_매우 어려움 분수 학습지.hwpx");
  });
});
