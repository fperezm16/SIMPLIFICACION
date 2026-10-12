ALTER TABLE payment_operation_logs
  DROP CONSTRAINT IF EXISTS payment_operation_logs_operation_type_check;

ALTER TABLE payment_operation_logs
  ADD CONSTRAINT payment_operation_logs_operation_type_check
  CHECK (operation_type IN ('cancel', 'reverse', 'receipt_review', 'receipt_email'));

CREATE TABLE IF NOT EXISTS payment_cancellation_receipts (
  payment_id INTEGER PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
  receipt_number VARCHAR(40) UNIQUE NOT NULL,
  snapshot JSONB NOT NULL,
  review_status VARCHAR(20) NOT NULL DEFAULT 'pending_review',
  reviewed_by_user_id INTEGER,
  reviewed_at TIMESTAMPTZ,
  send_status VARCHAR(20) NOT NULL DEFAULT 'not_sent',
  sent_to VARCHAR(320),
  sent_by_user_id INTEGER,
  sent_at TIMESTAMPTZ,
  send_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_cancellation_receipts_review_status_check
    CHECK (review_status IN ('pending_review', 'reviewed')),
  CONSTRAINT payment_cancellation_receipts_send_status_check
    CHECK (send_status IN ('not_sent', 'sent', 'error'))
);
