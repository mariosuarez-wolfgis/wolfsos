#!/usr/bin/env node
'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'agenda.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode=WAL;');
db.exec('PRAGMA foreign_keys=ON;');

const cmd = process.argv[2];

// Inicializar BD si no existe
function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vets (
      id            INTEGER PRIMARY KEY,
      slug          TEXT UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      specialty     TEXT,
      timezone      TEXT DEFAULT 'America/Caracas',
      slot_minutes  INTEGER DEFAULT 30,
      lead_minutes  INTEGER DEFAULT 120,
      horizon_days  INTEGER DEFAULT 7,
      modalities    TEXT DEFAULT 'video,audio,whatsapp',
      whatsapp      TEXT,
      active        INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS availability_rules (
      id        INTEGER PRIMARY KEY,
      vet_id    INTEGER REFERENCES vets(id),
      weekday   INTEGER,
      start_min INTEGER,
      end_min   INTEGER
    );
  `);
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

if (cmd === 'add-vet') {
  ensureSchema();
  const name = process.argv[3] || '';
  const whatsapp = process.argv[4] || '';
  const specialty = process.argv[5] || '';

  if (!name || !whatsapp) {
    console.error('❌ Uso: node setup.js add-vet "Nombre Completo" "+584141234567" "[especialidad]"');
    console.error('   Ejemplo: node setup.js add-vet "Dra. Ana Rivas" "+584141234567" "Medicina General"');
    process.exit(1);
  }

  const slug = slugify(name);
  const existing = db.prepare('SELECT id FROM vets WHERE slug = ?').get(slug);
  if (existing) {
    console.error(`❌ Ya existe veterinario con slug "${slug}"`);
    process.exit(1);
  }

  try {
    const result = db.prepare(
      `INSERT INTO vets (slug, name, specialty, timezone, modalities, whatsapp, active)
       VALUES (?, ?, ?, 'America/Caracas', 'video,audio,whatsapp', ?, 1)`
    ).run(slug, name, specialty || null, whatsapp);

    // Agregar horario por defecto (Lun-Vie 09:00-12:00, 15:00-18:00)
    const insRule = db.prepare('INSERT INTO availability_rules (vet_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?)');
    for (let day = 1; day <= 5; day++) {
      insRule.run(result.lastInsertRowid, day, 540, 720);   // 09:00-12:00
      insRule.run(result.lastInsertRowid, day, 900, 1080);  // 15:00-18:00
    }

    console.log(`\n✅ Veterinario creado exitosamente:\n`);
    console.log(`   Nombre:      ${name}`);
    console.log(`   Slug:        ${slug}`);
    console.log(`   WhatsApp:    ${whatsapp}`);
    console.log(`   Horario:     Lun-Vie 09:00-12:00, 15:00-18:00 (hora Venezuela)`);
    console.log(`\n📋 Acceso al panel:`);
    console.log(`   http://localhost:3000/admin.html?slug=${slug}&token=TU_TOKEN_AQUI\n`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }

} else if (cmd === 'list-vets') {
  ensureSchema();
  const vets = db.prepare('SELECT id, name, slug, whatsapp, specialty FROM vets WHERE active = 1 ORDER BY name').all();

  if (!vets.length) {
    console.log('\n📋 No hay veterinarios registrados.');
    process.exit(0);
  }

  console.log('\n🐾 Veterinarios registrados:\n');
  vets.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.name}`);
    console.log(`     • Slug:       ${v.slug}`);
    console.log(`     • WhatsApp:   ${v.whatsapp}`);
    if (v.specialty) console.log(`     • Especialidad: ${v.specialty}`);
    console.log();
  });
} else if (cmd === 'del-vet') {
  ensureSchema();
  const slug = process.argv[3];
  if (!slug) {
    console.error('❌ Uso: node setup.js del-vet <slug>');
    process.exit(1);
  }

  const vet = db.prepare('SELECT id, name FROM vets WHERE slug = ?').get(slug);
  if (!vet) {
    console.error(`❌ Veterinario "${slug}" no encontrado.`);
    process.exit(1);
  }

  db.prepare('UPDATE vets SET active = 0 WHERE slug = ?').run(slug);
  console.log(`✅ Veterinario "${vet.name}" desactivado.\n`);
} else {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                   🐾 Wolf SOS — Setup                         ║
║          Gestiona veterinarios y configuración                ║
╚═══════════════════════════════════════════════════════════════╝

COMANDOS:

  Agregar veterinario:
    node setup.js add-vet "Nombre Completo" "+584141234567" "[especialidad]"

  Listar veterinarios:
    node setup.js list-vets

  Desactivar veterinario:
    node setup.js del-vet <slug>

EJEMPLOS:

  node setup.js add-vet "Dra. Ana Rivas" "+584141234567" "Medicina General"
  node setup.js add-vet "Dr. Carlos López" "+584129876543" "Cirugía Veterinaria"
  node setup.js list-vets
  node setup.js del-vet dra-ana-rivas

VARIABLES DE ENTORNO:
  DB_PATH=/ruta/a/agenda.db    (por defecto: ./agenda.db)

`);
}
