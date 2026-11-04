import { z } from "zod";

export const LEVELS = ["매우 쉬움", "쉬움", "보통", "어려움", "매우 어려움"] as const;

export type WorksheetLevelName = (typeof LEVELS)[number];

export const generatedQuestionSchema = z.object({
  number: z.number().int().min(1),
  prompt: z.string().min(1),
  type: z.string().min(1).default("단답형"),
  answerGuide: z.string().min(1),
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

export const generatedLevelSchema = z.object({
  level: z.enum(LEVELS),
  title: z.string().min(1),
  learningGoal: z.string().min(1),
  instructions: z.string().min(1),
  questions: z.array(generatedQuestionSchema).min(2),
  teacherNote: z.string().min(1),
});

export type GeneratedLevel = z.infer<typeof generatedLevelSchema>;

export const generatedWorksheetSchema = z.object({
  analysis: z.object({
    learningGoal: z.string().min(1),
    subject: z.string().min(1),
    suggestedGradeBand: z.string().min(1),
    skills: z.array(z.string()).default([]),
    sourceSummary: z.string().min(1),
  }),
  worksheets: z.array(generatedLevelSchema).length(5),
});

export type GeneratedWorksheet = z.infer<typeof generatedWorksheetSchema>;

export function assertFiveLevelSet(worksheets: GeneratedLevel[]) {
  if (worksheets.length !== LEVELS.length) {
    throw new Error("AI가 5개 수준의 학습지를 모두 만들지 못했습니다.");
  }
  const actual = new Set(worksheets.map(worksheet => worksheet.level));
  if (actual.size !== LEVELS.length || LEVELS.some(level => !actual.has(level))) {
    throw new Error("AI 결과의 수준 구성이 올바르지 않습니다.");
  }
}

export function formatLevelContent(level: Pick<GeneratedLevel, "instructions" | "questions">) {
  const questions = level.questions
    .map((question, idx) => `${question.number || idx + 1}. ${question.prompt}`)
    .join("\n\n");
  return `${level.instructions}\n\n${questions}`.trim();
}

export function formatAnswerGuide(level: Pick<GeneratedLevel, "questions" | "teacherNote">) {
  const answers = level.questions
    .map((question, idx) => `${question.number || idx + 1}. ${question.answerGuide}`)
    .join("\n");
  return `${answers}\n\n교사용 조정 메모: ${level.teacherNote}`.trim();
}
