'use strict';

const { v4: uuidv4 } = require('uuid');
const { DateTime } = require('luxon');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

let cachedAccessToken = null;
let cachedTokenExpireAt = null;

// Obtener access_token usando refresh_token
async function getAccessToken() {
  // Si tenemos un token en cache y no ha expirado, lo usamos
  if (cachedAccessToken && cachedTokenExpireAt && Date.now() < cachedTokenExpireAt) {
    return cachedAccessToken;
  }

  if (!GOOGLE_REFRESH_TOKEN) {
    throw new Error('GOOGLE_REFRESH_TOKEN no configurado');
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Google OAuth error: ${err.error_description || err.error}`);
    }

    const data = await res.json();
    cachedAccessToken = data.access_token;
    cachedTokenExpireAt = Date.now() + (data.expires_in - 60) * 1000; // Cache por expires_in - 60s

    return cachedAccessToken;
  } catch (err) {
    console.error('❌ Error obteniendo access_token:', err.message);
    throw err;
  }
}

// Crear evento en Google Calendar
async function createCalendarEvent(eventData) {
  const accessToken = await getAccessToken();

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
    appointmentId, // ID único de la cita para requestId
  } = eventData;

  // Formatear fechas para Google Calendar (ISO 8601)
  const startDate = new Date(startMs).toISOString();
  const endDate = new Date(endMs).toISOString();

  // Construir lista de asistentes
  const attendees = [
    {
      email: vetEmail,
      displayName: vetName,
      responseStatus: 'accepted', // El creador es aceptado automáticamente
    },
  ];

  // Agregar tutor si tiene email
  if (tutorEmail) {
    attendees.push({
      email: tutorEmail,
      displayName: tutorName || 'Tutor/Dueño',
      responseStatus: 'needsAction',
    });
  }

  // Construir evento
  const event = {
    summary: `🐾 Consulta Veterinaria - ${animalName}`,
    description: `
Consulta veterinaria para ${animalName}

📋 Datos de la cita:
- Modalidad: ${modality}
- Tutor: ${tutorName}
- Veterinario: ${vetName}
${description ? `- Notas: ${description}` : ''}

El enlace de Google Meet estará disponible en la invitación de calendario.
    `.trim(),
    start: { dateTime: startDate, timeZone: 'UTC' },
    end: { dateTime: endDate, timeZone: 'UTC' },
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
        requestId: appointmentId || uuidv4(), // Usar ID de cita como requestId
        conferenceSolutionKey: {
          key: 'hangoutsMeet', // Google Meet
        },
      },
    },
  };

  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Google Calendar API error: ${err.error?.message || JSON.stringify(err)}`);
    }

    const createdEvent = await res.json();

    return {
      eventId: createdEvent.id,
      meetLink: createdEvent.conferenceData?.entryPoints?.[0]?.uri || null,
      eventLink: createdEvent.htmlLink,
    };
  } catch (err) {
    console.error('❌ Error creando evento en Calendar:', err.message);
    throw err;
  }
}

module.exports = {
  createCalendarEvent,
  getAccessToken,
};
