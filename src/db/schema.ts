import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Roles map one-to-one onto the three desks a file passes through.
 * A user may hold several (the `demo` account holds all three).
 */
export const ROLES = ["clerk", "talathi", "officer"] as const;
export type Role = (typeof ROLES)[number];

/** Where the file currently sits. `with_applicant` pauses the deadline clock. */
export const STAGES = [
  "scrutiny",
  "field",
  "decision",
  "with_applicant",
  "closed",
] as const;
export type Stage = (typeof STAGES)[number];

export const OCCUPATIONS = ["farmer", "salaried", "labour", "business"] as const;
export type Occupation = (typeof OCCUPATIONS)[number];

export const PURPOSES = ["scholarship", "ews", "pension", "housing"] as const;
export type Purpose = (typeof PURPOSES)[number];

export const DOC_TYPES = [
  "aadhaar",
  "ration_card",
  "electricity_bill",
  "self_declaration",
  "land_7_12",
  "salary_slip",
  "itr",
  "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** Name as it appears on an order, in Devanagari. */
    fullName: text("full_name").notNull(),
    fullNameEn: text("full_name_en").notNull(),
    /** Designation code, rendered from the message catalogue. */
    designation: text("designation").notNull(),
    /** JSON array of roles; a user may hold more than one. */
    roles: jsonb("roles").$type<Role[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_username_idx").on(t.username)],
);

export const applications = pgTable(
  "applications",
  {
    id: serial("id").primaryKey(),
    /** The number printed on the citizen's acknowledgement slip. */
    applicationNumber: text("application_number").notNull(),

    applicantName: text("applicant_name").notNull(),
    applicantNameEn: text("applicant_name_en").notNull(),
    aadhaarLast4: text("aadhaar_last4").notNull(),
    mobile: text("mobile").notNull(),
    village: text("village").notNull(),
    villageEn: text("village_en").notNull(),
    taluka: text("taluka").notNull(),
    district: text("district").notNull(),

    occupation: text("occupation").$type<Occupation>().notNull(),
    purpose: text("purpose").$type<Purpose>().notNull(),
    declaredAnnualIncome: integer("declared_annual_income").notNull(),
    declaredFamilyMembers: integer("declared_family_members").notNull(),

    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    /** Service deadline under the Right to Public Services Act. */
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    /** Set while the file is with the applicant; the clock does not run. */
    clockPausedAt: timestamp("clock_paused_at", { withTimezone: true }),

    stage: text("stage").$type<Stage>().notNull(),

    /** Talathi's work. */
    fieldReport: text("field_report"),
    verifiedAnnualIncome: integer("verified_annual_income"),
    verifiedFamilyMembers: integer("verified_family_members"),
    residenceConfirmed: boolean("residence_confirmed"),
    fieldVisitAt: timestamp("field_visit_at", { withTimezone: true }),

    /** Officer's work. */
    decision: text("decision").$type<"approved" | "rejected">(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    certificateNumber: text("certificate_number"),
    certifiedAnnualIncome: integer("certified_annual_income"),
    certifiedById: integer("certified_by_id"),

    /** Cached result of the last AI run, so the dashboard can rank without re-running. */
    riskScore: integer("risk_score").notNull().default(0),
    findingCount: integer("finding_count").notNull().default(0),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("applications_number_idx").on(t.applicationNumber),
    index("applications_stage_idx").on(t.stage),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    docType: text("doc_type").$type<DocType>().notNull(),

    /** The fields read off the document; all optional because they vary by type. */
    nameOnDocument: text("name_on_document"),
    addressOnDocument: text("address_on_document"),
    monthlyNetPay: integer("monthly_net_pay"),
    annualIncome: integer("annual_income"),
    /** Land area in hectares, stored as hundredths to stay integral. */
    landAreaCentiHectares: integer("land_area_centi_hectares"),
    irrigated: boolean("irrigated"),

    source: text("source").$type<"setu" | "ocr" | "manual">().notNull(),
    rawText: text("raw_text"),
    addedById: integer("added_by_id"),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("documents_application_idx").on(t.applicationId)],
);

export const EVENT_TYPES = ["submitted", "ai_run", "transition"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    type: text("type").$type<EventType>().notNull(),
    /** Workflow action code for transitions, AI step code for runs. */
    action: text("action").notNull(),
    actorId: integer("actor_id"),
    actorRole: text("actor_role").$type<Role>(),
    fromStage: text("from_stage").$type<Stage>(),
    toStage: text("to_stage").$type<Stage>(),
    remarks: text("remarks"),
    /** Which action the AI suggested while this screen was open. */
    aiSuggestedAction: text("ai_suggested_action"),
    aiRiskScore: integer("ai_risk_score"),
    /** null when there was no suggestion to agree or disagree with. */
    followedAi: boolean("followed_ai"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("events_application_idx").on(t.applicationId)],
);

export type User = typeof users.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Event = typeof events.$inferSelect;
