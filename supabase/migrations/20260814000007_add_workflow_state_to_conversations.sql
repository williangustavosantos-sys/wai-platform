-- WAI Migration: Add workflow_state to conversations
-- Stores the state of a multi-turn operational flow (e.g. guided booking):
--   { "intent": "CREATE_APPOINTMENT", "serviceId": "...", "professionalId": "...",
--     "professionalPreference": "specific", "date": "2026-08-17", "time": "09:00",
--     "step": "CONFIRMATION" }
-- Default is NULL (safe) — the state is derived from message history every turn,
-- this column only persists it for observability and the WebChat UI.

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS workflow_state JSONB NULL;

COMMENT ON COLUMN public.conversations.workflow_state IS
  'Stores the state of a multi-turn operation, like a booking flow.';
