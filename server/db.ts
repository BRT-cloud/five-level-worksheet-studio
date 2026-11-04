import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, worksheetLevels, worksheets, type WorksheetAnalysis } from "../drizzle/schema.js";
import { ENV } from './_core/env.js';
import type { WorksheetLevelName } from "./worksheet-utils.js";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function listWorksheetsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(worksheets).where(eq(worksheets.userId, userId)).orderBy(desc(worksheets.updatedAt));
}

export async function getWorksheetByIdForUser(worksheetId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const worksheet = (await db.select().from(worksheets).where(and(eq(worksheets.id, worksheetId), eq(worksheets.userId, userId))).limit(1))[0];
  if (!worksheet) return undefined;
  const levels = await db.select().from(worksheetLevels).where(eq(worksheetLevels.worksheetId, worksheetId));
  return { ...worksheet, levels };
}

export async function createWorksheetWithLevels(input: {
  userId: number;
  title: string;
  originalName: string;
  originalMime: string;
  originalFileKey?: string | null;
  sourceText?: string | null;
  analysis: WorksheetAnalysis;
  levels: Array<{ level: WorksheetLevelName; title: string; learningGoal: string; content: string; answerGuide: string }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다.");
  const result = await db.insert(worksheets).values({
    userId: input.userId,
    title: input.title,
    originalName: input.originalName,
    originalMime: input.originalMime,
    originalFileKey: input.originalFileKey ?? null,
    sourceText: input.sourceText ?? null,
    subject: input.analysis.subject,
    gradeBand: input.analysis.suggestedGradeBand,
    analysis: input.analysis,
  });
  const worksheetId = Number(result[0].insertId);
  await db.insert(worksheetLevels).values(input.levels.map(level => ({ ...level, worksheetId })));
  return getWorksheetByIdForUser(worksheetId, input.userId);
}

export async function updateWorksheetLevelForUser(input: {
  userId: number;
  worksheetId: number;
  levelId: number;
  title: string;
  learningGoal: string;
  content: string;
  answerGuide: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다.");
  const worksheet = await getWorksheetByIdForUser(input.worksheetId, input.userId);
  if (!worksheet) return undefined;
  await db.update(worksheetLevels).set({
    title: input.title,
    learningGoal: input.learningGoal,
    content: input.content,
    answerGuide: input.answerGuide,
    updatedAt: new Date(),
  }).where(and(eq(worksheetLevels.id, input.levelId), eq(worksheetLevels.worksheetId, input.worksheetId)));
  await db.update(worksheets).set({ updatedAt: new Date() }).where(eq(worksheets.id, input.worksheetId));
  return getWorksheetByIdForUser(input.worksheetId, input.userId);
}
