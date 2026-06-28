-- ============================================
-- Wolf SOS Schema v2 - Google OAuth + Bloques flexibles
-- Ejecuta esto en: Supabase Dashboard → SQL Editor
-- ============================================

-- Actualizar tabla vets
ALTER TABLE vets ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE vets ADD COLUMN IF NOT EXISTS picture TEXT;
ALTER TABLE vets ADD COLUMN IF NOT EXISTS google_access_token TEXT;
ALTER TABLE vets ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE vets ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE vets ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE vets ADD COLUMN IF NOT EXISTS bio TEXT;

-- Nueva tabla: bloques de horario flexibles
CREATE TABLE IF NOT EXISTS vet_time_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vet_id UUID NOT NULL REFERENCES vets(id) ON DELETE CASCADE,
  start_ms BIGINT NOT NULL,
  end_ms BIGINT NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  google_event_id TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Nueva tabla: admin
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  google_id TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT now()
);

-- Nueva tabla: formulario de triaje
CREATE TABLE IF NOT EXISTS triage_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_name TEXT NOT NULL,
  tutor_whatsapp TEXT NOT NULL,
  tutor_location TEXT,
  tutor_can_videocall BOOLEAN,
  animal_name TEXT,
  animal_species TEXT NOT NULL,
  animal_age TEXT,
  animal_weight TEXT,
  symptoms TEXT NOT NULL,
  critical_signs TEXT[],
  urgency_level TEXT,
  photo_url TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Índices
CREATE INDEX idx_vet_time_blocks_vet_id ON vet_time_blocks(vet_id);
CREATE INDEX idx_vet_time_blocks_start ON vet_time_blocks(start_ms);
CREATE INDEX idx_triage_forms_created ON triage_forms(created_at DESC);

-- Actualizar appointments para linkear triaje
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS triage_form_id UUID REFERENCES triage_forms(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS meet_link TEXT;
