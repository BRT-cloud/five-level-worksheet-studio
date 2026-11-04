import { index, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import type { WorksheetLevelName } from "../server/worksheet-utils.js";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type WorksheetAnalysis = {
  learningGoal: string;
  subject: string;
  suggestedGradeBand: string;
  skills: string[];
  sourceSummary: string;
};

export const worksheets = mysqlTable("worksheets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  originalMime: varchar("originalMime", { length: 120 }).notNull(),
  originalFileKey: varchar("originalFileKey", { length: 512 }),
  sourceText: text("sourceText"),
  subject: varchar("subject", { length: 100 }),
  gradeBand: varchar("gradeBand", { length: 100 }),
  status: mysqlEnum("status", ["ready", "failed"]).default("ready").notNull(),
  analysis: json("analysis").$type<WorksheetAnalysis>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("worksheets_user_created_idx").on(table.userId, table.createdAt)]);

export const worksheetLevels = mysqlTable("worksheetLevels", {
  id: int("id").autoincrement().primaryKey(),
  worksheetId: int("worksheetId").notNull().references(() => worksheets.id, { onDelete: "cascade" }),
  level: mysqlEnum("level", ["매우 쉬움", "쉬움", "보통", "어려움", "매우 어려움"]).$type<WorksheetLevelName>().notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  learningGoal: text("learningGoal").notNull(),
  content: text("content").notNull(),
  answerGuide: text("answerGuide").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("worksheet_levels_worksheet_idx").on(table.worksheetId)]);

export type Worksheet = typeof worksheets.$inferSelect;
export type WorksheetLevel = typeof worksheetLevels.$inferSelect;
