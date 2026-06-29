'use strict';

const { google } = require('googleapis');

// Crear cliente OAuth para Google Calendar
function getCalendarClient(accessToken, refreshToken) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.FRONTEND_URL || 'http://localhost:3003'}/auth/google/callback`
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

// Crear evento en Google Calendar con Meet
async function createCalendarEvent(vetAccessToken, vetRefreshToken, eventData) {
  try {
    const calendar = getCalendarClient(vetAccessToken, vetRefreshToken);

    const event = {
      summary: `Consulta: ${eventData.animalName} (${eventData.species})`,
      description: `
Tutor: ${eventData.tutorName}
WhatsApp: ${eventData.tutorWhatsapp}
Síntomas: ${eventData.symptoms}
Urgencia: ${eventData.urgency || 'Normal'}
      `.trim(),
      start: {
        dateTime: new Date(eventData.startMs).toISOString(),
        timeZone: 'America/Caracas',
      },
      end: {
        dateTime: new Date(eventData.endMs).toISOString(),
        timeZone: 'America/Caracas',
      },
      conferenceData: {
        createRequest: {
          requestId: `meet-${eventData.appointmentId}`,
          conferenceSolutionKey: {
            key: 'hangoutsMeet',
          },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },  // Email 1 hora antes
          { method: 'popup', minutes: 15 },  // Pop-up 15 min antes
        ],
      },
    };

    const result = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
    });

    console.log(`📅 Evento creado en Calendar:`, result.data.id);
    console.log(`🔗 Meet link:`, result.data.conferenceData?.entryPoints?.[0]?.uri);

    return {
      eventId: result.data.id,
      meetLink: result.data.conferenceData?.entryPoints?.[0]?.uri,
    };
  } catch (err) {
    console.error('❌ Error creando evento en Calendar:', err.message);
    throw err;
  }
}

module.exports = {
  getCalendarClient,
  createCalendarEvent,
};
