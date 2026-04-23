
-- Tabla para almacenar las transacciones de pago procesadas con NeoNet
-- Incluye información de la solicitud, estado del pago y respuesta del gateway
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  transaction_id VARCHAR(100),
  authorization_code VARCHAR(20),
  reference_number VARCHAR(30),
  audit_number VARCHAR(10),
  masked_card VARCHAR(25),
  response_code VARCHAR(5),
  raw_response JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);