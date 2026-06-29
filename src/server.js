'use strict';

require('dotenv').config();

const express = require('express');
const path = require('node:path');
const db = require('./db');
const googleAuth = require('./google-auth');
const { verifyFirebaseToken } = require('./firebase-auth');
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
  console.log('🔐 Google Auth URL requested:', url);
  res.json({ authUrl: url });
});

// DEBUG: Mostrar configuración de Google OAuth
app.get('/debug/google-config', (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
  const redirectUri = isProduction
    ? (process.env.GOOGLE_REDIRECT_URI_PROD || 'https://wolfsos.onrender.com/auth/google/callback')
    : (process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3003/auth/google/callback');

  res.json({
    NODE_ENV: process.env.NODE_ENV || 'not set',
    RENDER: process.env.RENDER || 'not set',
    isProduction: isProduction,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? '✓ Configurado' : '❌ No configurado',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? '✓ Configurado' : '❌ No configurado',
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'not set',
    GOOGLE_REDIRECT_URI_PROD: process.env.GOOGLE_REDIRECT_URI_PROD || 'not set',
    'redirectUri_BEING_USED': redirectUri,
  });
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
// VET LOGIN (Email/Password)
// ============================================

app.post('/api/vets/login-password', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!password) return res.status(400).json({ error: 'Password required' });

    // Obtener vet
    const vet = await db.getVet(email);
    if (!vet || !vet.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Validar contraseña
    const bcrypt = require('bcryptjs');
    const validPassword = await bcrypt.compare(password, vet.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generar JWT
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'secret';
    const vetToken = jwt.sign(
      { vetId: vet.id, email: vet.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token: vetToken,
      vet: {
        id: vet.id,
        email: vet.email,
        name: vet.name,
      }
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
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
// VET REGISTER (Simple - Solo contraseña)
// ============================================

app.post('/api/vets/register-simple', async (req, res) => {
  try {
    const { password, invitationToken } = req.body;

    if (!password) return res.status(400).json({ error: 'Password required' });
    if (!invitationToken) return res.status(400).json({ error: 'Invitation token required' });

    console.log(`📝 Vet registration attempt with token: ${invitationToken.substring(0, 20)}...`);

    // Validar invitación
    let invitation;
    try {
      invitation = await adminService.validateInvitationToken(invitationToken);
    } catch (err) {
      console.error(`❌ Invalid invitation token: ${err.message}`);
      return res.status(403).json({ error: `Invalid invitation: ${err.message}` });
    }

    if (!invitation) {
      console.error('❌ Invitation not found');
      return res.status(403).json({ error: 'Invitation token not found' });
    }

    const email = invitation.email;
    console.log(`✓ Invitation valid for email: ${email}`);

    // Verificar que no exista vet
    const existing = await db.getVet(email);
    if (existing) {
      console.warn(`⚠️  Email already registered: ${email}`);
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hashear contraseña
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear vet con los datos de la invitación
    const vet = await db.createVetWithPassword(
      email,
      hashedPassword,
      invitation.specialty || null,
      invitation.license_number || null,
      invitation.whatsapp || null,
      invitation.location || null,
      null // bio
    );

    console.log(`✅ Vet created: ${vet.id}`);

    // Marcar invitación como usada
    await adminService.useInvitation(invitationToken, vet.id);

    // Generar JWT para sesión
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'secret';
    const vetToken = jwt.sign(
      { vetId: vet.id, email: vet.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token: vetToken,
      vet: {
        id: vet.id,
        email: vet.email,
      }
    });
  } catch (err) {
    console.error(`❌ Registration error: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// VET REGISTER (Email/Password - Completo)
// ============================================

app.post('/api/vets/register', async (req, res) => {
  try {
    const { email, password, invitationToken, specialty, licenseNumber, whatsapp, location, bio } = req.body;

    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!password) return res.status(400).json({ error: 'Password required' });
    if (!invitationToken) return res.status(400).json({ error: 'Invitation token required' });
    if (!specialty) return res.status(400).json({ error: 'Specialty required' });
    if (!licenseNumber) return res.status(400).json({ error: 'License number required' });
    if (!whatsapp) return res.status(400).json({ error: 'WhatsApp required' });

    // Validar invitación
    const invitation = await adminService.validateInvitationToken(invitationToken);
    if (invitation.email !== email) {
      return res.status(403).json({ error: 'Email does not match invitation' });
    }

    // Verificar que no exista vet
    const existing = await db.getVet(email);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hashear contraseña
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear vet con contraseña
    const vet = await db.createVetWithPassword(
      email,
      hashedPassword,
      specialty,
      licenseNumber,
      whatsapp,
      location || null,
      bio || null
    );

    // Marcar invitación como usada
    await adminService.useInvitation(invitationToken, vet.id);

    // Generar JWT para sesión
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'secret';
    const vetToken = jwt.sign(
      { vetId: vet.id, email: vet.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token: vetToken,
      vet: {
        id: vet.id,
        email: vet.email,
        name: vet.name,
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// ADMIN SETUP (Primer acceso - contraseña)
// ============================================

app.post('/api/admin/setup', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });

    const adminPassword = process.env.ADMIN_TOKEN || 'yJUC9awDLms6zBXRrViw';
    if (password !== adminPassword) {
      return res.status(403).json({ error: 'Invalid password' });
    }

    // Verificar si ya existe admin
    const adminEmail = process.env.ADMIN_EMAIL || 'patitas@wolfsos.com';
    const existing = await db.getAdmin(adminEmail);
    if (existing) {
      return res.status(400).json({ error: 'Admin already exists. Use Google OAuth to login.' });
    }

    // Crear admin inicial
    const admin = await db.createAdmin(adminEmail, 'Administrador Wolf SOS', null);

    // Generar token JWT
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'secret';
    const adminToken = jwt.sign(
      { adminId: admin.id, email: admin.email, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token: adminToken,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
      },
      message: 'Admin creado exitosamente'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
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
// ADMIN LOGIN (Firebase)
// ============================================

app.post('/api/admin/login-firebase', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Firebase idToken required' });

    // Verificar Firebase
    const firebaseUser = await verifyFirebaseToken(idToken);
    if (!firebaseUser) return res.status(503).json({ error: 'Firebase not configured' });

    // Verificar que sea admin (email debe ser patitas@wolfsos.com)
    const adminEmail = process.env.ADMIN_EMAIL || 'patitas@wolfsos.com';
    if (firebaseUser.email !== adminEmail) {
      return res.status(403).json({ error: 'Only admins can login here' });
    }

    // Obtener o crear admin en BD
    let adminUser = await db.getAdmin(firebaseUser.email);
    if (!adminUser) {
      adminUser = await db.createAdmin(firebaseUser.email, firebaseUser.name, firebaseUser.picture);
    }

    // Generar JWT para usar en el panel
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'secret';
    const adminToken = jwt.sign(
      { adminId: adminUser.id, email: adminUser.email, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token: adminToken,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
      }
    });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// ============================================
// ADMIN LOGIN (Contraseña - alternativa)
// ============================================

app.post('/api/admin/login-password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });

    const adminPassword = process.env.ADMIN_TOKEN || 'yJUC9awDLms6zBXRrViw';
    if (password !== adminPassword) {
      return res.status(403).json({ error: 'Invalid password' });
    }

    // Obtener admin existente
    const adminEmail = process.env.ADMIN_EMAIL || 'patitas@wolfsos.com';
    const admin = await db.getAdmin(adminEmail);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found. Run setup first.' });
    }

    // Generar token JWT
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'secret';
    const adminToken = jwt.sign(
      { adminId: admin.id, email: admin.email, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token: adminToken,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
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
    const { email, name, whatsapp } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!name) return res.status(400).json({ error: 'Name required' });
    if (!whatsapp) return res.status(400).json({ error: 'WhatsApp required' });

    const result = await adminService.inviteVet(req.adminId, {
      email,
      name,
      whatsapp,
    });
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
