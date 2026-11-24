CREATE TABLE "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_number" text NOT NULL,
	"applicant_name" text NOT NULL,
	"applicant_name_en" text NOT NULL,
	"aadhaar_last4" text NOT NULL,
	"mobile" text NOT NULL,
	"village" text NOT NULL,
	"village_en" text NOT NULL,
	"taluka" text NOT NULL,
	"district" text NOT NULL,
	"occupation" text NOT NULL,
	"purpose" text NOT NULL,
	"declared_annual_income" integer NOT NULL,
	"declared_family_members" integer NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"clock_paused_at" timestamp with time zone,
	"stage" text NOT NULL,
	"field_report" text,
	"verified_annual_income" integer,
	"verified_family_members" integer,
	"residence_confirmed" boolean,
	"field_visit_at" timestamp with time zone,
	"decision" text,
	"decided_at" timestamp with time zone,
	"certificate_number" text,
	"certified_annual_income" integer,
	"certified_by_id" integer,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"finding_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"doc_type" text NOT NULL,
	"name_on_document" text,
	"address_on_document" text,
	"monthly_net_pay" integer,
	"annual_income" integer,
	"land_area_centi_hectares" integer,
	"irrigated" boolean,
	"source" text NOT NULL,
	"raw_text" text,
	"added_by_id" integer,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"type" text NOT NULL,
	"action" text NOT NULL,
	"actor_id" integer,
	"actor_role" text,
	"from_stage" text,
	"to_stage" text,
	"remarks" text,
	"ai_suggested_action" text,
	"ai_risk_score" integer,
	"followed_ai" boolean,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"full_name_en" text NOT NULL,
	"designation" text NOT NULL,
	"roles" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "applications_number_idx" ON "applications" USING btree ("application_number");--> statement-breakpoint
CREATE INDEX "applications_stage_idx" ON "applications" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "documents_application_idx" ON "documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "events_application_idx" ON "events" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_idx" ON "users" USING btree ("username");