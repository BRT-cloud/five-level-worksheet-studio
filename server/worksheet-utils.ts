import {
  assertFiveLevelSet,
  formatAnswerGuide,
  formatLevelContent,
  generatedLevelSchema,
  generatedQuestionSchema,
  generatedWorksheetSchema,
  LEVELS,
  type GeneratedLevel,
  type GeneratedQuestion,
  type GeneratedWorksheet,
  type WorksheetLevelName,
} from "../shared/worksheet-schema.js";

export {
  assertFiveLevelSet,
  formatAnswerGuide,
  formatLevelContent,
  generatedLevelSchema,
  generatedQuestionSchema,
  generatedWorksheetSchema,
  LEVELS,
  type GeneratedLevel,
  type GeneratedQuestion,
  type GeneratedWorksheet,
  type WorksheetLevelName,
};

export function parseAndValidateGeneratedWorksheet(rawContent: string): GeneratedWorksheet {
  const jsonText = rawContent
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(jsonText);
  } catch {
    throw new Error(
      `AI가 JSON 형식의 학습지를 반환하지 않았습니다. 응답: ${rawContent.slice(0, 160)}`
    );
  }

  if (
    parsedUnknown &&
    typeof parsedUnknown === "object" &&
    "worksheets" in parsedUnknown &&
    Array.isArray((parsedUnknown as { worksheets?: unknown[] }).worksheets)
  ) {
    assertFiveLevelSet((parsedUnknown as { worksheets: GeneratedLevel[] }).worksheets);
  }

  const validated = generatedWorksheetSchema.safeParse(parsedUnknown);
  if (!validated.success) {
    const issueSummary = validated.error.issues
      .slice(0, 3)
      .map(issue => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`AI 학습지 데이터 검증에 실패했습니다: ${issueSummary}`);
  }

  assertFiveLevelSet(validated.data.worksheets);

  const orderedWorksheets = LEVELS.map(levelName => {
    const found = validated.data.worksheets.find(w => w.level === levelName)!;
    return {
      ...found,
      questions: found.questions.map((q, idx) => ({
        ...q,
        number: idx + 1,
      })),
    };
  });

  return {
    analysis: validated.data.analysis,
    worksheets: orderedWorksheets,
  };
}

export function buildWorksheetPrompt(sourceLabel: string) {
  return `당신은 한국의 중학교 교사를 돕는 보편적 학습 설계(UDL) 전문가입니다. 제공된 원본 학습지(${sourceLabel})의 내용만으로 교과, 추천 학년군(중학교 1~3학년 범위), 핵심 학습 목표, 요구 역량을 분석하고, 학생의 다양한 출발점에 맞는 5단계 맞춤 학습지를 설계하세요.

반드시 다음의 한국어 난이도 명칭을 정확히 한 번씩만 사용하세요: 매우 쉬움, 쉬움, 보통, 어려움, 매우 어려움.

[수준별 설계 원칙]
- 매우 쉬움: 핵심 개념 디딤돌. 용어 풀이, 시각적 단서, 빈칸 채우기, 선택형·단답형 발문으로 인지적 부담을 낮추고 성공 경험을 제공합니다.
- 쉬움: 기초 확인과 단계별 안내. 풀이 절차의 힌트를 함께 제시하여 기본 문항을 스스로 해결하도록 돕습니다.
- 보통: 중학교 정규 수업의 표준 성취 수준. 원본 학습지의 핵심 목표와 난이도를 충실히 반영합니다.
- 어려움: 개념 간 연결, 오류 찾기, 이유 설명하기 등 한 단계 깊은 추론을 요구합니다.
- 매우 어려움: 실생활 모델링, 조건 변형, 창의적 적용·서술형 등 심화 전이 과제를 제시합니다.

각 수준은 최소 2문항 이상으로 구성하며 독립적으로 인쇄해 수업에서 바로 쓸 수 있어야 합니다. 문항은 학생에게 친절하고 명료한 한국어로 작성하세요. 교사용 정답·피드백 단서는 answerGuide에만 작성하고 학생용 prompt에는 정답을 드러내지 마세요. 원본에 정보가 부족하면 사실을 꾸며내지 말고 핵심 개념에 맞는 일반화된 연습 문항으로 보완하세요.`;
}
