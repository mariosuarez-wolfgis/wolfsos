'use strict';

const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_EXPIRY = '7d';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.NODE_ENV === 'production'
    ? process.env.GOOGLE_REDIRECT_URI_PROD
    : process.env.GOOGLE_REDIRECT_URI
);

// --- GENERAR URL DE LOGIN ---

function getGoogleAuthUrl() {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/calendar',
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });
}

// --- CALLBACK DE GOOGLE (obtener tokens) ---

async function handleGoogleCallback(code) {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Obtener info del usuario
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();

    return {
      googleId: data.id,
      email: data.email,
      name: data.name,
      picture: data.picture,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    };
  } catch (err) {
    throw new Error('Google OAuth failed: ' + err.message);
  }
}

// --- REGISTRAR O LOGUEARSE COMO MÉDICO ---

async function loginOrCreateVet(googleUser, vetData = null) {
  try {
    // Buscar si ya existe
    let vet = await db.getVet(googleUser.email);

    if (vet) {
      // Actualizar tokens de Google
      await db.updateVetGoogleTokens(vet.id, googleUser.accessToken, googleUser.refreshToken);
      vet = await db.getVetById(vet.id);
    } else if (vetData) {
      // Crear nuevo vet
      vet = await db.createVetWithGoogle(
        googleUser.email,
        googleUser.name,
        googleUser.picture,
        googleUser.accessToken,
        googleUser.refreshToken,
        vetData // { specialty, whatsapp, licenseNumber, location, bio }
      );
    } else {
      throw new Error('Vet data required for new registration');
    }

    // Generar JWT propio
    const token = jwt.sign(
      { vetId: vet.id, email: vet.email, name: vet.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    return {
      token,
      vet: {
        id: vet.id,
        email: vet.email,
        name: vet.name,
        specialty: vet.specialty,
        whatsapp: vet.whatsapp,
        picture: vet.picture,
      },
    };
  } catch (err) {
    throw err;
  }
}

// --- REGISTRAR O LOGUEARSE COMO ADMIN ---

async function loginAdmin(googleUser) {
  const adminEmail = process.env.ADMIN_EMAIL || 'patitas@wolfsos.com';

  if (googleUser.email !== adminEmail) {
    throw new Error('Access denied');
  }

  // Crear/actualizar admin en BD
  let admin = await db.getAdmin(adminEmail);
  if (!admin) {
    admin = await db.createAdmin(adminEmail, googleUser.name, googleUser.picture);
  }

  const token = jwt.sign(
    { adminId: admin.id, email: admin.email, role: 'admin' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  return { token, admin };
}

// --- CREAR EVENTO EN GOOGLE CALENDAR DEL MÉDICO ---

async function createCalendarEvent(vetId, appointment, vet) {
  try {
    if (!vet.google_access_token) {
      throw new Error('Vet does not have Google Calendar connected');
    }

    oauth2Client.setCredentials({
      access_token: vet.google_access_token,
      refresh_token: vet.google_refresh_token,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const { DateTime } = require('luxon');
    const tz = vet.timezone || 'America/Caracas';
    const startDt = DateTime.fromMillis(appointment.start_ms, { zone: tz });
    const endDt = DateTime.fromMillis(appointment.end_ms, { zone: tz });

    const event = {
      summary: `Consulta: ${appointment.animal_name} (${appointment.species})`,
      description: `Tutor: ${appointment.tutor_name}\nWhatsApp: ${appointment.tutor_whatsapp}\nSíntomas: ${appointment.symptoms}`,
      start: { dateTime: startDt.toISO(), timeZone: tz },
      end: { dateTime: endDt.toISO(), timeZone: tz },
      conferenceData: {
        createRequest: { conferenceSolution: { key: { conferenceSolution: 'hangoutsMeet' } } },
      },
      attendees: [{ email: appointment.tutor_whatsapp }], // Se usa email, pero podemos agregar después
    };

    const { data } = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
    });

    return {
      eventId: data.id,
      meetLink: data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null,
    };
  } catch (err) {
    console.error('Calendar error:', err);
    return { eventId: null, meetLink: null };
  }
}

// --- VERIFICAR TOKEN JWT ---

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// --- MIDDLEWARE ---

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  req.vetId = payload.vetId || null;
  req.adminId = payload.adminId || null;
  req.email = payload.email;
  next();
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);

  if (!payload || !payload.adminId) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  req.adminId = payload.adminId;
  next();
}

module.exports = {
  oauth2Client,
  getGoogleAuthUrl,
  handleGoogleCallback,
  loginOrCreateVet,
  loginAdmin,
  createCalendarEvent,
  verifyToken,
  requireAuth,
  requireAdmin,
};
