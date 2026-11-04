import { describe, expect, it } from "vitest";
import {
  assertFiveLevelSet,
  formatAnswerGuide,
  formatLevelContent,
  LEVELS,
  parseAndValidateGeneratedWorksheet,
  type GeneratedLevel,
} from "./worksheet-utils";

const createLevel = (level: (typeof LEVELS)[number]): GeneratedLevel => ({
  level,
  title: `${level} 수학 학습지`,
  learningGoal: "분수를 이해한다.",
  instructions: "문제를 읽고 답하세요.",
  questions: [
    { number: 1, prompt: "1/2와 같은 그림을 고르세요.", type: "선택형", answerGuide: "반으로 나눈 그림" },
    { number: 2, prompt: "2/4를 써 보세요.", type: "서술형", answerGuide: "1/2" },
  ],
  teacherNote: "필요하면 분수 막대를 제공합니다.",
});

describe("five level worksheet utilities", () => {
  it("requires exactly the five prescribed Korean levels", () => {
    expect(() => assertFiveLevelSet(LEVELS.map(createLevel))).not.toThrow();
    expect(() => assertFiveLevelSet(LEVELS.slice(0, 4).map(createLevel))).toThrow("5개 수준");
  });

  it("formats student content and teacher guide separately", () => {
    const level = createLevel("쉬움");
    expect(formatLevelContent(level)).toContain("1. 1/2와 같은 그림을 고르세요.");
    expect(formatLevelContent(level)).not.toContain("반으로 나눈 그림");
    expect(formatAnswerGuide(level)).toContain("교사용 조정 메모");
  });

  it("validates and normalizes AI JSON output wrapped in markdown fences", () => {
    const rawPayload = {
      analysis: {
        learningGoal: "일차방정식의 해를 구한다.",
        subject: "수학",
        suggestedGradeBand: "중학교 1학년",
        skills: ["이항", "등식의 성질"],
        sourceSummary: "일차방정식 기초 문제",
      },
      worksheets: [...LEVELS].reverse().map(createLevel),
    };
    const fenced = "```json\n" + JSON.stringify(rawPayload) + "\n```";
    const parsed = parseAndValidateGeneratedWorksheet(fenced);
    expect(parsed.worksheets.map(w => w.level)).toEqual([...LEVELS]);
    expect(parsed.worksheets[0]?.questions[0]?.number).toBe(1);
  });
});
