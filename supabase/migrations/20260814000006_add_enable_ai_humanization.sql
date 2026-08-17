-- WAI Migration: Add enable_ai_humanization flag to digital_employees
-- This flag controls whether the Gemini AI provider humanizes the deterministic reply text.
-- Default is false (safe) — humanization is opt-in and never affects operational decisions.

ALTER TABLE public.digital_employees
ADD COLUMN IF NOT EXISTS enable_ai_humanization BOOLEAN NOT NULL DEFAULT false;
