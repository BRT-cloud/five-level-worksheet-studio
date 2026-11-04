import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createWorksheetBundle, createWorksheetExport } from "../worksheet-export.js";
import { generateFiveLevelWorksheets } from "../worksheet-service.js";
import {
  formatAnswerGuide,
  formatLevelContent,
  LEVELS,
  type GeneratedQuestion,
  type GeneratedWorksheet,
  type WorksheetLevelName,
} from "../worksheet-utils.js";
import { publicProcedure, router } from "../_core/trpc.js";
import { ENV } from "../_core/env.js";

export type EphemeralWorksheetLevel = {
  id: number;
  worksheetId: number;
  level: WorksheetLevelName;
  title: string;
  learningGoal: string;
  instructions?: string;
  questions?: GeneratedQuestion[];
  teacherNote?: string;
  content: string;
  answerGuide: string;
  updatedAt: Date;
};

export type EphemeralWorksheet = {
  id: number;
  userId: number;
  title: string;
  originalName: string;
  originalMime: string;
  originalFileKey: string | null;
  sourceText: string | null;
  subject: string | null;
  gradeBand: string | null;
  status: "ready" | "failed";
  analysis: GeneratedWorksheet["analysis"] | null;
  createdAt: Date;
  updatedAt: Date;
  levels: EphemeralWorksheetLevel[];
};

const MAX_EPHEMERAL_WORKSHEETS = 100;
let nextWorksheetId = 1;
const ephemeralWorksheets = new Map<number, EphemeralWorksheet>();

export function storeEphemeralWorksheet(worksheet: EphemeralWorksheet) {
  if (ephemeralWorksheets.size >= MAX_EPHEMERAL_WORKSHEETS) {
    const oldestKey = ephemeralWorksheets.keys().next().value;
    if (oldestKey !== undefined) {
      ephemeralWorksheets.delete(oldestKey);
    }
  }
  ephemeralWorksheets.set(worksheet.id, worksheet);
}

// Per-IP sliding-window rate limiter to protect AI API quota in stateless mode
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX_REQUESTS = 20;
const rateLimitBuckets = new Map<string, number[]>();

export function resetGenerateRateLimiter() {
  rateLimitBuckets.clear();
}

export function checkGenerateRateLimit(clientKey: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const timestamps = rateLimitBuckets.get(clientKey) ?? [];
  const valid = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  if (valid.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldest = valid[0]!;
    const retryAfterSeconds = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000));
    rateLimitBuckets.set(clientKey, valid);
    return { allowed: false, retryAfterSeconds };
  }
  valid.push(now);
  rateLimitBuckets.set(clientKey, valid);
  return { allowed: true, retryAfterSeconds: 0 };
}

function getClientIp(req: { headers?: Record<string, string | string[] | undefined>; ip?: string } | undefined): string {
  if (!req) return "unknown";
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].trim();
  }
  return req.ip || "local";
}

export const worksheetUploadSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  base64: z.string().min(1).max(10_500_000),
  sourceText: z.string().max(50_000).optional(),
});

const levelSnapshotSchema = z.object({
  worksheetTitle: z.string().min(1).max(255),
  levelLabel: z.enum(LEVELS),
  title: z.string().min(1).max(255),
  learningGoal: z.string().min(1).max(4000),
  content: z.string().min(1).max(30000),
  answerGuide: z.string().max(15000).optional(),
});

export function isSupportedWorksheetMime(mimeType: string) {
  return mimeType === "application/pdf" || mimeType === "text/plain" || mimeType.startsWith("image/");
}

export function createAsciiStorageObjectName(originalName: string) {
  const extensionMatch = originalName.match(/\.([a-zA-Z0-9]{1,10})$/);
  const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : "";
  return `source${extension}`;
}

