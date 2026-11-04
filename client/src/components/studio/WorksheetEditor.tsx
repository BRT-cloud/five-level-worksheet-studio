import { Button } from "@/components/ui/button";
import { LEVEL_STYLES } from "@/components/studio/UploadPanel";
import type { StoredWorksheet, StoredWorksheetLevel } from "@/lib/worksheet-store";
import { cn } from "@/lib/utils";
import {
  formatAnswerGuide,
  formatLevelContent,
  LEVELS,
  type GeneratedQuestion,
  type WorksheetLevelName,
} from "@shared/worksheet-schema";
import {
  ArrowDown,
  ArrowUp,
  Check,
  FileDown,
  FileText,
  Layers,
  Lightbulb,
  ListChecks,
  PanelTop,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { KeyboardEvent, useRef, useState } from "react";

export type LevelDraft = {
  id: number;
  level: WorksheetLevelName;
  title: string;
  learningGoal: string;
  instructions: string;
  questions: GeneratedQuestion[];
  teacherNote: string;
  content: string;
  answerGuide: string;
};

export function WorksheetEditor({
  worksheet,
  orderedLevels,
  drafts,
  activeLevel,
  setActiveLevel,
  includeAnswerGuide,
  setIncludeAnswerGuide,
  printLevel,
  onUpdateDraft,
  onSaveLevel,
  onPrintLevel,
  onDownloadLevel,
  onDownloadBundle,
  isSaving,
  isExporting,
  isBundling,
  bundleFormat,
}: {
  worksheet: StoredWorksheet;
  orderedLevels: StoredWorksheetLevel[];
  drafts: Record<number, LevelDraft>;
  activeLevel: WorksheetLevelName;
  setActiveLevel: (level: WorksheetLevelName) => void;
  includeAnswerGuide: boolean;
  setIncludeAnswerGuide: (val: boolean) => void;
  printLevel: string | null;
  onUpdateDraft: (levelId: number, nextDraft: LevelDraft) => void;
  onSaveLevel: (level: StoredWorksheetLevel) => void;
  onPrintLevel: (levelName: WorksheetLevelName) => void;
  onDownloadLevel: (levelId: number, format: "docx" | "hwpx") => void;
  onDownloadBundle: (format: "docx" | "hwpx") => void;
  isSaving: boolean;
  isExporting: boolean;
  isBundling: boolean;
  bundleFormat?: "docx" | "hwpx";
}) {
  const [editMode, setEditMode] = useState<"document" | "questions">("document");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function isLevelDirty(level: StoredWorksheetLevel, draft: LevelDraft | undefined): boolean {
    if (!draft) return false;
    return (
      draft.title !== level.title ||
      draft.learningGoal !== level.learningGoal ||
      draft.content !== level.content ||
      draft.answerGuide !== level.answerGuide
    );
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    if (orderedLevels.length === 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % orderedLevels.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + orderedLevels.length) % orderedLevels.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = orderedLevels.length - 1;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      const targetLevel = orderedLevels[nextIndex];
      if (targetLevel) {
        setActiveLevel(targetLevel.level);
        tabRefs.current[nextIndex]?.focus();
      }
    }
  }

  function syncDraftWithQuestions(
    draft: LevelDraft,
    nextQuestions: GeneratedQuestion[],
    nextInstructions = draft.instructions,
    nextTeacherNote = draft.teacherNote
  ): LevelDraft {
    const normalizedQuestions = nextQuestions.map((q, idx) => ({
      ...q,
      number: idx + 1,
    }));
    return {
      ...draft,
      instructions: nextInstructions,
      questions: normalizedQuestions,
      teacherNote: nextTeacherNote,
      content: formatLevelContent({ instructions: nextInstructions, questions: normalizedQuestions }),
      answerGuide: formatAnswerGuide({ questions: normalizedQuestions, teacherNote: nextTeacherNote }),
    };
  }

  return (
    <section className="space-y-5">
      {/* Worksheet Summary Header */}
      <div className="no-print flex flex-col gap-4 rounded-[1.5rem] border-2 border-black bg-[#181616] px-5 py-5 text-white paper-shadow sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div className="max-w-2xl">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-[#f7df78] px-2.5 py-1 text-[11px] font-bold text-black">
              {worksheet.subject || "교과 미정"}
            </span>
            <span className="rounded-full border border-white/40 px-2.5 py-1 text-[11px]">
              {worksheet.gradeBand || "중학교"}
            </span>
            {worksheet.analysis?.skills?.slice(0, 3).map(skill => (
              <span
                key={skill}
                className="rounded-full bg-[#bfe8dc] px-2.5 py-1 text-[11px] font-bold text-black"
              >
                {skill}
              </span>
            ))}
          </div>
          <h2 className="display-type text-2xl sm:text-3xl">{worksheet.title}</h2>
          <p className="mt-2 text-sm leading-6 text-white/75">
            {worksheet.analysis?.learningGoal ?? "원본 학습지의 핵심 학습 목표를 바탕으로 5단계를 구성했습니다."}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditMode(editMode === "document" ? "questions" : "document")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-white bg-white/10 px-3.5 text-xs font-bold text-white transition hover:bg-white hover:text-black"
          >
            {editMode === "document" ? (
              <>
                <ListChecks className="size-3.5" />
                문항별 카드 편집으로 전환
              </>
            ) : (
              <>
                <Layers className="size-3.5" />
                A4 문서 전체 편집으로 전환
              </>
            )}
          </button>
        </div>
      </div>

      {/* WAI-ARIA Level Tabs */}
      <div className="no-print rounded-[1.25rem] border-2 border-black bg-white p-3 hard-shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
          <div>
            <p className="display-type text-sm">수준을 선택해 온전한 학습지로 보기</p>
            <p className="mt-0.5 text-xs text-black/60">
              선택한 수준만 A4 인쇄 페이지 형태로 편집·인쇄합니다. (방향키 ←/→로 탭 전환 가능)
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-black/60">
            <PanelTop className="size-3.5" />5개 수준 전환
          </span>
        </div>
        <div
          role="tablist"
          aria-label="학습지 수준 선택"
          className="grid grid-cols-1 gap-2 sm:grid-cols-5"
        >
          {orderedLevels.map((level, index) => {
            const style = LEVEL_STYLES[level.level] ?? LEVEL_STYLES["보통"];
            const isActive = activeLevel === level.level;
            const dirty = isLevelDirty(level, drafts[level.id]);
            const tabId = `worksheet-tab-${level.id}`;
            const panelId = `worksheet-panel-${level.id}`;

            return (
              <button
                key={level.id}
                ref={el => {
                  tabRefs.current[index] = el;
                }}
                id={tabId}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                onKeyDown={e => handleTabKeyDown(e, index)}
                onClick={() => setActiveLevel(level.level)}
                className={cn(
                  "rounded-xl border-2 border-black px-3 py-2 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black active:scale-[.98]",
                  isActive ? "hard-shadow-sm -translate-y-0.5" : "bg-white hover:bg-[#fff4ed]"
                )}
                style={isActive ? { backgroundColor: style.fill } : undefined}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="block text-xs font-extrabold">{level.level}</span>
                  {dirty && (
                    <span className="rounded-full bg-black px-1.5 py-0.5 text-[9px] font-bold text-white">
                      수정됨
                    </span>
                  )}
                </div>
                <span className="mt-0.5 block text-[10px] text-black/60">{style.note}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bundle Export Toolbar */}
      <div className="no-print flex flex-col gap-3 rounded-[1.25rem] border-2 border-black bg-white p-4 hard-shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="display-type text-sm">5개 수준 전체 묶음 내려받기</p>
          <p className="mt-1 text-xs text-black/60">
            현재 편집 중인 5개 수준을 모두 반영해 하나의 ZIP 압축 파일로 내려받습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-full border-2 border-black bg-[#fff4ed] px-3 py-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={includeAnswerGuide}
              onChange={event => setIncludeAnswerGuide(event.target.checked)}
              className="size-3.5 accent-black"
            />
            교사용 정답지 포함
          </label>
          <Button
            type="button"
            onClick={() => onDownloadBundle("docx")}
            disabled={isBundling}
            className="h-9 rounded-full border-2 border-black bg-[#e5ddff] px-3 text-xs text-black hover:bg-[#e5ddff]/75"
          >
            <FileDown className="mr-1.5 size-3.5" />
            {isBundling && bundleFormat === "docx" ? "ZIP 생성 중" : "Word 묶음 ZIP"}
          </Button>
          <Button
            type="button"
            onClick={() => onDownloadBundle("hwpx")}
            disabled={isBundling}
            className="h-9 rounded-full border-2 border-black bg-[#d8f4dd] px-3 text-xs text-black hover:bg-[#d8f4dd]/75"
          >
            <FileDown className="mr-1.5 size-3.5" />
            {isBundling && bundleFormat === "hwpx" ? "ZIP 생성 중" : "한글 묶음 ZIP"}
          </Button>
        </div>
      </div>

      {/* Active Level Tabpanel / Printable A4 Card */}
      {orderedLevels.map(level => {
        if (level.level !== activeLevel) return null;
        const draft = drafts[level.id];
        const style = LEVEL_STYLES[level.level] ?? LEVEL_STYLES["보통"];
        if (!draft) return null;
        const dirty = isLevelDirty(level, draft);
        const tabId = `worksheet-tab-${level.id}`;
        const panelId = `worksheet-panel-${level.id}`;

        return (
          <article
            key={level.id}
            id={panelId}
            role="tabpanel"
            aria-labelledby={tabId}
            className={cn(
              "worksheet-card a4-paper mx-auto flex min-h-[1050px] w-full max-w-[820px] flex-col rounded-[1.4rem] border-2 border-black bg-[#fffdf9] p-6 paper-shadow sm:p-10",
              printLevel === level.level && "print-target"
            )}
          >
            <header className="worksheet-header mb-8 border-b-2 border-black pb-5 text-center">
              <span
                className="inline-flex rounded-full border-2 border-black px-3 py-1 text-xs font-extrabold"
                style={{ backgroundColor: style.fill }}
              >
                {level.level}
              </span>
              <p className="mt-2 text-xs text-black/55">{style.note}</p>
              <input
                value={draft.title}
                onChange={e => onUpdateDraft(level.id, { ...draft, title: e.target.value })}
                className="display-type mt-5 w-full bg-transparent text-center text-3xl leading-tight sm:text-4xl"
                aria-label={`${level.level} 학습지 제목`}
              />
            </header>

            <div className="mb-6 grid gap-3 border-b border-black/40 pb-5 text-xs sm:grid-cols-2">
              <label className="flex items-center gap-2">
                학교{" "}
                <input
                  className="min-w-0 flex-1 border-b border-black bg-transparent px-1 py-1"
                  aria-label="학교"
                />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="flex items-center gap-1">
                  학년{" "}
                  <input
                    className="min-w-0 flex-1 border-b border-black bg-transparent px-1 py-1"
                    aria-label="학년"
                  />
                </label>
                <label className="flex items-center gap-1">
                  반{" "}
                  <input
                    className="min-w-0 flex-1 border-b border-black bg-transparent px-1 py-1"
                    aria-label="반"
                  />
                </label>
                <label className="flex items-center gap-1">
                  번호{" "}
                  <input
                    className="min-w-0 flex-1 border-b border-black bg-transparent px-1 py-1"
                    aria-label="번호"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 sm:col-span-2">
                이름{" "}
                <input
                  className="min-w-0 flex-1 border-b border-black bg-transparent px-1 py-1"
                  aria-label="이름"
                />
              </label>
            </div>

            <section className="border-y-2 border-black py-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.11em] text-black/50">
                Learning goal · 학습 목표
              </p>
              <textarea
                value={draft.learningGoal}
                onChange={e => onUpdateDraft(level.id, { ...draft, learningGoal: e.target.value })}
                rows={2}
                className="w-full resize-y bg-transparent text-sm leading-6"
                aria-label={`${level.level} 학습 목표`}
              />
            </section>

            {editMode === "questions" && draft.questions.length > 0 ? (
              <section className="mt-7 flex-1 space-y-4">
                <div className="rounded-xl border-2 border-black bg-[#fff4ed] p-3">
                  <label className="block text-xs font-bold">
                    학생 안내문 (지시문)
                    <input
                      value={draft.instructions}
                      onChange={e =>
                        onUpdateDraft(
                          level.id,
                          syncDraftWithQuestions(draft, draft.questions, e.target.value, draft.teacherNote)
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-black/30 bg-white px-2.5 py-1.5 text-sm"
                    />
                  </label>
                </div>

                {draft.questions.map((question, qIndex) => (
                  <div
                    key={qIndex}
                    className="rounded-xl border-2 border-black bg-white p-4 hard-shadow-sm"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="grid size-6 place-items-center rounded-full border border-black bg-[#f7df78] text-xs font-extrabold">
                          {qIndex + 1}
                        </span>
                        <input
                          value={question.type}
                          onChange={e => {
                            const next = [...draft.questions];
                            next[qIndex] = { ...question, type: e.target.value };
                            onUpdateDraft(level.id, syncDraftWithQuestions(draft, next));
                          }}
                          aria-label={`${qIndex + 1}번 문항 유형`}
                          className="w-28 rounded-full border border-black/40 bg-[#fff4ed] px-2.5 py-0.5 text-xs font-bold"
                        />
                      </div>
                      <div className="editor-controls flex items-center gap-1">
                        <button
                          type="button"
                          disabled={qIndex === 0}
                          onClick={() => {
                            const next = [...draft.questions];
                            [next[qIndex - 1], next[qIndex]] = [next[qIndex]!, next[qIndex - 1]!];
                            onUpdateDraft(level.id, syncDraftWithQuestions(draft, next));
                          }}
                          className="rounded border border-black p-1 disabled:opacity-30"
                          title="위로 이동"
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={qIndex === draft.questions.length - 1}
                          onClick={() => {
                            const next = [...draft.questions];
                            [next[qIndex], next[qIndex + 1]] = [next[qIndex + 1]!, next[qIndex]!];
                            onUpdateDraft(level.id, syncDraftWithQuestions(draft, next));
                          }}
                          className="rounded border border-black p-1 disabled:opacity-30"
                          title="아래로 이동"
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={draft.questions.length <= 2}
                          onClick={() => {
                            const next = draft.questions.filter((_, idx) => idx !== qIndex);
                            onUpdateDraft(level.id, syncDraftWithQuestions(draft, next));
                          }}
                          className="rounded border border-black p-1 text-red-700 disabled:opacity-30"
                          title="문항 삭제 (최소 2문항 유지)"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    <label className="block text-xs font-bold text-black/70">
                      학생용 발문
                      <textarea
                        value={question.prompt}
                        onChange={e => {
                          const next = [...draft.questions];
                          next[qIndex] = { ...question, prompt: e.target.value };
                          onUpdateDraft(level.id, syncDraftWithQuestions(draft, next));
                        }}
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-black/30 bg-[#fffdf9] p-2 text-sm leading-6"
                      />
                    </label>

                    <label className="mt-2 block text-xs font-bold text-black/70">
                      교사용 정답 및 피드백 단서
                      <textarea
                        value={question.answerGuide}
                        onChange={e => {
                          const next = [...draft.questions];
                          next[qIndex] = { ...question, answerGuide: e.target.value };
                          onUpdateDraft(level.id, syncDraftWithQuestions(draft, next));
                        }}
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-black/30 bg-[#fff0e8] p-2 text-xs leading-5"
                      />
                    </label>
                  </div>
                ))}

                <div className="editor-controls flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const next = [
                        ...draft.questions,
                        {
                          number: draft.questions.length + 1,
                          prompt: "새 문항을 입력하세요.",
                          type: "서술형",
                          answerGuide: "예시 정답 및 채점 기준을 입력하세요.",
                        },
                      ];
                      onUpdateDraft(level.id, syncDraftWithQuestions(draft, next));
                    }}
                    className="rounded-full border-2 border-black bg-white text-xs font-bold hover:bg-[#fff4ed]"
                  >
                    <Plus className="mr-1.5 size-3.5" />
                    문항 추가하기
                  </Button>
                </div>
              </section>
            ) : (
              <section className="mt-7 flex-1">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.11em] text-black/50">
                  Worksheet · 학생용 학습지 본문
                </p>
                <textarea
                  value={draft.content}
                  onChange={e => onUpdateDraft(level.id, { ...draft, content: e.target.value })}
                  rows={24}
                  className="min-h-[470px] w-full resize-y whitespace-pre-wrap bg-transparent text-base leading-8"
                  aria-label={`${level.level} 학생용 학습지`}
                />
              </section>
            )}

            <details
              open={includeAnswerGuide}
              className={cn(
                "teacher-guide mt-6 rounded-xl border-2 border-black bg-[#fff0e8] p-3",
                includeAnswerGuide ? "print-guide" : "editor-controls"
              )}
            >
              <summary className="cursor-pointer text-sm font-bold">
                교사용 정답·피드백 안내 {includeAnswerGuide && "(인쇄·내보내기에 포함됨)"}
              </summary>
              <textarea
                value={draft.answerGuide}
                onChange={e => onUpdateDraft(level.id, { ...draft, answerGuide: e.target.value })}
                rows={5}
                className="mt-3 w-full resize-y bg-transparent text-sm leading-6"
                aria-label={`${level.level} 교사용 정답 안내`}
              />
            </details>

            <footer className="editor-controls mt-6 grid gap-3 border-t-2 border-black pt-5 sm:grid-cols-[1fr_auto_auto_auto]">
              <Button
                type="button"
                onClick={() => onSaveLevel(level)}
                disabled={isSaving}
                className="h-10 rounded-full border-2 border-black bg-black text-sm text-white hover:bg-black/80"
              >
                <Check className="mr-2 size-4" />
                {isSaving ? "저장 중" : dirty ? "변경사항 저장하기 *" : "이 수준 저장 완료"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onPrintLevel(level.level)}
                className="h-10 rounded-full border-2 border-black bg-[#f7df78] px-4 text-sm hover:bg-[#f7df78]/75"
              >
                <Printer className="mr-1.5 size-4" />
                인쇄·PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onDownloadLevel(level.id, "docx")}
                disabled={isExporting}
                className="h-10 rounded-full border-2 border-black bg-[#e5ddff] px-4 text-sm hover:bg-[#e5ddff]/75"
              >
                <FileText className="mr-1.5 size-4" />
                Word
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onDownloadLevel(level.id, "hwpx")}
                disabled={isExporting}
                className="h-10 rounded-full border-2 border-black bg-[#d8f4dd] px-4 text-sm hover:bg-[#d8f4dd]/75"
              >
                <FileDown className="mr-1.5 size-4" />
                한글
              </Button>
            </footer>
          </article>
        );
      })}

      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-[1.2rem] border-2 border-black bg-[#f7df78] px-4 py-3 text-sm hard-shadow-sm">
        <span className="flex items-center gap-2 font-bold">
          <Lightbulb className="size-4" />
          작성·편집한 모든 학습지는 로그인 없이 이 브라우저 보관함에 자동 보관됩니다.
        </span>
        <span className="text-xs text-black/65">인쇄 창에서 대상 프린터를 &apos;PDF로 저장&apos;으로 선택하면 PDF로 내려받을 수 있어요.</span>
      </div>
    </section>
  );
}

