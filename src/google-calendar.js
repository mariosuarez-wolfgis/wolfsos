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
    appointmentId,
    vetTimezone = 'America/Caracas',
  } = eventData;

  // Formatear fechas para Google Calendar usando la zona horaria del vet
  const { DateTime } = require('luxon');
  const startDt = DateTime.fromMillis(startMs, { zone: vetTimezone });
  const endDt = DateTime.fromMillis(endMs, { zone: vetTimezone });
  const startDate = startDt.toISO();
  const endDate = endDt.toISO();

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

  // Construir evento SIN conferencia primero
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
    start: { dateTime: startDate, timeZone: vetTimezone },
    end: { dateTime: endDate, timeZone: vetTimezone },
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
    // 1. Crear evento SIN conferencia
    const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      throw new Error(`Google Calendar API error: ${err.error?.message || JSON.stringify(err)}`);
    }

    const createdEvent = await createRes.json();
    console.log(`✅ [GOOGLE CALENDAR] Evento creado: ${createdEvent.id}`);

    // 2. Actualizar evento AGREGANDO conferencia
    // Usar un requestId único para el PATCH
    const eventUpdate = {
      conferenceData: {
        createRequest: {
          requestId: uuidv4(),
          conferenceSolutionKey: {
            key: 'hangoutsMeet',
          },
        },
      },
    };

    const updateRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${createdEvent.id}?conferenceDataVersion=1`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventUpdate),
    });

    let meetLink = null;
    if (updateRes.ok) {
      const updatedEvent = await updateRes.json();
      meetLink = updatedEvent.conferenceData?.entryPoints?.[0]?.uri || null;
      console.log(`✅ Conferencia agregada exitosamente. Meet link: ${meetLink}`);
    } else {
      const updateErr = await updateRes.json();
      console.warn(`⚠️  No se pudo agregar conferencia: ${updateErr.error?.message || JSON.stringify(updateErr)}`);
      console.log(`📹 [GOOGLE CALENDAR] Usando Meet link del evento creado (sin conferencia)`);
    }

    return {
      eventId: createdEvent.id,
      meetLink: meetLink,
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
