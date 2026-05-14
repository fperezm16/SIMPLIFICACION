CREATE TABLE IF NOT EXISTS payment_trace_counter (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_value INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_trace_counter_single_row CHECK (id = 1),
  CONSTRAINT payment_trace_counter_range CHECK (last_value BETWEEN 0 AND 999999)
);

INSERT INTO payment_trace_counter (id, last_value)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS cardholder_name VARCHAR(80);

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS card_brand VARCHAR(30);
