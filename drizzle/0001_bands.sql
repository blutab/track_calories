ALTER TABLE "targets" ADD COLUMN "kcal_band_pct" double precision DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "targets" ADD COLUMN "weight_baseline_kg" double precision;--> statement-breakpoint
ALTER TABLE "targets" ADD COLUMN "weight_band_kg" double precision DEFAULT 1 NOT NULL;