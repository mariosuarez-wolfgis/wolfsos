'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-muy-seguro-cambiar-en-produccion';
const JWT_EXPIRY = '7d';

// --- REGISTRO DE NUEVO VET ---

async function registerVet(email, password, name, whatsapp, specialty) {
  // Validar
  if (!email || !password || !name || !whatsapp) {
    throw new Error('Email, contraseña, nombre y WhatsApp son obligatorios');
  }

  if (password.length < 8) {
    throw new Error('Contraseña debe tener al menos 8 caracteres');
  }

  // Verificar que no exista
  const existing = await db.getVet(email);
  if (existing) {
    throw new Error('Este email ya está registrado');
  }

  // Hash contraseña
  const passwordHash = await bcrypt.hash(password, 10);

  // Crear vet
  const vet = await db.createVet(email, passwordHash, name, specialty, whatsapp);

  // Agregar horario por defecto (Lun-Vie 09:00-12:00, 15:00-18:00)
  const defaultRules = [];
  for (let day = 1; day <= 5; day++) {
    defaultRules.push({ weekday: day, startMin: 540, endMin: 720 });    // 09:00-12:00
    defaultRules.push({ weekday: day, startMin: 900, endMin: 1080 });   // 15:00-18:00
  }
  await db.replaceRules(vet.id, defaultRules);

  return {
    id: vet.id,
    email: vet.email,
    name: vet.name,
    message: '✅ Registro exitoso. Puedes loguearte ahora.'
  };
}

// --- LOGIN ---

async function loginVet(email, password) {
  // Buscar vet
  const vet = await db.getVet(email);
  if (!vet) {
    throw new Error('Email o contraseña incorrectos');
  }

  // Verificar contraseña
  const isValid = await bcrypt.compare(password, vet.password_hash);
  if (!isValid) {
    throw new Error('Email o contraseña incorrectos');
  }

  // Generar token JWT
  const token = jwt.sign(
    { vetId: vet.id, email: vet.email, name: vet.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  return {
    token,
    vet: {
      id: vet.id,
      email: vet.email,
      name: vet.name,
      specialty: vet.specialty,
      whatsapp: vet.whatsapp,
      timezone: vet.timezone
    }
  };
}

// --- VERIFICAR TOKEN ---

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// --- MIDDLEWARE PARA PROTEGER RUTAS ---

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  req.vetId = payload.vetId;
  req.vetEmail = payload.email;
  next();
}

module.exports = {
  registerVet,
  loginVet,
  verifyToken,
  requireAuth,
};
