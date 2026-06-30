'use strict';

const { google } = require('googleapis');
const { DateTime } = require('luxon');
const db = require('./db');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Crear cliente OAuth autenticado con token del doctor
function createAuthClient(refreshToken) {
  const auth = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  auth.setCredentials({
    refresh_token: refreshToken,
  });

  return auth;
}

// Crear evento en Google Calendar CON Google Meet (usando token del doctor)
async function createCalendarEvent(eventData) {
  const {
    vetId,
    vetEmail,
    vetName,
    tutorEmail,
    tutorName,
    animalName,
    startMs,
    endMs,
    modality,
    description,
    appointmentId,
    vetTimezone = 'America/Caracas',
  } = eventData;

  // Obtener doctor y su token de Google
  const vet = await db.getVetById(vetId);
  if (!vet) {
    throw new Error(`Veterinarian ${vetId} not found`);
  }

  if (!vet.google_refresh_token || !vet.google_connected) {
    throw new Error(
      `Doctor no tiene Google conectado. Por favor conecta tu cuenta de Google en el panel.`
    );
  }

  // Crear cliente autenticado con token del doctor
  const auth = createAuthClient(vet.google_refresh_token);
  const calendar = google.calendar({ version: 'v3', auth });

  // Formatear fechas para Google Calendar
  const startDt = DateTime.fromMillis(startMs, { zone: vetTimezone });
  const endDt = DateTime.fromMillis(endMs, { zone: vetTimezone });

  // Construir lista de asistentes
  const attendees = [
    {
      email: vetEmail || vet.email,
      displayName: vetName || vet.name,
      responseStatus: 'accepted',
    },
  ];

  if (tutorEmail) {
    attendees.push({
      email: tutorEmail,
      displayName: tutorName || 'Tutor/Dueño',
      responseStatus: 'needsAction',
    });
  }

  // Generar Meet link manual (formato: xxx-yyy-zzz con caracteres del UUID)
  const uuidNoGuiones = appointmentId.replace(/-/g, '');
  const meetLink = `https://meet.google.com/${uuidNoGuiones.substring(0, 3)}-${uuidNoGuiones.substring(3, 6)}-${uuidNoGuiones.substring(6, 9)}`;

  // Construir evento SIN conferencia automática (Google no la permite)
  // Pero incluir Meet link manual en la descripción
  const eventBody = {
    summary: `🐾 Consulta Veterinaria - ${animalName}`,
    description: `
Consulta veterinaria para ${animalName}

📋 Datos de la cita:
- Modalidad: ${modality}
- Tutor: ${tutorName}
- Veterinario: ${vetName || vet.name}
${description ? `- Notas: ${description}` : ''}

🔗 Google Meet: ${meetLink}
    `.trim(),
    start: {
      dateTime: startDt.toISO(),
      timeZone: vetTimezone,
    },
    end: {
      dateTime: endDt.toISO(),
      timeZone: vetTimezone,
    },
    attendees: attendees,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 },
        { method: 'email', minutes: 15 },
      ],
    },
  };

  try {
    console.log(
      `📅 [GOOGLE CALENDAR] Creando evento para cita ${appointmentId} (doctor: ${vet.email})...`
    );

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventBody,
    });

    const event = response.data;
    console.log(`✅ [GOOGLE CALENDAR] Evento creado: ${event.id}`);
    console.log(`✅ [GOOGLE CALENDAR] Meet link: ${meetLink}`);

    return {
      eventId: event.id,
      meetLink: meetLink,
      eventLink: event.htmlLink,
    };
  } catch (err) {
    console.error('❌ Error creando evento en Calendar:', err.message);
    if (err.errors) {
      console.error('   Detalles:', err.errors);
    }
    throw err;
  }
}

module.exports = {
  createCalendarEvent,
};
