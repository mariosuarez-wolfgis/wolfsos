-- Tabla de invitaciones para veterinarios

CREATE TABLE IF NOT EXISTS vet_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  invited_by UUID REFERENCES admins(id),
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP DEFAULT (now() + INTERVAL '7 days'),
  accepted_at TIMESTAMP,
  accepted_by UUID REFERENCES vets(id),
  used BOOLEAN DEFAULT false
);

CREATE INDEX idx_vet_invitations_token ON vet_invitations(token);
CREATE INDEX idx_vet_invitations_email ON vet_invitations(email);
CREATE INDEX idx_vet_invitations_used ON vet_invitations(used, expires_at);