export const worksheetsRouter = router({
  list: publicProcedure.query(async (): Promise<EphemeralWorksheet[]> => {
    return Array.from(ephemeralWorksheets.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }),

  get: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const worksheet = ephemeralWorksheets.get(input.id);
    if (!worksheet) throw new TRPCError({ code: "NOT_FOUND", message: "학습지를 찾을 수 없습니다." });
    return worksheet;
  }),

  generate: publicProcedure.input(worksheetUploadSchema).mutation(async ({ ctx, input }) => {
    if (process.env.NODE_ENV !== "test") {
      const rateStatus = checkGenerateRateLimit(getClientIp(ctx.req));
      if (!rateStatus.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `요청이 너무 많습니다. ${rateStatus.retryAfterSeconds}초 후 다시 시도해 주세요.`,
        });
      }
    }

    if (!ENV.aiApiKey && !ENV.forgeApiKey) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "AI API 키가 서버에 등록되지 않았습니다. 환경변수에 AI_API_KEY(또는 GEMINI_API_KEY)를 설정해 주세요.",
      });
    }
    if (!isSupportedWorksheetMime(input.mimeType)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "PDF, 이미지, 텍스트 파일만 업로드할 수 있습니다." });
    }
    const raw = input.base64.includes(",") ? input.base64.split(",").pop()! : input.base64;
    const bytes = Buffer.from(raw, "base64");
    if (bytes.byteLength > 7_500_000) {
      throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "파일은 7MB 이하로 업로드해 주세요." });
    }
    const sourceUrl = input.base64.startsWith("data:") ? input.base64 : `data:${input.mimeType};base64,${raw}`;

    try {
      const generated = await generateFiveLevelWorksheets({
        sourceLabel: input.name,
        sourceText: input.sourceText?.trim() || (input.mimeType === "text/plain" ? bytes.toString("utf8") : null),
        sourceUrl,
        mimeType: input.mimeType,
      });
      const worksheetId = Date.now() + nextWorksheetId++;
      const now = new Date();
      const worksheet: EphemeralWorksheet = {
        id: worksheetId,
        userId: ctx.user?.id ?? 0,
        title: generated.worksheets.find(item => item.level === "보통")?.title || input.name.replace(/\.[^.]+$/, ""),
        originalName: input.name,
        originalMime: input.mimeType,
        originalFileKey: null,
        status: "ready",
        sourceText: input.sourceText?.trim() || (input.mimeType === "text/plain" ? bytes.toString("utf8") : generated.analysis.sourceSummary),
        subject: generated.analysis.subject,
        gradeBand: generated.analysis.suggestedGradeBand,
        analysis: generated.analysis,
        createdAt: now,
        updatedAt: now,
        levels: generated.worksheets.map((level, index) => ({
          id: worksheetId * 10 + index + 1,
          worksheetId,
          level: level.level,
          title: level.title,
          learningGoal: level.learningGoal,
          instructions: level.instructions,
          questions: level.questions,
          teacherNote: level.teacherNote,
          content: formatLevelContent(level),
          answerGuide: formatAnswerGuide(level),
          updatedAt: now,
        })),
      };
      storeEphemeralWorksheet(worksheet);
      return worksheet;
    } catch (error) {
      console.error("[worksheets.generate]", error);
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: error instanceof Error
          ? `AI 학습지 변환 실패: ${error.message.slice(0, 500)}`
          : "AI 학습지 변환 실패: 알 수 없는 서버 오류입니다.",
      });
    }
  }),

  saveLevel: publicProcedure.input(z.object({
    worksheetId: z.number().int().positive(),
    levelId: z.number().int().positive(),
    title: z.string().min(1).max(255),
    learningGoal: z.string().min(1).max(4000),
    content: z.string().min(1).max(30000),
    answerGuide: z.string().min(1).max(15000),
  })).mutation(async ({ input }) => {
    const ephemeral = ephemeralWorksheets.get(input.worksheetId);
    if (!ephemeral) {
      throw new TRPCError({ code: "NOT_FOUND", message: "저장할 학습지를 찾을 수 없습니다." });
    }
    const level = ephemeral.levels.find(item => item.id === input.levelId);
    if (!level) {
      throw new TRPCError({ code: "NOT_FOUND", message: "저장할 수준별 학습지를 찾을 수 없습니다." });
    }
    Object.assign(level, {
      title: input.title,
      learningGoal: input.learningGoal,
      content: input.content,
      answerGuide: input.answerGuide,
      updatedAt: new Date(),
    });
    ephemeral.updatedAt = new Date();
    return ephemeral;
  }),

  download: publicProcedure.input(z.object({
    worksheetId: z.number().int().positive(),
    levelId: z.number().int().positive(),
    format: z.enum(["docx", "hwpx"]),
    includeAnswerGuide: z.boolean().default(false),
    snapshot: levelSnapshotSchema.optional(),
  })).mutation(async ({ input }) => {
    if (input.snapshot) {
      const exported = await createWorksheetExport(input.snapshot, input.format, input.includeAnswerGuide);
      return {
        filename: exported.filename,
        mimeType: exported.mimeType,
        base64: Buffer.from(exported.bytes).toString("base64"),
      };
    }

    const worksheet = ephemeralWorksheets.get(input.worksheetId);
    if (!worksheet) throw new TRPCError({ code: "NOT_FOUND", message: "내보낼 학습지를 찾을 수 없습니다." });
    const level = worksheet.levels.find(item => item.id === input.levelId);
    if (!level) throw new TRPCError({ code: "NOT_FOUND", message: "내보낼 수준별 학습지를 찾을 수 없습니다." });
    const exported = await createWorksheetExport({
      worksheetTitle: worksheet.title,
      levelLabel: level.level,
      title: level.title,
      learningGoal: level.learningGoal,
      content: level.content,
      answerGuide: level.answerGuide,
    }, input.format, input.includeAnswerGuide);
    return { filename: exported.filename, mimeType: exported.mimeType, base64: Buffer.from(exported.bytes).toString("base64") };
  }),

  downloadBundle: publicProcedure.input(z.object({
    worksheetId: z.number().int().positive(),
    format: z.enum(["docx", "hwpx"]),
    includeAnswerGuide: z.boolean().default(false),
    snapshot: z.object({
      worksheetTitle: z.string().min(1).max(255),
      levels: z.array(levelSnapshotSchema).length(5),
    }).optional(),
  })).mutation(async ({ input }) => {
    if (input.snapshot) {
      const ordered = LEVELS.map(levelName => input.snapshot!.levels.find(item => item.levelLabel === levelName)).filter(
        (item): item is NonNullable<typeof item> => Boolean(item)
      );
      if (ordered.length !== LEVELS.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "5개 수준별 학습지가 모두 있어야 묶음으로 내보낼 수 있습니다." });
      }
      const exported = await createWorksheetBundle({
        worksheetTitle: input.snapshot.worksheetTitle,
        levels: ordered,
      }, input.format, input.includeAnswerGuide);
      return {
        filename: exported.filename,
        mimeType: exported.mimeType,
        base64: Buffer.from(exported.bytes).toString("base64"),
      };
    }

    const worksheet = ephemeralWorksheets.get(input.worksheetId);
    if (!worksheet) throw new TRPCError({ code: "NOT_FOUND", message: "내보낼 학습지를 찾을 수 없습니다." });
    const levels = LEVELS.map(levelName => worksheet.levels.find(level => level.level === levelName)).filter(
      (level): level is NonNullable<typeof level> => Boolean(level)
    );
    if (levels.length !== LEVELS.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "5개 수준별 학습지가 모두 있어야 묶음으로 내보낼 수 있습니다." });
    }
    const exported = await createWorksheetBundle({
      worksheetTitle: worksheet.title,
      levels: levels.map(level => ({
        worksheetTitle: worksheet.title,
        levelLabel: level.level,
        title: level.title,
        learningGoal: level.learningGoal,
        content: level.content,
        answerGuide: level.answerGuide,
      })),
    }, input.format, input.includeAnswerGuide);
    return { filename: exported.filename, mimeType: exported.mimeType, base64: Buffer.from(exported.bytes).toString("base64") };
  }),

  levels: publicProcedure.query(() => LEVELS),
});
