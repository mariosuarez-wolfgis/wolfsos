'use strict';

const { google } = require('googleapis');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

// Crear cliente OAuth autenticado con refresh token
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

// Crear espacio de reunión en Google Meet API v2
async function createMeetingSpace(refreshToken) {
  if (!refreshToken) {
    throw new Error('Refresh token requerido para crear espacio de Meet');
  }

  const auth = createAuthClient(refreshToken);

  try {
    console.log(`📹 [GOOGLE MEET] Creando espacio de reunión...`);

    const accessToken = await auth.getAccessToken();

    const response = await fetch('https://meet.googleapis.com/v2/spaces', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Meet API error: ${err.error?.message || JSON.stringify(err)}`);
    }

    const space = await response.json();
    console.log(`✅ [GOOGLE MEET] Espacio creado: ${space.name}`);

    // Extraer meeting code del espacio
    // Formato: spaces/{spaceId}
    const spaceId = space.name?.split('/')[1];
    const meetingCode = space.meetingCode || spaceId;
    const meetLink = `https://meet.google.com/${meetingCode}`;

    console.log(`✅ [GOOGLE MEET] Meeting link: ${meetLink}`);

    return {
      spaceId: spaceId,
      meetingCode: meetingCode,
      meetLink: meetLink,
      spaceName: space.name,
    };
  } catch (err) {
    console.error('❌ Error creando espacio de Meet:', err.message);
    throw err;
  }
}

module.exports = {
  createMeetingSpace,
};
