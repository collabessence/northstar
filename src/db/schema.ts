import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const deals = pgTable("deals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  value: integer("value").notNull(),
  stage: text("stage").notNull().default("new"),
  probability: integer("probability").notNull().default(20),
  temperature: text("temperature").notNull().default("Warm"),
  ownerInitials: text("owner_initials").notNull().default("AM"),
  dueLabel: text("due_label").notNull().default("This week"),
  // Free-form notes on the deal — visible/editable from the deal modal.
  notes: text("notes"),
  // Real timestamp for the last time this deal was touched. Replaces the old
  // free-text `lastContact` string, which never actually updated on its own.
  lastContactAt: timestamp("last_contact_at").notNull().defaultNow(),
  // Set automatically when a deal moves into the "won" stage. Used for real
  // sales-cycle and revenue-by-month calculations instead of hardcoded numbers.
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company").notNull(),
  role: text("role").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  initials: text("initials").notNull(),
  status: text("status").notNull().default("Active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  type: text("type").notNull().default("Call"),
  dueLabel: text("due_label").notNull(),
  // Real timestamp backing dueLabel, used for automatic due/overdue
  // notifications. Nullable because a person can still type a free-text
  // due label without picking an exact date.
  dueAt: timestamp("due_at"),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per calendar day. Populated automatically the first time a day is
// viewed. Lets the dashboard show real period-over-period deltas instead of
// fabricated percentages, and gets more accurate the longer the app is used.
export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: serial("id").primaryKey(),
    day: text("day").notNull(), // ISO date, e.g. "2026-07-14"
    pipeline: integer("pipeline").notNull(),
    forecast: doublePrecision("forecast").notNull(),
    wonValue: integer("won_value").notNull(),
    winRate: integer("win_rate").notNull(),
    avgCycleDays: doublePrecision("avg_cycle_days"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [unique("metric_snapshots_day_unique").on(table.day)],
);

// Real activity feed — one row per meaningful action (deal moved, contact
// added, task completed...). Replaces the old hardcoded Notifications
// sample content.
export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  kind: text("kind").notNull().default("info"), // deal | contact | task | system
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type MetricSnapshot = typeof metricSnapshots.$inferSelect;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
