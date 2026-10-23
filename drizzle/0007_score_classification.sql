-- Retain legacy difficulty and genre data; existing scores stay unclassified.
ALTER TABLE "scores" ADD COLUMN "score_type" text;--> statement-breakpoint
ALTER TABLE "scores" ADD COLUMN "period" text;
