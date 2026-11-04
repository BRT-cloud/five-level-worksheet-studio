import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/llm.js", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "./_core/llm.js";
import { generateFiveLevelWorksheets } from "./worksheet-service.js";
import { LEVELS } from "./worksheet-utils.js";

const sampleValidResponse = {
  analysis: {
    learningGoal: "일차방정식의 해를 구할 수 있다.",
    subject: "수학",
    suggestedGradeBand: "중학교 1학년",
    skills: ["등식의 성질", "이항"],
    sourceSummary: "일차방정식 단원 형성평가",
  },
  worksheets: LEVELS.map(level => ({
    level,
    title: `${level} 일차방정식 학습지`,
    learningGoal: "일차방정식의 해를 구한다.",
    instructions: "문제를 읽고 답하세요.",
    questions: [
      { number: 1, prompt: "x + 2 = 5를 푸세요.", type: "단답형", answerGuide: "x = 3" },
      { number: 2, prompt: "2x = 8을 푸세요.", type: "단답형", answerGuide: "x = 4" },
    ],
    teacherNote: "등식의 성질을 안내합니다.",
  })),
};

describe("generateFiveLevelWorksheets", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("passes inline PDF file_url and UDL prompt to LLM", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce({
      id: "test-1",
      created: Date.now(),
      model: "gemini-2.5-flash",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(sampleValidResponse) },
          finish_reason: "stop",
        },
      ],
    });

    const result = await generateFiveLevelWorksheets({
      sourceLabel: "방정식.pdf",
      sourceUrl: "data:application/pdf;base64,JVBERi0xLjQK",
      mimeType: "application/pdf",
    });

    expect(invokeLLM).toHaveBeenCalledTimes(1);
    expect(result.worksheets).toHaveLength(5);
    expect(result.analysis.subject).toBe("수학");
    expect(result.analysis.suggestedGradeBand).toBe("중학교 1학년");
  });

  it("performs one automatic repair retry when the first LLM response is malformed JSON", async () => {
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce({
        id: "test-bad",
        created: Date.now(),
        model: "gemini-2.5-flash",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "{ truncated json" },
            finish_reason: "length",
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "test-repaired",
        created: Date.now(),
        model: "gemini-2.5-flash",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(sampleValidResponse) },
            finish_reason: "stop",
          },
        ],
      });

    const result = await generateFiveLevelWorksheets({
      sourceLabel: "방정식.txt",
      sourceText: "1. x + 2 = 5",
      mimeType: "text/plain",
    });

    expect(invokeLLM).toHaveBeenCalledTimes(2);
    expect(result.worksheets.map(w => w.level)).toEqual([...LEVELS]);
  });
});
