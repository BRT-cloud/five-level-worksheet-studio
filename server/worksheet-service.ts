import { invokeLLM, type Message } from "./_core/llm.js";
import {
  buildWorksheetPrompt,
  parseAndValidateGeneratedWorksheet,
  type GeneratedWorksheet,
} from "./worksheet-utils.js";

const worksheetSchema = {
  type: "object",
  properties: {
    analysis: {
      type: "object",
      properties: {
        learningGoal: { type: "string" },
        subject: { type: "string" },
        suggestedGradeBand: { type: "string" },
        skills: { type: "array", items: { type: "string" } },
        sourceSummary: { type: "string" },
      },
      required: ["learningGoal", "subject", "suggestedGradeBand", "skills", "sourceSummary"],
      additionalProperties: false,
    },
    worksheets: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          level: { type: "string", enum: ["매우 쉬움", "쉬움", "보통", "어려움", "매우 어려움"] },
          title: { type: "string" },
          learningGoal: { type: "string" },
          instructions: { type: "string" },
          questions: {
            type: "array",
            minItems: 2,
            items: {
              type: "object",
              properties: {
                number: { type: "integer" },
                prompt: { type: "string" },
                type: { type: "string" },
                answerGuide: { type: "string" },
              },
              required: ["number", "prompt", "type", "answerGuide"],
              additionalProperties: false,
            },
          },
          teacherNote: { type: "string" },
        },
        required: ["level", "title", "learningGoal", "instructions", "questions", "teacherNote"],
        additionalProperties: false,
      },
    },
  },
  required: ["analysis", "worksheets"],
  additionalProperties: false,
} as const;

export async function generateFiveLevelWorksheets(input: {
  sourceLabel: string;
  sourceText?: string | null;
  sourceUrl?: string | null;
  mimeType?: string | null;
}): Promise<GeneratedWorksheet> {
  const userContent = input.sourceText
    ? `다음은 원본 학습지의 텍스트입니다.\n\n${input.sourceText.slice(0, 42000)}`
    : input.mimeType === "application/pdf"
      ? [
          { type: "text" as const, text: "첨부된 PDF 학습지를 분석해 주세요." },
          { type: "file_url" as const, file_url: { url: input.sourceUrl!, mime_type: "application/pdf" as const } },
        ]
      : [
          { type: "text" as const, text: "첨부된 이미지 학습지를 읽고 분석해 주세요." },
          { type: "image_url" as const, image_url: { url: input.sourceUrl!, detail: "high" as const } },
        ];

  const baseMessages: Message[] = [
    { role: "system", content: buildWorksheetPrompt(input.sourceLabel) },
    { role: "user", content: userContent },
  ];

  const response = await invokeLLM({
    model: undefined,
    maxTokens: 16384,
    messages: baseMessages,
    response_format: {
      type: "json_schema",
      json_schema: { name: "five_level_worksheet", strict: true, schema: worksheetSchema },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("AI가 학습지 결과를 반환하지 않았습니다.");
  }

  try {
    return parseAndValidateGeneratedWorksheet(content);
  } catch (firstError) {
    // One automatic repair retry if the initial JSON output was truncated or failed schema validation
    const repairResponse = await invokeLLM({
      model: undefined,
      maxTokens: 16384,
      messages: [
        ...baseMessages,
        { role: "assistant", content: content.slice(0, 6000) },
        {
          role: "user",
          content: `이전 응답이 유효한 5단계 학습지 JSON 규격을 충족하지 못했습니다(${firstError instanceof Error ? firstError.message : "형식 오류"}). 반드시 매우 쉬움, 쉬움, 보통, 어려움, 매우 어려움 5개 수준을 모두 포함한 완전한 JSON만 반환하세요.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "five_level_worksheet", strict: true, schema: worksheetSchema },
      },
    });
    const repairedContent = repairResponse.choices[0]?.message?.content;
    if (!repairedContent || typeof repairedContent !== "string") {
      throw firstError;
    }
    return parseAndValidateGeneratedWorksheet(repairedContent);
  }
}
