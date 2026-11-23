ALTER TABLE "ticket_tb"
  ADD COLUMN IF NOT EXISTS "ticket_assign_breach_notified_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "ticket_deadline_warning_notified_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "ticket_deadline_breach_notified_at" timestamptz;
