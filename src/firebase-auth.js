'use strict';

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Si FIREBASE_CONFIG_B64 está configurado, crear el archivo
if (process.env.FIREBASE_CONFIG_B64) {
  const configPath = path.join(__dirname, 'firebase-config.json');
  if (!fs.existsSync(configPath)) {
    try {
      const decoded = Buffer.from(process.env.FIREBASE_CONFIG_B64, 'base64').toString('utf-8');
      fs.writeFileSync(configPath, decoded);
      console.log('✅ firebase-config.json creado desde FIREBASE_CONFIG_B64');
    } catch (err) {
      console.error('❌ Error decodificando FIREBASE_CONFIG_B64:', err.message);
    }
  }
}

// Inicializar Firebase Admin
const serviceAccount = require('./firebase-config.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const auth = admin.auth();

console.log('✅ Firebase Admin inicializado');

// Verificar token de Firebase y obtener usuario
async function verifyFirebaseToken(idToken) {
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
