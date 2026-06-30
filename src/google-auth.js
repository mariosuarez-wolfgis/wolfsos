'use strict';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3003/api/vets/google/callback';

// Generar URL de autorización de Google
function getAuthUrl(vetId) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar',
    access_type: 'offline',
    prompt: 'consent', // Forzar que pida permiso cada vez
    state: vetId, // Pasar vetId para verificar después
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Intercambiar authorization code por tokens
async function exchangeCodeForTokens(code) {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: GOOGLE_REDIRECT_URI,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OAuth error: ${error.error_description || error.error}`);
    }

    const tokens = await response.json();
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    };
  } catch (err) {
    console.error('❌ Error intercambiando código por tokens:', err.message);
    throw err;
  }
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
};
