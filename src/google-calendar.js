'use strict';

const { google } = require('googleapis');
const { DateTime } = require('luxon');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

// Crear cliente OAuth autenticado
function createAuthClient() {
  const auth = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob' // Redirect URI para desktop apps
  );

  auth.setCredentials({
    refresh_token: GOOGLE_REFRESH_TOKEN,
  });

  return auth;
}

// Crear evento en Google Calendar CON Google Meet
async function createCalendarEvent(eventData) {
  const auth = createAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const {
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

  // Formatear fechas para Google Calendar
  const startDt = DateTime.fromMillis(startMs, { zone: vetTimezone });
  const endDt = DateTime.fromMillis(endMs, { zone: vetTimezone });

  // Construir lista de asistentes
  const attendees = [
    {
      email: vetEmail,
      displayName: vetName,
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

  // Construir evento CON Google Meet
  const eventBody = {
    summary: `🐾 Consulta Veterinaria - ${animalName}`,
    description: `
Consulta veterinaria para ${animalName}

📋 Datos de la cita:
- Modalidad: ${modality}
- Tutor: ${tutorName}
- Veterinario: ${vetName}
${description ? `- Notas: ${description}` : ''}

El enlace de Google Meet se incluirá en la invitación del calendario.
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
    conferenceData: {
      createRequest: {
        requestId: appointmentId, // Usar appointmentId como requestId
        conferenceSolutionKey: {
          key: 'hangoutsMeet',
        },
      },
    },
  };

  try {
    console.log(`📅 [GOOGLE CALENDAR] Creando evento con Meet para cita ${appointmentId}...`);

    const response = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      requestBody: eventBody,
    });

    const event = response.data;
    console.log(`✅ [GOOGLE CALENDAR] Evento creado: ${event.id}`);

    // Extraer Meet link de la respuesta
    let meetLink = null;
    if (event.conferenceData && event.conferenceData.entryPoints) {
      const meetEntry = event.conferenceData.entryPoints.find(
        (ep) => ep.entryPointType === 'video'
      );
      if (meetEntry) {
        meetLink = meetEntry.uri;
        console.log(`✅ [GOOGLE CALENDAR] Meet link generado: ${meetLink}`);
      }
    }

    if (!meetLink) {
      console.warn(`⚠️  [GOOGLE CALENDAR] No se generó Meet link en la respuesta`);
    }

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
