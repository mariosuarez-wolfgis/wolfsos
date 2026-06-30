-- Migración: Agregar campos de estado a tabla appointments
-- Ejecutar en Supabase SQL Editor (https://app.supabase.com/project/[TU_PROJECT]/sql)

-- Agregar columnas de estado
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_status TEXT DEFAULT 'booked';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS status_updated_at BIGINT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS status_updated_by UUID REFERENCES vets(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS no_show_reason TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS vet_notes TEXT;

-- Crear índices para performance
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(appointment_status);
CREATE INDEX IF NOT EXISTS idx_appointments_status_updated ON appointments(status_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_vet_status ON appointments(vet_id, appointment_status);

-- Verificar que se crearon correctamente
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'appointments'
AND column_name IN ('appointment_status', 'status_updated_at', 'status_updated_by', 'cancellation_reason', 'no_show_reason', 'vet_notes');
