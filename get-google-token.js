#!/usr/bin/env node
'use strict';

require('dotenv').config();
const http = require('http');
const { URL } = require('url');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Error: GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET no están configuradas en .env');
  process.exit(1);
}

console.log('🔓 Obteniendo Google Refresh Token para Wolf SOS Calendar...\n');

// 1. Generar URL de autorización
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar',
].join(' '));
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

console.log(`📱 Abriendo navegador para que autorices con tu cuenta de Google...\n`);
console.log(`Si no se abre automáticamente, visita manualmente:\n${authUrl.toString()}\n`);

// 2. Iniciar servidor local para recibir el callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`❌ Error: ${error}\n\nPor favor intenta de nuevo ejecutando el script.`);
    console.error(`\n❌ Google rechazó la autorización: ${error}`);
    server.close();
    process.exit(1);
    return;
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('❌ No se recibió código de autorización');
    console.error('\n❌ No se recibió código');
    server.close();
    process.exit(1);
    return;
  }

  // 3. Intercambiar código por refresh_token
  console.log('✅ Código recibido, intercambiando por refresh_token...\n');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json();
      throw new Error(`Google API error: ${err.error_description || err.error}`);
    }

    const data = await tokenRes.json();
    const refreshToken = data.refresh_token;

    if (!refreshToken) {
      throw new Error('Google no devolvió un refresh_token. Asegúrate de que usaste access_type=offline y prompt=consent.');
    }

    // 4. Mostrar token
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <h1 style="color: #2e7d32;">✅ ¡Autorización completada!</h1>
      <p>Puedes cerrar esta ventana y volver a la terminal.</p>
    `);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ REFRESH TOKEN OBTENIDO:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(refreshToken);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📌 Pasos siguientes:');
    console.log('1. Copia el token de arriba');
    console.log('2. En tu archivo .env, pon: GOOGLE_REFRESH_TOKEN=<token>');
    console.log('3. En Render, añade esa variable de entorno');
    console.log('4. Redeploy la app\n');

    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 500);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`❌ Error: ${err.message}`);
    console.error(`\n❌ Error intercambiando token:\n`, err.message);
    server.close();
    process.exit(1);
  }
});

// 5. Escuchar en el puerto del REDIRECT_URI
const port = new URL(REDIRECT_URI).port || 80;
server.listen(port, () => {
  console.log(`✅ Servidor local escuchando en puerto ${port || 'default'}...\n`);

  // Abrir navegador automáticamente (Windows)
  const { exec } = require('child_process');
  exec(`start "" "${authUrl.toString()}"`).on('error', () => {
    console.log(`Abre manualmente esta URL:\n${authUrl.toString()}\n`);
  });
});

// Manejo de errores
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Puerto ${port} ya está en uso. Cierra la otra aplicación e intenta de nuevo.`);
  } else {
    console.error(`\n❌ Error del servidor: ${err.message}`);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n\nCancelado.');
  server.close();
  process.exit(0);
});
