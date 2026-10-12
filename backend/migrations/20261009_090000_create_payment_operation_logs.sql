CREATE TABLE IF NOT EXISTS payment_operation_logs (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  submission_id INTEGER,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('cancel', 'reverse')),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failed')),
  event_label TEXT NOT NULL,
  reason TEXT,
  actor_user_id INTEGER,
  actor_role TEXT,
  response_code VARCHAR(5),
  response_message TEXT,
  systems_trace_no VARCHAR(10),
  reference_number VARCHAR(30),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_operation_logs_payment_created_idx
  ON payment_operation_logs (payment_id, created_at DESC);

INSERT INTO payment_operation_logs (
  payment_id, submission_id, operation_type, outcome, event_label, reason,
  response_code, response_message, systems_trace_no, reference_number,
  metadata, created_at
)
SELECT
  p.id,
  p.submission_id,
  'cancel',
  'success',
  'Anulacion administrativa de pago',
  'Anulacion registrada antes de habilitar la bitacora detallada',
  COALESCE(p.raw_response->'cancellation'->'response'->>'ResponseCode', p.response_code),
  p.raw_response->'cancellation'->'response'->'PrivateUse63'->>'AlternateHostResponse22',
  COALESCE(p.raw_response->'cancellation'->'request'->>'SystemsTraceNo', p.audit_number),
  p.reference_number,
  jsonb_build_object(
    'action', 'cancel',
    'outcome', 'success',
    'payment_id', p.id,
    'payment_status_before', 'approved',
    'response_code', COALESCE(
      p.raw_response->'cancellation'->'response'->>'ResponseCode',
      p.response_code
    ),
    'response_message', p.raw_response->'cancellation'->'response'->'PrivateUse63'->>'AlternateHostResponse22',
    'systems_trace_no', COALESCE(
      p.raw_response->'cancellation'->'request'->>'SystemsTraceNo',
      p.audit_number
    ),
    'reference_number', p.reference_number,
    'backfilled', true
  ),
  p.updated_at
FROM payments p
WHERE p.status = 'cancelled'
  AND NOT EXISTS (
    SELECT 1
    FROM payment_operation_logs pol
    WHERE pol.payment_id = p.id
      AND pol.operation_type = 'cancel'
      AND pol.outcome = 'success'
  );
