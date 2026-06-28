'use strict';

require('dotenv').config();

const express = require('express');
const path = require('node:path');
const db = require('./db');
const auth = require('./auth');
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

// --- Rutas públicas ---

app.get('/api/vets', async (req, res) => {
  try {
    const vets = await db.listVets();
    res.json(vets.map(v => ({
      id: v.id,
      email: v.email,
      name: v.name,
      specialty: v.specialty,
      modalities: v.modalities ? v.modalities.split(',') : [],
      timezone: v.timezone,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vets/:id', async (req, res) => {
  try {
    const vet = await db.getVet(req.params.id);
    if (!vet) return res.status(404).json({ error: 'Veterinario no encontrado.' });
    res.json({
      id: vet.id,
      email: vet.email,
      name: vet.name,
      specialty: vet.specialty,
      modalities: vet.modalities ? vet.modalities.split(',') : [],
      timezone: vet.timezone,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vets/:id/slots', async (req, res) => {
  try {
    const vet = await db.getVet(req.params.id);
    if (!vet) return res.status(404).json({ error: 'Veterinario no encontrado.' });

    const days = Math.min(parseInt(req.query.days) || 7, 30);
    const nowMs = Date.now();
    const toMs = nowMs + days * 86_400_000;

    const [rules, timeOff, booked] = await Promise.all([
      db.getRules(vet.id),
      db.getTimeOff(vet.id, nowMs, toMs),
      db.getBookedSlots(vet.id, nowMs, toMs)
    ]);

    const vetWithDays = { ...vet, horizon_days: days };
    const slots = generateSlots(vetWithDays, rules, timeOff, booked, nowMs);
    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const { vetId, startIso, modality, tutorName, tutorWhatsapp, animalName, species, urgency, symptoms } = req.body;

    if (!vetId || !startIso || !modality || !tutorName || !tutorWhatsapp || !animalName || !species) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    const vet = await db.getVetById(vetId);
    if (!vet) return res.status(404).json({ error: 'Veterinario no encontrado.' });

    const startMs = new Date(startIso).getTime();
    if (isNaN(startMs)) return res.status(400).json({ error: 'Fecha inválida.' });
    const endMs = startMs + vet.slot_minutes * 60_000;

    const nowMs = Date.now();
    const [rules, timeOff, booked] = await Promise.all([
      db.getRules(vet.id),
      db.getTimeOff(vet.id, nowMs, endMs + 1),
      db.getBookedSlots(vet.id, nowMs, endMs + 1)
    ]);

    const slots = generateSlots(vet, rules, timeOff, booked, nowMs);
    const valid = slots.some(s => s.startMs === startMs);
    if (!valid) {
      return res.status(409).json({ error: 'Ese horario no está disponible. Elige otro.' });
    }

    try {
      const result = await db.insertAppointment({
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
        createdMs: Date.now(),
      });

      const appt = result;
      const tz = vet.timezone || 'America/Caracas';
      const whenLocal = DateTime.fromMillis(startMs, { zone: tz }).toFormat(
        "cccc d 'de' LLLL, HH:mm",
        { locale: 'es' }
      );

      res.status(201).json({
        id: appt.id,
        vet: vet.name,
        whenLocal,
        timezone: tz,
        modality: appt.modality,
        whatsappLink: buildWhatsappLink(appt, vet),
        icsUrl: `/api/bookings/${appt.id}/ics`,
      });
    } catch (err) {
      if (err.code === 'UNIQUE_VIOLATION') {
        return res.status(409).json({ error: 'Ese horario ya fue reservado. Elige otro.' });
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings/:id/ics', async (req, res) => {
  try {
    const appt = await db.getAppointment(req.params.id);
    if (!appt) return res.status(404).json({ error: 'Cita no encontrada.' });

    const vet = await db.getVetById(appt.vet_id);
    if (!vet) return res.status(404).json({ error: 'Veterinario no encontrado.' });

    const ics = buildIcs(appt, vet);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cita-${appt.id}.ics"`);
    res.send(ics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Rutas de autenticación ---

app.post('/api/vets/register', async (req, res) => {
  try {
    const { name, email, password, whatsapp, specialty } = req.body;
    const result = await auth.registerVet(email, password, name, whatsapp, specialty);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/vets/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }
    const result = await auth.loginVet(email, password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// --- Rutas admin (protegidas con JWT) ---

app.get('/api/admin/vets/:vetId/availability', auth.requireAuth, async (req, res) => {
  try {
    if (req.vetId !== req.params.vetId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const rules = await db.getRules(req.params.vetId);
    res.json({
      rules: rules.map(r => ({
        weekday: r.weekday,
        startMin: r.start_min,
        endMin: r.end_min
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/vets/:vetId/availability', auth.requireAuth, async (req, res) => {
  try {
    if (req.vetId !== req.params.vetId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { rules } = req.body;
    if (!Array.isArray(rules)) return res.status(400).json({ error: 'rules debe ser un array.' });

    for (const r of rules) {
      if (r.weekday < 1 || r.weekday > 7) return res.status(400).json({ error: 'weekday debe ser 1-7.' });
      if (r.startMin >= r.endMin) return res.status(400).json({ error: 'startMin debe ser menor que endMin.' });
    }

    await db.replaceRules(req.params.vetId, rules);
    res.json({ ok: true, rules });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/vets/:vetId/time-off', auth.requireAuth, async (req, res) => {
  try {
    if (req.vetId !== req.params.vetId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { startIso, endIso, reason } = req.body;
    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
      return res.status(400).json({ error: 'Rango de ausencia inválido.' });
    }

    await db.addTimeOff(req.params.vetId, startMs, endMs, reason);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/vets/:vetId/appointments', auth.requireAuth, async (req, res) => {
  try {
    if (req.vetId !== req.params.vetId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const vet = await db.getVetById(req.params.vetId);
    if (!vet) return res.status(404).json({ error: 'Veterinario no encontrado.' });

    const fromMs = Date.now();
    const tz = vet.timezone || 'America/Caracas';
    const appointments = await db.listAppointments(req.params.vetId, fromMs);

    res.json(appointments.map(a => ({
      id: a.id,
      startMs: a.start_ms,
      endMs: a.end_ms,
      localTime: DateTime.fromMillis(a.start_ms, { zone: tz }).toFormat(
        "cccc d 'de' LLLL, HH:mm",
        { locale: 'es' }
      ),
      modality: a.modality,
      tutorName: a.tutor_name,
      tutorWhatsapp: a.tutor_whatsapp,
      animalName: a.animal_name,
      species: a.species,
      urgency: a.urgency,
      symptoms: a.symptoms,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Arranque ---

app.listen(PORT, () => {
  console.log(`\n🐾 Wolf SOS — Sistema de Agenda Veterinaria`);
  console.log(`   Servidor: http://localhost:${PORT}`);
  console.log(`   Tutor:    http://localhost:${PORT}/agenda.html`);
  console.log(`   Admin:    http://localhost:${PORT}/admin.html`);
  console.log(`   CORS:     ${CORS_ORIGIN}\n`);
});
