import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LEVELS, type WorksheetLevelName } from "@shared/worksheet-schema";
import {
  ArrowUpRight,
  BookOpen,
  FileText,
  ImageIcon,
  Keyboard,
  Sparkles,
  Upload,
} from "lucide-react";
import { DragEvent, useState } from "react";

export const LEVEL_STYLES: Record<WorksheetLevelName, { fill: string; note: string }> = {
  "매우 쉬움": { fill: "#d8f4dd", note: "풍부한 안내와 짧은 단계" },
  "쉬움": { fill: "#f9e59d", note: "핵심 개념을 차근차근" },
  "보통": { fill: "#e3d9ff", note: "원 학습목표에 맞춘 연습" },
  "어려움": { fill: "#ffd2be", note: "추론을 더하는 문제" },
  "매우 어려움": { fill: "#bce9e0", note: "전이·설명·심화 과제" },
};

export function UploadPanel({
  isDragging,
  setIsDragging,
  onDrop,
  onClickFile,
  onSubmitDirectText,
  onLoadSample,
}: {
  isDragging: boolean;
  setIsDragging: (value: boolean) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onClickFile: () => void;
  onSubmitDirectText: (title: string, text: string) => void;
  onLoadSample: () => void;
}) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [directTitle, setDirectTitle] = useState("");
  const [directText, setDirectText] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="입력 방식 선택" className="inline-flex rounded-full border-2 border-black bg-white p-1 hard-shadow-sm">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "file"}
            onClick={() => setMode("file")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition",
              mode === "file" ? "bg-black text-white" : "text-black hover:bg-[#fff4ed]"
            )}
          >
            <Upload className="size-3.5" />
            파일 업로드 (PDF·이미지·TXT)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "text"}
            onClick={() => setMode("text")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition",
              mode === "text" ? "bg-black text-white" : "text-black hover:bg-[#fff4ed]"
            )}
          >
            <Keyboard className="size-3.5" />
            텍스트·문항 직접 입력
          </button>
        </div>

        <button
          type="button"
          onClick={onLoadSample}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-[#f7df78] px-4 py-2 text-xs font-bold hard-shadow-sm transition hover:-translate-y-0.5"
        >
          <BookOpen className="size-3.5" />
          예시 5단계 학습지 바로 체험하기
        </button>
      </div>

      {mode === "file" ? (
        <section
          role="button"
          tabIndex={0}
          aria-label="학습지 파일 업로드"
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onClickFile();
            }
          }}
          onClick={onClickFile}
          onDragOver={event => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={cn(
            "group relative cursor-pointer overflow-hidden rounded-[1.7rem] border-2 border-black p-6 transition-all focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-black sm:p-10",
            isDragging
              ? "bg-[#bfe8dc] hard-shadow"
              : "bg-white paper-shadow hover:-translate-y-1 hover:shadow-[10px_10px_0_#181616]"
          )}
        >
          <div className="memphis-shape shape-circle size-28 border-2 border-black bg-[#f7df78] -right-6 top-8" />
          <div className="memphis-shape shape-diamond bottom-10 right-[25%]" />
          <div className="memphis-shape shape-triangle -bottom-4 left-[32%]" />
          <div className="relative mx-auto max-w-2xl py-5 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-full border-2 border-black bg-[#e5ddff] hard-shadow-sm transition-transform group-hover:rotate-6">
              <Upload className="size-7" />
            </div>
            <div className="mx-auto mt-5 flex max-w-md items-center justify-center gap-1.5">
              {LEVELS.map((level, index) => (
                <div key={level} className="flex items-center gap-1.5">
                  <span
                    className="grid size-7 place-items-center rounded-full border-2 border-black text-[10px] font-extrabold"
                    style={{ backgroundColor: LEVEL_STYLES[level].fill }}
                  >
                    {index + 1}
                  </span>
                  {index < LEVELS.length - 1 && <span className="h-0.5 w-4 bg-black sm:w-8" />}
                </div>
              ))}
            </div>
            <p className="display-type mt-7 text-3xl sm:text-5xl">
              한 장의 학습지,
              <br />
              다섯 개의 출발점
            </p>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-black/65">
              원본 학습지를 올리면 학습 목표와 문항을 분석해 <b className="text-black">매우 쉬움부터 매우 어려움까지</b> 다섯 가지 수업용 학습지로 재구성합니다.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
              <span className="rounded-full border-2 border-black bg-[#d8f4dd] px-3 py-1.5 text-xs font-bold">
                <FileText className="mr-1 inline size-3.5" />
                PDF
              </span>
              <span className="rounded-full border-2 border-black bg-[#ffd2be] px-3 py-1.5 text-xs font-bold">
                <ImageIcon className="mr-1 inline size-3.5" />
                이미지 (고해상도 사진 자동 최적화)
              </span>
              <span className="rounded-full border-2 border-black bg-[#e5ddff] px-3 py-1.5 text-xs font-bold">
                TXT
              </span>
            </div>
            <Button className="mt-8 rounded-full border-2 border-black bg-black px-5 text-white hover:bg-black/80">
              <Sparkles className="mr-2 size-4" />
              학습지 업로드하기
              <ArrowUpRight className="ml-1 size-4" />
            </Button>
            <p className="mt-4 text-[11px] text-black/50">
              사진·스캔본 자동 압축 지원 · PDF, JPG, PNG, WEBP, TXT · 브라우저에 안전하게 자동 저장됩니다
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-[1.7rem] border-2 border-black bg-white p-6 paper-shadow sm:p-8">
          <h3 className="display-type text-xl">지문이나 문항을 직접 붙여넣어 5단계로 변환하기</h3>
          <p className="mt-1 text-xs text-black/65">
            파일이 없어도 교과서 지문, 기존 시험 문항, 또는 수업 주제를 입력하면 5단계 맞춤형 학습지를 생성합니다.
          </p>
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-bold">
              학습지 제목 (선택)
              <input
                value={directTitle}
                onChange={e => setDirectTitle(e.target.value)}
                placeholder="예: 중학교 2학년 과학 - 광합성과 호흡"
                className="mt-1 h-10 w-full rounded-xl border-2 border-black bg-[#fffdf9] px-3 text-sm outline-none focus:bg-[#fffdf3]"
              />
            </label>
            <label className="block text-xs font-bold">
              원본 지문 또는 문항 내용
              <textarea
                value={directText}
                onChange={e => setDirectText(e.target.value)}
                rows={7}
                placeholder="변환하고 싶은 학습지 문항, 지문, 또는 핵심 개념을 입력하세요..."
                className="mt-1 w-full rounded-xl border-2 border-black bg-[#fffdf9] p-3 text-sm leading-6 outline-none focus:bg-[#fffdf3]"
              />
            </label>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => onSubmitDirectText(directTitle, directText)}
                className="rounded-full border-2 border-black bg-black px-6 text-white hover:bg-black/80"
              >
                <Sparkles className="mr-2 size-4" />
                5단계 학습지 생성하기
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

