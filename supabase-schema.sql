-- ============================================
-- Wolf SOS Schema para Supabase
-- Ejecuta esto en: Supabase Dashboard → SQL Editor
-- ============================================

-- Tabla de veterinarios
CREATE TABLE vets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  specialty TEXT,
  timezone TEXT DEFAULT 'America/Caracas',
  slot_minutes INTEGER DEFAULT 30,
  lead_minutes INTEGER DEFAULT 120,
  horizon_days INTEGER DEFAULT 7,
  modalities TEXT DEFAULT 'video,audio,whatsapp',
  whatsapp TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- Horario semanal
CREATE TABLE availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vet_id UUID NOT NULL REFERENCES vets(id) ON DELETE CASCADE,
  weekday INTEGER,
  start_min INTEGER,
  end_min INTEGER
);

-- Ausencias
CREATE TABLE time_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vet_id UUID NOT NULL REFERENCES vets(id) ON DELETE CASCADE,
  start_ms BIGINT,
  end_ms BIGINT,
  reason TEXT
);

-- Citas
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vet_id UUID NOT NULL REFERENCES vets(id) ON DELETE CASCADE,
  start_ms BIGINT NOT NULL,
  end_ms BIGINT NOT NULL,
  status TEXT DEFAULT 'booked',
  modality TEXT,
  tutor_name TEXT NOT NULL,
  tutor_whatsapp TEXT NOT NULL,
  animal_name TEXT NOT NULL,
  species TEXT NOT NULL,
  urgency TEXT,
  symptoms TEXT,
  created_ms BIGINT,
  created_at TIMESTAMP DEFAULT now()
);

-- Índice para prevenir doble reserva
CREATE UNIQUE INDEX ux_booked_slot
  ON appointments(vet_id, start_ms)
  WHERE status = 'booked';

-- Habilitar Row Level Security (RLS)
ALTER TABLE vets ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Políticas RLS: los vets solo ven sus propios datos
CREATE POLICY "vets_select_own" ON vets
  FOR SELECT USING (true);  -- Cualquiera puede ver vets públicos

CREATE POLICY "availability_select_own" ON availability_rules
  FOR SELECT USING (true);  -- Público

CREATE POLICY "appointments_select_own" ON appointments
  FOR SELECT USING (true);  -- Público para mostrar slots

-- Insertar un vet de ejemplo (opcional)
INSERT INTO vets (email, password_hash, name, specialty, whatsapp)
VALUES (
  'dra-ana@example.com',
  '$2b$10$abcdefghijklmnopqrstuvwxyz',  -- bcrypt hash (cambiar en producción)
  'Dra. Ana Rivas',
  'Medicina General Veterinaria',
  '+584141234567'
);

-- Agregar horario para el vet de ejemplo
INSERT INTO availability_rules (vet_id, weekday, start_min, end_min)
SELECT id, 1, 540, 720 FROM vets WHERE email = 'dra-ana@example.com'
UNION ALL
SELECT id, 1, 900, 1080 FROM vets WHERE email = 'dra-ana@example.com'
UNION ALL
SELECT id, 2, 540, 720 FROM vets WHERE email = 'dra-ana@example.com'
UNION ALL
SELECT id, 2, 900, 1080 FROM vets WHERE email = 'dra-ana@example.com'
UNION ALL
SELECT id, 3, 540, 720 FROM vets WHERE email = 'dra-ana@example.com'
UNION ALL
SELECT id, 3, 900, 1080 FROM vets WHERE email = 'dra-ana@example.com'
UNION ALL
SELECT id, 4, 540, 720 FROM vets WHERE email = 'dra-ana@example.com'
UNION ALL
SELECT id, 4, 900, 1080 FROM vets WHERE email = 'dra-ana@example.com'
UNION ALL
SELECT id, 5, 540, 720 FROM vets WHERE email = 'dra-ana@example.com'
UNION ALL
SELECT id, 5, 900, 1080 FROM vets WHERE email = 'dra-ana@example.com';
