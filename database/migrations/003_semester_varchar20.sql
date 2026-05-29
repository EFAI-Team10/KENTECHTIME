-- Migration 003: semester VARCHAR(10) → VARCHAR(20)
-- Needed because semester values like "2026-spring" are 11 chars (10 is too short for "2026-winter" = 11 chars)
-- Run in Supabase SQL Editor

ALTER TABLE courses
  ALTER COLUMN semester TYPE VARCHAR(20);

ALTER TABLE completed_courses
  ALTER COLUMN semester TYPE VARCHAR(20);

ALTER TABLE planned_schedules
  ALTER COLUMN semester TYPE VARCHAR(20);
