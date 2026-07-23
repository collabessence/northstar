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

export const recruitmentClients = pgTable("recruitment_clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  status: text("status").notNull().default("Active"), // Active | Prospect | Inactive
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const candidates = pgTable("candidates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  // Stored as plain ISO text (YYYY-MM-DD) rather than a date column — CV
  // dates come from unreliable free-text parsing, so this stays easy to
  // leave blank or correct by hand without date-type validation getting
  // in the way.
  birthDate: text("birth_date"),
  currentTitle: text("current_title").notNull(),
  currentCompany: text("current_company"),
  location: text("location").notNull(),
  skills: text("skills").array().notNull().default([]),
  yearsExperience: integer("years_experience").notNull().default(0),
  desiredSalary: integer("desired_salary").notNull(),
  availability: text("availability").notNull().default("2 weeks notice"),
  source: text("source").notNull().default("Sourced"), // Referral | Sourced | Applied | Network
  status: text("status").notNull().default("Active"), // Active | Placed | Do not contact | Unresponsive
  resumeSummary: text("resume_summary"),
  lastContactAt: timestamp("last_contact_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const jobOrders = pgTable("job_orders", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  clientId: integer("client_id")
    .notNull()
    .references(() => recruitmentClients.id, { onDelete: "cascade" }),
  seniority: text("seniority").notNull().default("Mid"), // Junior | Mid | Senior | Lead | Executive
  employmentType: text("employment_type").notNull().default("Permanent"), // Permanent | Contract | Temp
  salaryMin: integer("salary_min").notNull(),
  salaryMax: integer("salary_max").notNull(),
  feePercentage: doublePrecision("fee_percentage").notNull().default(20),
  openings: integer("openings").notNull().default(1),
  status: text("status").notNull().default("Open"), // Open | OnHold | Filled | Cancelled
  priority: text("priority").notNull().default("Medium"), // Low | Medium | High
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One pipeline entry = one candidate being worked for one job order.
// This is the real engine of a recruitment CRM — a candidate can be in
// multiple pipelines at once, and the fee/commission are locked in at
// placement time even if the job order's fee % changes later.
export const placements = pgTable("placements", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  jobOrderId: integer("job_order_id")
    .notNull()
    .references(() => jobOrders.id, { onDelete: "cascade" }),
  stage: text("stage").notNull().default("sourced"),
  // sourced | screened | submitted | client_interview | offer | placed | guarantee | completed | fell_through
  fellThroughReason: text("fell_through_reason"),
  agreedSalary: integer("agreed_salary"),
  feeAmount: integer("fee_amount"), // locked in once an offer is made
  commissionRate: doublePrecision("commission_rate").notNull().default(20),
  lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),
  submittedAt: timestamp("submitted_at"),
  interviewAt: timestamp("interview_at"),
  offerAt: timestamp("offer_at"),
  placedAt: timestamp("placed_at"),
  guaranteeDays: integer("guarantee_days").notNull().default(90),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const recruitmentTasks = pgTable("recruitment_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  relatedLabel: text("related_label").notNull(), // e.g. "Mia Chen · Atlas Labs"
  type: text("type").notNull().default("Call"), // Call | Email | Interview | Submission | Reference check
  dueLabel: text("due_label").notNull(),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const recruitmentSnapshots = pgTable(
  "recruitment_metric_snapshots",
  {
    id: serial("id").primaryKey(),
    day: text("day").notNull(),
    activePipelineValue: integer("active_pipeline_value").notNull(),
    placementsThisMonth: integer("placements_this_month").notNull(),
    openJobOrders: integer("open_job_orders").notNull(),
    avgTimeToFillDays: doublePrecision("avg_time_to_fill_days"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [unique("recruitment_snapshots_day_unique").on(table.day)],
);

export type RecruitmentClient = typeof recruitmentClients.$inferSelect;
export type Candidate = typeof candidates.$inferSelect;
export type JobOrder = typeof jobOrders.$inferSelect;
export type Placement = typeof placements.$inferSelect;
export type RecruitmentTask = typeof recruitmentTasks.$inferSelect;
