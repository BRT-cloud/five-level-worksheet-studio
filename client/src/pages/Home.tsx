import { Button } from "@/components/ui/button";
import DashboardLayout from "@/components/DashboardLayout";
import { UploadPanel } from "@/components/studio/UploadPanel";
import {
  WorksheetEditor,
  type LevelDraft,
} from "@/components/studio/WorksheetEditor";
import { trpc } from "@/lib/trpc";
import {
  prepareDirectTextUpload,
  prepareWorksheetFileUpload,
} from "@/lib/upload-utils";
import { cn } from "@/lib/utils";
import {
  createSampleWorksheet,
  deleteStoredWorksheet,
  isWelcomeDismissed,
  listStoredWorksheets,
  saveStoredWorksheet,
  setWelcomeDismissed,
  type StoredWorksheet,
  type StoredWorksheetLevel,
} from "@/lib/worksheet-store";
import { LEVELS, type WorksheetLevelName } from "@shared/worksheet-schema";
import {
  Archive,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  FilePlus2,
  FileText,
  Loader2,
  Trash2,
  WandSparkles,
} from "lucide-react";
import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function fileKind(mime: string) {
  if (mime === "application/pdf") return "PDF";
  if (mime === "text/plain") return "TXT";
  return "이미지";
}

function toLevelDraft(level: StoredWorksheetLevel): LevelDraft {
  return {
    id: level.id,
    level: level.level,
    title: level.title,
    learningGoal: level.learningGoal,
    instructions: level.instructions || "문제를 읽고 차근차근 답해 보세요.",
    questions: level.questions ?? [],
    teacherNote: level.teacherNote || "",
    content: level.content,
    answerGuide: level.answerGuide,
  };
}

export default function Home() {
  const [location] = useLocation();
  const [entered, setEntered] = useState(() => isWelcomeDismissed() || location === "/library");

  function handleEnter() {
    setWelcomeDismissed(true);
    setEntered(true);
  }

  if (!entered) return <WelcomeScreen onEnter={handleEnter} />;
  return (
    <DashboardLayout>
      <WorksheetStudio />
    </DashboardLayout>
  );
}

function WelcomeScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <main className="welcome-screen relative min-h-screen overflow-hidden px-5 py-8 sm:px-10">
      <div className="welcome-orb welcome-orb-one" />
      <div className="welcome-orb welcome-orb-two" />
      <div className="welcome-star star-one">✦</div>
      <div className="welcome-star star-two">✦</div>
      <div className="welcome-doodle doodle-one">~~~~</div>
      <div className="welcome-doodle doodle-two">✎</div>
      <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col items-center justify-center text-center">
        <div className="welcome-mascot mb-7 grid size-28 place-items-center rounded-[2.2rem] border-2 border-black bg-[#f7df78] hard-shadow sm:size-36">
          <div className="relative">
            <BookOpen className="size-14 sm:size-20" strokeWidth={1.7} />
          </div>
        </div>
        <p className="display-type welcome-fade-in text-xs uppercase tracking-[0.2em] text-black/50">
          UDL 문제 변환기
        </p>
        <h1 className="display-type welcome-title welcome-fade-in mt-4 max-w-3xl text-5xl leading-[0.95] sm:text-7xl">
          한 장의 문제를
          <br />
          <span className="text-[#765bd6]">다섯 가지 출발점</span>으로
        </h1>
        <p className="welcome-fade-in mt-6 max-w-xl text-base leading-7 text-black/65 sm:text-lg">
          중학교 학습지를 올리거나 지문을 입력하면 학생의 속도와 필요에 맞는
          <br className="sm:hidden" /> 5단계 맞춤 학습지로 즉시 재구성해 드립니다.
        </p>
        <button
          type="button"
          onClick={onEnter}
          className="welcome-enter welcome-fade-in mt-9 inline-flex items-center gap-3 rounded-full border-2 border-black bg-black px-7 py-4 text-base font-bold text-white hard-shadow transition hover:-translate-y-1 hover:bg-[#765bd6]"
        >
          변환 스튜디오 접속하기 <ArrowUpRight className="size-5" />
        </button>
        <div className="welcome-fade-in mt-8 flex flex-wrap justify-center gap-2 text-xs font-bold">
          <span className="rounded-full border-2 border-black bg-white px-3 py-2">
            로그인 없이 브라우저 자동 저장
          </span>
          <span className="rounded-full border-2 border-black bg-[#d8f4dd] px-3 py-2">
            중학교 UDL 5단계 자동 재구성
          </span>
          <span className="rounded-full border-2 border-black bg-[#ffd2be] px-3 py-2">
            Word · 한글(HWPX) · ZIP 묶음 내보내기
          </span>
        </div>
      </section>
    </main>
  );
}

