import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
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

export const learnerStats = mysqlTable(
  "learnerStats",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    xp: int("xp").default(0).notNull(),
    streak: int("streak").default(0).notNull(),
    completedLessons: int("completedLessons").default(0).notNull(),
    lastActivityAt: timestamp("lastActivityAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("learnerStats_userId_unique").on(table.userId)],
);

export const trackEnrollments = mysqlTable(
  "trackEnrollments",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    trackId: varchar("trackId", { length: 40 }).notNull(),
    enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("trackEnrollments_user_track_unique").on(table.userId, table.trackId)],
);

export const lessonProgress = mysqlTable(
  "lessonProgress",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    lessonId: varchar("lessonId", { length: 80 }).notNull(),
    track: mysqlEnum("track", ["HTML", "CSS", "JavaScript"]).notNull(),
    difficulty: mysqlEnum("difficulty", ["Beginner", "Intermediate", "Advanced"]).notNull(),
    status: mysqlEnum("status", ["in_progress", "completed"]).default("in_progress").notNull(),
    xpEarned: int("xpEarned").default(0).notNull(),
    score: int("score"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("lessonProgress_user_lesson_unique").on(table.userId, table.lessonId),
    index("lessonProgress_user_status_idx").on(table.userId, table.status),
  ],
);

export const challengeAttempts = mysqlTable(
  "challengeAttempts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    challengeId: varchar("challengeId", { length: 80 }).notNull(),
    score: int("score").notNull(),
    passed: boolean("passed").default(false).notNull(),
    summary: varchar("summary", { length: 280 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("challengeAttempts_user_idx").on(table.userId)],
);

export const learnerAchievements = mysqlTable(
  "learnerAchievements",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    achievementId: varchar("achievementId", { length: 80 }).notNull(),
    earnedAt: timestamp("earnedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("learnerAchievements_user_achievement_unique").on(table.userId, table.achievementId)],
);

export const learningActivity = mysqlTable(
  "learningActivity",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    title: varchar("title", { length: 140 }).notNull(),
    detail: varchar("detail", { length: 280 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("learningActivity_user_created_idx").on(table.userId, table.createdAt)],
);
