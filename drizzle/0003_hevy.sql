CREATE TABLE "hevy_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"workout_id" text NOT NULL,
	"exercise_index" integer NOT NULL,
	"set_index" integer NOT NULL,
	"exercise_key" text NOT NULL,
	"exercise_title" text NOT NULL,
	"type" text DEFAULT 'normal' NOT NULL,
	"weight_kg" double precision,
	"reps" integer,
	"distance_m" double precision,
	"duration_s" integer,
	"rpe" double precision,
	"e1rm_kg" double precision
);
--> statement-breakpoint
CREATE TABLE "hevy_sync" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"cursor" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "hevy_sync_single_row" CHECK ("hevy_sync"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "hevy_workouts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"hevy_updated_at" timestamp with time zone,
	"set_count" integer DEFAULT 0 NOT NULL,
	"volume_kg" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hevy_sets" ADD CONSTRAINT "hevy_sets_workout_id_hevy_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."hevy_workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hevy_sets_workout_idx" ON "hevy_sets" USING btree ("workout_id");--> statement-breakpoint
CREATE INDEX "hevy_sets_exercise_idx" ON "hevy_sets" USING btree ("exercise_key");--> statement-breakpoint
CREATE INDEX "hevy_workouts_date_idx" ON "hevy_workouts" USING btree ("date");