function WorksheetStudio() {
  const [location] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [library, setLibrary] = useState<StoredWorksheet[]>([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, LevelDraft>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [printLevel, setPrintLevel] = useState<string | null>(null);
  const [includeAnswerGuide, setIncludeAnswerGuide] = useState(false);
  const [activeLevel, setActiveLevel] = useState<WorksheetLevelName>("보통");
  const [isPreparingFile, setIsPreparingFile] = useState(false);
  const [lastUploadPayload, setLastUploadPayload] = useState<{
    name: string;
    mimeType: string;
    base64: string;
    sourceText?: string;
  } | null>(null);
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);

  const loadBrowserLibrary = useCallback(async (selectFirstIfEmpty = false) => {
    setIsLibraryLoading(true);
    try {
      const items = await listStoredWorksheets();
      setLibrary(items);
      if (selectFirstIfEmpty && items[0]) {
        setSelectedId(current => current ?? items[0]!.id);
      }
    } finally {
      setIsLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBrowserLibrary(location === "/library");
  }, [loadBrowserLibrary, location]);

  const selectedWorksheet = useMemo(
    () => library.find(item => item.id === selectedId) ?? null,
    [library, selectedId]
  );

  useEffect(() => {
    if (!selectedWorksheet) return;
    setDrafts(
      Object.fromEntries(
        selectedWorksheet.levels.map(level => [level.id, toLevelDraft(level)])
      )
    );
  }, [selectedWorksheet]);

  const generateMutation = trpc.worksheets.generate.useMutation({
    onSuccess: async worksheet => {
      if (!worksheet) return;
      setLastErrorMessage(null);
      setLastUploadPayload(null);
      const saved = await saveStoredWorksheet(worksheet as unknown as StoredWorksheet);
      const updatedList = await listStoredWorksheets();
      setLibrary(updatedList);
      setSelectedId(saved.id);
      toast.success("5개 수준별 학습지를 생성해 브라우저 보관함에 저장했어요.");
    },
    onError: error => {
      setLastErrorMessage(error.message);
      toast.error(error.message);
    },
  });

  const saveMutation = trpc.worksheets.saveLevel.useMutation();

  function saveDownload(
    data: { base64: string; filename: string; mimeType: string },
    successMessage: string
  ) {
    const binary = Uint8Array.from(atob(data.base64), char => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([binary], { type: data.mimeType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = data.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(successMessage);
  }

  const exportMutation = trpc.worksheets.download.useMutation({
    onSuccess: data => {
      saveDownload(
        data,
        data.filename.endsWith(".docx")
          ? "Word(.docx) 파일을 내려받았어요."
          : "한글(.hwpx) 파일을 내려받았어요."
      );
    },
    onError: error => toast.error(error.message),
  });

  const bundleMutation = trpc.worksheets.downloadBundle.useMutation({
    onSuccess: data => saveDownload(data, "5개 수준별 학습지 전체 묶음(ZIP)을 내려받았어요."),
    onError: error => toast.error(error.message),
  });

  const orderedLevels = useMemo(() => {
    if (!selectedWorksheet) return [];
    return [...selectedWorksheet.levels].sort(
      (a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level)
    );
  }, [selectedWorksheet]);

  useEffect(() => {
    if (orderedLevels.length && !orderedLevels.some(level => level.level === activeLevel)) {
      setActiveLevel(
        orderedLevels.find(level => level.level === "보통")?.level ?? orderedLevels[0]!.level
      );
    }
  }, [activeLevel, orderedLevels]);

  async function handleFileSelect(file: File) {
    setIsPreparingFile(true);
    setLastErrorMessage(null);
    try {
      const prepared = await prepareWorksheetFileUpload(file);
      setLastUploadPayload(prepared);
      generateMutation.mutate(prepared);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파일을 처리하지 못했습니다.");
    } finally {
      setIsPreparingFile(false);
    }
  }

  function handleDirectTextSubmit(title: string, text: string) {
    setLastErrorMessage(null);
    try {
      const prepared = prepareDirectTextUpload(title, text);
      setLastUploadPayload(prepared);
      generateMutation.mutate(prepared);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "입력 내용을 확인해 주세요.");
    }
  }

  function handleRetryLastUpload() {
    if (!lastUploadPayload) return;
    setLastErrorMessage(null);
    generateMutation.mutate(lastUploadPayload);
  }

  async function handleLoadSample() {
    const sample = createSampleWorksheet();
    const saved = await saveStoredWorksheet(sample);
    const updatedList = await listStoredWorksheets();
    setLibrary(updatedList);
    setSelectedId(saved.id);
    toast.success("예시 5단계 학습지를 불러왔어요. 자유롭게 편집·내보내 보세요!");
  }

  async function handleDeleteWorksheet(id: number) {
    const nextList = await deleteStoredWorksheet(id);
    setLibrary(nextList);
    if (selectedId === id) {
      setSelectedId(nextList[0]?.id ?? null);
    }
    toast.success("보관함에서 학습지를 삭제했어요.");
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handleFileSelect(file);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFileSelect(file);
  }

  function updateDraft(levelId: number, nextDraft: LevelDraft) {
    setDrafts(current => ({ ...current, [levelId]: nextDraft }));
  }

  async function saveLevel(level: StoredWorksheetLevel) {
    const draft = drafts[level.id];
    if (!draft || !selectedWorksheet) return;

    const updatedWorksheet: StoredWorksheet = {
      ...selectedWorksheet,
      updatedAt: new Date().toISOString(),
      levels: selectedWorksheet.levels.map(item =>
        item.id === level.id
          ? {
            ...item,
            title: draft.title,
            learningGoal: draft.learningGoal,
            instructions: draft.instructions,
            questions: draft.questions,
            teacherNote: draft.teacherNote,
            content: draft.content,
            answerGuide: draft.answerGuide,
            updatedAt: new Date().toISOString(),
          }
          : item
      ),
    };

    await saveStoredWorksheet(updatedWorksheet);
    const refreshed = await listStoredWorksheets();
    setLibrary(refreshed);

    // Best-effort sync to server ephemeral cache if available
    saveMutation.mutate(
      {
        worksheetId: selectedWorksheet.id,
        levelId: level.id,
        title: draft.title,
        learningGoal: draft.learningGoal,
        content: draft.content,
        answerGuide: draft.answerGuide,
      },
      {
        onError: () => {
          // Browser storage is primary SSOT; ignore serverless ephemeral cache miss
        },
      }
    );

    toast.success(`'${level.level}' 수준의 변경 사항을 브라우저 보관함에 저장했어요.`);
  }

  function printOne(level: WorksheetLevelName) {
    setPrintLevel(level);
    window.setTimeout(() => window.print(), 80);
  }

  function downloadLevel(levelId: number, format: "docx" | "hwpx") {
    if (!selectedWorksheet) return;
    const draft = drafts[levelId];
    const levelObj = selectedWorksheet.levels.find(item => item.id === levelId);
    if (!draft && !levelObj) return;

    const snapshot = {
      worksheetTitle: selectedWorksheet.title,
      levelLabel: (draft?.level ?? levelObj!.level) as WorksheetLevelName,
      title: draft?.title ?? levelObj!.title,
      learningGoal: draft?.learningGoal ?? levelObj!.learningGoal,
      content: draft?.content ?? levelObj!.content,
      answerGuide: draft?.answerGuide ?? levelObj!.answerGuide,
    };

    exportMutation.mutate({
      worksheetId: selectedWorksheet.id,
      levelId,
      format,
      includeAnswerGuide,
      snapshot,
    });
  }

  function downloadBundle(format: "docx" | "hwpx") {
    if (!selectedWorksheet) return;
    const snapshotLevels = orderedLevels.map(level => {
      const draft = drafts[level.id];
      return {
        worksheetTitle: selectedWorksheet.title,
        levelLabel: level.level,
        title: draft?.title ?? level.title,
        learningGoal: draft?.learningGoal ?? level.learningGoal,
        content: draft?.content ?? level.content,
        answerGuide: draft?.answerGuide ?? level.answerGuide,
      };
    });

    bundleMutation.mutate({
      worksheetId: selectedWorksheet.id,
      format,
      includeAnswerGuide,
      snapshot: {
        worksheetTitle: selectedWorksheet.title,
        levels: snapshotLevels,
      },
    });
  }

  const isBusy = isPreparingFile || generateMutation.isPending;

  return (
    <div className="memphis-surface print-workspace min-h-[calc(100vh-2rem)] overflow-hidden rounded-[1.65rem] black-border relative">
      <div className="memphis-shape shape-circle bg-[#bfe8dc] size-24 -top-8 right-[10%] border-2 border-black" />
      <div className="memphis-shape shape-triangle top-36 -right-6" />
      <div className="memphis-shape shape-diamond top-20 right-[28%]" />
      <div className="memphis-shape shape-squiggle bottom-16 -left-1">~~~~</div>

      <header className="studio-header no-print relative z-10 flex flex-col gap-5 border-b-2 border-black bg-[#fff4ed]/90 px-5 py-5 backdrop-blur sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative grid size-12 place-items-center rounded-full border-2 border-black bg-[#f7df78] hard-shadow-sm">
            <span className="display-type text-xl">5</span>
            <span className="absolute -right-2 -top-2 size-3 rotate-45 bg-black" />
          </div>
          <div>
            <p className="display-type text-[0.7rem] uppercase tracking-[0.13em] text-black/55">
              adaptive worksheet studio
            </p>
            <h1 className="display-type text-2xl leading-none sm:text-3xl">다섯단계 학습지</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <div className="hidden rounded-full border-2 border-black bg-white px-3 py-1.5 text-xs font-semibold sm:block">
            브라우저 자동 보관 모드
          </div>
          {selectedWorksheet && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedId(null)}
              disabled={isBusy}
              className="h-10 rounded-full border-2 border-black bg-[#f7df78] px-4 text-sm font-bold text-black hover:bg-[#f7df78]/80"
            >
              <FilePlus2 className="mr-1.5 size-4" />새 학습지 만들기
            </Button>
          )}
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
            className="h-10 rounded-full border-2 border-black bg-black px-4 text-sm text-white shadow-none hover:bg-black/80 active:scale-[.97]"
          >
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : <FilePlus2 className="size-4" />}
            파일 바로 올리기
          </Button>
        </div>
      </header>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/*,text/plain"
        onChange={handleChange}
      />

      <div className="relative z-10 grid gap-6 p-5 sm:p-8 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="no-print order-2 xl:order-1">
          <div className="sticky top-5 rounded-[1.35rem] border-2 border-black bg-white p-4 hard-shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="display-type text-xs uppercase tracking-[0.08em]">내 브라우저 보관함</p>
                <p className="mt-0.5 text-xs text-black/55">{library.length}개의 학습지</p>
              </div>
              <Archive className="size-4" />
            </div>
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {isLibraryLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              )}
              {library.map(item => (
                <div
                  key={item.id}
                  className={cn(
                    "group flex items-start gap-1 rounded-xl border-2 p-2.5 transition-all",
                    selectedId === item.id
                      ? "border-black bg-[#e5ddff] hard-shadow-sm"
                      : "border-transparent bg-[#fff4ed] hover:border-black"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <FileText className="mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{item.title}</p>
                      <p className="mt-1 text-[11px] text-black/55">
                        {fileKind(item.originalMime)} · {formatDate(item.updatedAt)}
                      </p>
                    </div>
                    <ChevronRight className="mt-0.5 size-4 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteWorksheet(item.id)}
                    title="학습지 삭제"
                    aria-label={`${item.title} 삭제`}
                    className="rounded p-1 text-black/45 opacity-70 transition hover:bg-red-100 hover:text-red-700 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              {!isLibraryLoading && !library.length && (
                <div className="space-y-2 rounded-xl bg-[#fff4ed] p-4 text-center">
                  <p className="text-xs leading-5 text-black/60">
                    생성한 학습지가 이 브라우저에 자동 저장됩니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleLoadSample()}
                    className="text-xs font-bold underline hover:text-[#765bd6]"
                  >
                    예시 학습지 불러오기
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="order-1 min-w-0 xl:order-2">
          {!selectedWorksheet && !isBusy && lastErrorMessage && lastUploadPayload && (
            <div className="mb-5 flex flex-col gap-3 rounded-[1.4rem] border-2 border-black bg-[#ffd2be] p-4 hard-shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-bold text-black">학습지 변환에 일시적인 지연 또는 오류가 발생했습니다.</p>
                <p className="text-xs text-black/75">
                  &lsquo;{lastUploadPayload.name}&rsquo; 파일이 준비되어 있습니다. 파일을 다시 선택할 필요 없이 즉시 다시 요청할 수 있습니다.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  onClick={handleRetryLastUpload}
                  className="rounded-full border-2 border-black bg-black px-4 text-xs font-bold text-white hover:bg-black/80"
                >
                  <WandSparkles className="mr-1.5 size-3.5" />
                  방금 파일로 즉시 다시 시도
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLastErrorMessage(null)}
                  className="rounded-full border-2 border-black bg-white px-3 text-xs font-bold hover:bg-black/10"
                >
                  닫기
                </Button>
              </div>
            </div>
          )}

          {!selectedWorksheet && !isBusy && (
            <UploadPanel
              isDragging={isDragging}
              setIsDragging={setIsDragging}
              onDrop={handleDrop}
              onClickFile={() => inputRef.current?.click()}
              onSubmitDirectText={handleDirectTextSubmit}
              onLoadSample={() => void handleLoadSample()}
            />
          )}

          {isBusy && (
            <div
              role="status"
              aria-live="polite"
              className="relative overflow-hidden rounded-[1.7rem] border-2 border-black bg-[#181616] px-6 py-14 text-white paper-shadow"
            >
              <div className="memphis-shape shape-circle bg-[#f7df78] size-32 -right-8 -top-12 border-2 border-white" />
              <div className="relative flex max-w-xl flex-col gap-5">
                <div className="flex size-12 items-center justify-center rounded-full bg-[#c8b7ff] text-black">
                  <WandSparkles className="size-6" />
                </div>
                <div>
                  <p className="display-type text-3xl sm:text-4xl">
                    {isPreparingFile
                      ? "업로드 파일을 최적화하는 중"
                      : "학습지를 다섯 번, 다르게 생각하는 중"}
                  </p>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-white/75">
                    {isPreparingFile
                      ? "빠르고 안정적인 AI 분석을 위해 이미지 해상도와 문서를 정리하고 있어요."
                      : "Gemini AI가 학습 목표와 문항 구조를 분석해 매우 쉬움부터 매우 어려움까지 5단계 수업용 학습지를 설계하고 있어요."}
                  </p>
                </div>
                <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-white/20">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-[#f7df78]" />
                </div>
              </div>
            </div>
          )}

          {selectedWorksheet && !isBusy && (
            <WorksheetEditor
              worksheet={selectedWorksheet}
              orderedLevels={orderedLevels}
              drafts={drafts}
              activeLevel={activeLevel}
              setActiveLevel={setActiveLevel}
              includeAnswerGuide={includeAnswerGuide}
              setIncludeAnswerGuide={setIncludeAnswerGuide}
              printLevel={printLevel}
              onUpdateDraft={updateDraft}
              onSaveLevel={level => void saveLevel(level)}
              onPrintLevel={printOne}
              onDownloadLevel={downloadLevel}
              onDownloadBundle={downloadBundle}
              isSaving={saveMutation.isPending}
              isExporting={exportMutation.isPending}
              isBundling={bundleMutation.isPending}
              bundleFormat={bundleMutation.variables?.format}
            />
          )}
        </main>
      </div>
    </div>
  );
}
