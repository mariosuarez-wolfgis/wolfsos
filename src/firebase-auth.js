'use strict';

const path = require('path');
const fs = require('fs');

// Verificar si Firebase está configurado
const FIREBASE_CONFIG_B64 = process.env.FIREBASE_CONFIG_B64;
const hasFirebaseConfig = !!FIREBASE_CONFIG_B64;

let admin = null;
let auth = null;

if (hasFirebaseConfig) {
  try {
    const admin_ = require('firebase-admin');

    // Si FIREBASE_CONFIG_B64 está configurado, crear el archivo
    const configPath = path.join(__dirname, 'firebase-config.json');
    if (!fs.existsSync(configPath)) {
      try {
        const decoded = Buffer.from(FIREBASE_CONFIG_B64, 'base64').toString('utf-8');
        fs.writeFileSync(configPath, decoded);
        console.log('✅ firebase-config.json creado desde FIREBASE_CONFIG_B64');
      } catch (err) {
        console.error('❌ Error decodificando FIREBASE_CONFIG_B64:', err.message);
      }
    }

    // Inicializar Firebase Admin
    const serviceAccount = require('./firebase-config.json');

    admin_.initializeApp({
      credential: admin_.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });

    auth = admin_.auth();
    admin = admin_;

    console.log('✅ Firebase Admin inicializado');
  } catch (err) {
    console.error('❌ Error inicializando Firebase:', err.message);
  }
} else {
  console.log('⚠️  Firebase no está configurado (FIREBASE_CONFIG_B64 no existe)');
}

// Verificar token de Firebase y obtener usuario
async function verifyFirebaseToken(idToken) {
  if (!auth) {
    throw new Error('Firebase not configured');
  }

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || 'Unknown',
      picture: decodedToken.picture || null,
    };
  } catch (err) {
    throw new Error(`Invalid Firebase token: ${err.message}`);
  }
}

// Middleware para requerir autenticación con Firebase
function requireFirebaseAuth(req, res, next) {
  if (!auth) {
    return res.status(503).json({ error: 'Firebase not configured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No Firebase token provided' });
  }

  const idToken = authHeader.slice(7);

  verifyFirebaseToken(idToken)
    .then((user) => {
      req.firebaseUser = user;
      next();
    })
    .catch((err) => {
      res.status(401).json({ error: err.message });
    });
}

module.exports = {
  auth,
  verifyFirebaseToken,
  requireFirebaseAuth,
};
