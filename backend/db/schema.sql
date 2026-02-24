-- ============================================================
-- DrawBit — Database Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users (admin + clients)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(10) NOT NULL CHECK (role IN ('admin', 'client')),
  full_name     VARCHAR(200),
  email         VARCHAR(200),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices / Quotations
CREATE TABLE IF NOT EXISTS invoices (
  id               SERIAL PRIMARY KEY,
  client_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  invoice_number   VARCHAR(100),
  invoice_date     DATE,
  quote_to         VARCHAR(200),
  client_phone     VARCHAR(50),
  client_address   TEXT,
  client_email     VARCHAR(200),

  company_name     VARCHAR(200) NOT NULL DEFAULT 'DrawBit',
  company_address  TEXT         NOT NULL DEFAULT '37, Hassan Aflaton St., Ard El Golf, Nasr City',
  company_website  VARCHAR(200) NOT NULL DEFAULT 'www.drawbit.tech',
  company_logo_url TEXT,

  vat_percent      NUMERIC(5,2) NOT NULL DEFAULT 14.00,
  currency         VARCHAR(10)  NOT NULL DEFAULT 'USD',

  terms            TEXT NOT NULL DEFAULT E'Quote Validity: Current quote is valid for one week from its date.\nPrices: Quote pricing is in USD and including 14% VAT.\nDelivery: Electronic License Delivery within 2-3 weeks from PO date\nPayment terms:\n• 100% upon delivery',

  status           VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Line items
CREATE TABLE IF NOT EXISTS line_items (
  id          SERIAL PRIMARY KEY,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sort_order  INTEGER DEFAULT 0,
  description TEXT NOT NULL,
  qty         NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price  NUMERIC(12,2) NOT NULL
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_updated_at ON invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Default admin (password: admin123 — CHANGE IN PRODUCTION)
INSERT INTO users (username, password_hash, role, full_name, email)
VALUES (
  'admin',
  crypt('admin123', gen_salt('bf', 12)),
  'admin',
  'DrawBit Admin',
  'admin@drawbit.com'
) ON CONFLICT (username) DO NOTHING;
