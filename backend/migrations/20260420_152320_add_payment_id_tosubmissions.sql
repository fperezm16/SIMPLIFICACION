-- Relaciona un formulario con su transacción de pago
ALTER TABLE submissions
ADD COLUMN IF NOT EXISTS payment_id INTEGER REFERENCES payments(id);