'use strict';

require('dotenv').config();

const express = require('express');
const path = require('node:path');
const db = require('./db');
const googleAuth = require('./google-auth');
const adminService = require('./admin-service');
const { generateSlots } = require('./slots');
const { buildIcs, buildWhatsappLink } = require('./format');
const { DateTime } = require('luxon');

const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();

app.use(express.json());
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (CORS_ORIGIN === '*' || origin === CORS_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// ============================================
// GOOGLE OAUTH ROUTES
// ============================================

app.get('/auth/google/url', (req, res) => {
  const url = googleAuth.getGoogleAuthUrl();
  res.json({ authUrl: url });
});

app.post('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code required' });

    const googleUser = await googleAuth.handleGoogleCallback(code);

    // Determinar si es médico, admin, o nuevo registro
    let userType = req.body.userType; // 'vet', 'admin', o 'register'

    if (userType === 'admin') {
      const result = await googleAuth.loginAdmin(googleUser);
      return res.json(result);
    }

    if (userType === 'register') {
      // Nuevo registro de médico
      const vetData = req.body.vetData;
      const result = await googleAuth.loginOrCreateVet(googleUser, vetData);
      return res.json(result);
    }

    // Login normal (vet o admin)
    const vet = await db.getVet(googleUser.email);
    if (vet) {
      await db.updateVetGoogleTokens(vet.id, googleUser.accessToken, googleUser.refreshToken);
      const result = await googleAuth.loginOrCreateVet(googleUser);
      return res.json(result);
    }

    return res.status(404).json({ error: 'Vet not found. Register first.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// VET REGISTRATION (Primer registro con Google)
// ============================================

app.post('/api/vets/register', async (req, res) => {
  try {
    const { code, specialty, whatsapp, licenseNumber, location, bio } = req.body;
    if (!code) return res.status(400).json({ error: 'Google code required' });

    const googleUser = await googleAuth.handleGoogleCallback(code);

    // Verificar que no exista
    const existing = await db.getVet(googleUser.email);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Crear vet con datos completos
    const vetData = {
      specialty,
      whatsapp,
      licenseNumber,
      location,
      bio,
    };

    const result = await googleAuth.loginOrCreateVet(googleUser, vetData);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// VET LOGIN (Google OAuth existente)
// ============================================

app.post('/api/vets/login', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Google code required' });

    const googleUser = await googleAuth.handleGoogleCallback(code);
    const result = await googleAuth.loginOrCreateVet(googleUser);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// ============================================
// ADMIN LOGIN (Google OAuth)
// ============================================

app.post('/api/admin/login', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Google code required' });

    const googleUser = await googleAuth.handleGoogleCallback(code);
    const result = await googleAuth.loginAdmin(googleUser);
    res.json(result);
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

// ============================================
// PUBLIC: VETS Y HORARIOS
// ============================================

app.get('/api/vets', async (req, res) => {
  try {
    const vets = await db.listVets();
    res.json(vets.map(v => ({
      id: v.id,
      name: v.name,
      specialty: v.specialty,
      picture: v.picture,
      modalities: v.modalities ? v.modalities.split(',') : [],
      timezone: v.timezone,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vets/:id', async (req, res) => {
  try {
    const vet = await db.getVetById(req.params.id);
    if (!vet) return res.status(404).json({ error: 'Veterinarian not found' });
    res.json({
      id: vet.id,
      name: vet.name,
      specialty: vet.specialty,
      picture: vet.picture,
      modalities: vet.modalities ? vet.modalities.split(',') : [],
      timezone: vet.timezone,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SLOTS desde bloques flexibles
app.get('/api/vets/:id/slots', async (req, res) => {
  try {
    const vet = await db.getVetById(req.params.id);
    if (!vet) return res.status(404).json({ error: 'Veterinarian not found' });

    const days = Math.min(parseInt(req.query.days) || 7, 30);
    const nowMs = Date.now();
    const toMs = nowMs + days * 86_400_000;

    // Obtener bloques de tiempo del vet
    const timeBlocks = await db.getVetTimeBlocks(vet.id, nowMs, toMs);
    const booked = await db.getBookedSlots(vet.id, nowMs, toMs);

    // Generar slots desde bloques
    const slots = [];
    const tz = vet.timezone || 'America/Caracas';
    const slotDurationMs = (vet.slot_minutes || 30) * 60 * 1000;

    timeBlocks.forEach(block => {
      let cursor = block.start_ms;
      while (cursor + slotDurationMs <= block.end_ms) {
        const endCursor = cursor + slotDurationMs;

        // Verificar que no esté ocupado
        const isBooked = booked.some(b => cursor < b.end_ms && endCursor > b.start_ms);
        if (!isBooked) {
          const startDt = DateTime.fromMillis(cursor, { zone: tz });
          slots.push({
            startMs: cursor,
            endMs: endCursor,
            startIso: startDt.toUTC().toISO(),
            endIso: DateTime.fromMillis(endCursor, { zone: tz }).toUTC().toISO(),
            localTime: startDt.toFormat("cccc d LLLL, HH:mm", { locale: 'es' }),
          });
        }

        cursor = endCursor;
      }
    });

    res.json(slots.sort((a, b) => a.startMs - b.startMs));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// TRIAGE FORM
// ============================================

app.post('/api/triage', async (req, res) => {
  try {
    const triageData = {
      tutorName: req.body.tutorName,
      tutorWhatsapp: req.body.tutorWhatsapp,
      tutorLocation: req.body.tutorLocation,
      tutorCanVideocall: req.body.tutorCanVideocall,
      animalName: req.body.animalName,
      animalSpecies: req.body.animalSpecies,
      animalAge: req.body.animalAge,
      animalWeight: req.body.animalWeight,
      symptoms: req.body.symptoms,
      criticalSigns: req.body.criticalSigns || [],
      urgencyLevel: req.body.urgencyLevel,
      photoUrl: req.body.photoUrl,
    };

    const triage = await db.createTriageForm(triageData);
    res.status(201).json(triage);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// BOOKINGS
// ============================================

app.post('/api/bookings', async (req, res) => {
  try {
    const { vetId, startIso, modality, tutorName, tutorWhatsapp, animalName, species, urgency, symptoms, triageFormId } = req.body;

    if (!vetId || !startIso || !modality || !tutorName || !tutorWhatsapp || !animalName || !species) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const vet = await db.getVetById(vetId);
    if (!vet) return res.status(404).json({ error: 'Veterinarian not found' });

    const startMs = new Date(startIso).getTime();
    if (isNaN(startMs)) return res.status(400).json({ error: 'Invalid date' });
    const endMs = startMs + vet.slot_minutes * 60 * 1000;

    const nowMs = Date.now();
    const booked = await db.getBookedSlots(vet.id, nowMs, endMs + 1);

    // Verificar que no esté booked
    const isBooked = booked.some(b => startMs < b.end_ms && endMs > b.start_ms);
    if (isBooked) {
      return res.status(409).json({ error: 'Slot already booked' });
    }

    // Crear cita
    try {
      const appointmentData = {
        vetId: vet.id,
        startMs,
        endMs,
        modality,
        tutorName,
        tutorWhatsapp,
        animalName,
        species,
        urgency: urgency || '',
        symptoms: symptoms || '',
        triageFormId: triageFormId || null,
        createdMs: Date.now(),
      };

      const appointment = await db.insertAppointment(appointmentData);

      // Crear evento en Google Calendar del médico
      let googleEventId = null;
      let meetLink = null;

      if (vet.google_access_token) {
        const calResult = await googleAuth.createCalendarEvent(vet.id, appointment, vet);
        if (calResult.eventId) {
          googleEventId = calResult.eventId;
          meetLink = calResult.meetLink;
          await db.updateAppointmentGoogleData(appointment.id, googleEventId, meetLink);
        }
      }

      const tz = vet.timezone || 'America/Caracas';
      const whenLocal = DateTime.fromMillis(startMs, { zone: tz }).toFormat(
        "cccc d 'de' LLLL, HH:mm",
        { locale: 'es' }
      );

      res.status(201).json({
        id: appointment.id,
        vet: vet.name,
        whenLocal,
        timezone: tz,
        modality: appointment.modality,
        meetLink: meetLink,
        whatsappLink: buildWhatsappLink(appointment, vet),
        icsUrl: `/api/bookings/${appointment.id}/ics`,
      });
    } catch (err) {
      if (err.code === 'UNIQUE_VIOLATION') {
        return res.status(409).json({ error: 'Slot already booked' });
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings/:id/ics', async (req, res) => {
  try {
    const appointment = await db.getAppointment(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    const vet = await db.getVetById(appointment.vet_id);
    if (!vet) return res.status(404).json({ error: 'Veterinarian not found' });

    const ics = buildIcs(appointment, vet);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cita-${appointment.id}.ics"`);
    res.send(ics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// VET ROUTES (Protegidas con JWT)
// ============================================

app.get('/api/admin/vets/:vetId/time-blocks', googleAuth.requireAuth, async (req, res) => {
  try {
    if (req.vetId !== req.params.vetId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const blocks = await db.getVetTimeBlocks(req.params.vetId, 0, Date.now() + 90 * 86_400_000);
    res.json(blocks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/vets/:vetId/time-blocks', googleAuth.requireAuth, async (req, res) => {
  try {
    if (req.vetId !== req.params.vetId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { startMs, endMs, durationMinutes } = req.body;
    if (!startMs || !endMs) return res.status(400).json({ error: 'Start and end times required' });

    const block = await db.createTimeBlock(req.params.vetId, startMs, endMs, durationMinutes);
    res.status(201).json(block);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/vets/:vetId/time-blocks/:blockId', googleAuth.requireAuth, async (req, res) => {
  try {
    if (req.vetId !== req.params.vetId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await db.deleteTimeBlock(req.params.blockId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/vets/:vetId/appointments', googleAuth.requireAuth, async (req, res) => {
  try {
    if (req.vetId !== req.params.vetId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const vet = await db.getVetById(req.params.vetId);
    if (!vet) return res.status(404).json({ error: 'Veterinarian not found' });

    const appointments = await db.listAppointments(req.params.vetId, Date.now());
    const tz = vet.timezone || 'America/Caracas';

    res.json(appointments.map(a => ({
      id: a.id,
      startMs: a.start_ms,
      endMs: a.end_ms,
      localTime: DateTime.fromMillis(a.start_ms, { zone: tz }).toFormat(
        "cccc d 'de' LLLL, HH:mm",
        { locale: 'es' }
      ),
      tutorName: a.tutor_name,
      tutorWhatsapp: a.tutor_whatsapp,
      animalName: a.animal_name,
      species: a.species,
      modality: a.modality,
      urgency: a.urgency,
      symptoms: a.symptoms,
      meetLink: a.meet_link,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN ROUTES (Protegidas)
// ============================================

app.post('/api/admin/invite', googleAuth.requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const result = await adminService.inviteVet(req.adminId, email);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/stats', googleAuth.requireAdmin, async (req, res) => {
  try {
    const stats = await adminService.getAdminStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/vets', googleAuth.requireAdmin, async (req, res) => {
  try {
    const vets = await adminService.listVetersAdmin(req.adminId);
    res.json(vets.map(v => ({
      id: v.id,
      email: v.email,
      name: v.name,
      specialty: v.specialty,
      whatsapp: v.whatsapp,
      location: v.location,
      picture: v.picture,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/appointments', googleAuth.requireAdmin, async (req, res) => {
  try {
    // Para admin, mostrar TODAS las citas
    const { data, error } = await db.supabase
      .from('appointments')
      .select(`
        *,
        vets:vet_id(name, email),
        triage_forms(*)
      `)
      .eq('status', 'booked')
      .order('start_ms');

    if (error) throw error;

    const appointments = data.map(a => ({
      id: a.id,
      vet: a.vets?.name || 'Unknown',
      vetEmail: a.vets?.email,
      tutorName: a.tutor_name,
      tutorWhatsapp: a.tutor_whatsapp,
      animalName: a.animal_name,
      species: a.species,
      startMs: a.start_ms,
      urgency: a.urgency,
      symptoms: a.symptoms,
      meetLink: a.meet_link,
    }));

    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// STARTUP
// ============================================

app.listen(PORT, () => {
  console.log(`\n🐾 Wolf SOS v2 — Sistema de Agenda Veterinaria`);
  console.log(`   Servidor: http://localhost:${PORT}`);
  console.log(`   Tutor:    http://localhost:${PORT}/agenda.html`);
  console.log(`   Admin:    http://localhost:${PORT}/admin.html`);
  console.log(`   CORS:     ${CORS_ORIGIN}\n`);
});
