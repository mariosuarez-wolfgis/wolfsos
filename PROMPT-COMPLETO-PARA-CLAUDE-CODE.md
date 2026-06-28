# PROMPT COMPLETO: Sistema de Agenda Veterinaria para Mi Gente Ve

---

## CONTEXTO DE EMERGENCIA Y PROPÓSITO

### Situación actual
Venezuela acaba de sufrir un terremoto. Las comunidades de rescate y cuidado animal están bajo presión máxima. **Mi Gente Ve** (https://migenteve.com) es una organización que rescata y cuida animales; sus voluntarios veterinarios atienden por telemedicina, pero no tienen forma eficiente de agendar llamadas. Todo es ad-hoc por WhatsApp.

### Quién somos (Wolfgis)
Somos un equipo técnico que ha estado desarrollando **Wolfmedic**, un software médico para gestionar consultas y datos sanitarios. Queremos aplicar esa experiencia aquí: ayudar en emergencia, pero también demostrar nuestra capacidad de construir soluciones rápidas, funcionales y escalables.

### Por qué hacemos esto
- **Emergencia:** Sin agenda eficiente, los tutores no pueden agendar, los vets pierden horas en WhatsApp, los animales no reciben atención oportuna.
- **Oportunidad:** Mostrar que Wolfgis no solo hace software empresarial; también construye para comunidades.
- **Beneficio mutuo:** 
  - Mi Gente Ve obtiene un sistema profesional, gratuito, escalable.
  - Wolfgis demuestra expertise en telemedicina (útil cuando presentamos Wolfmedic).
  - Si el sistema funciona bien, es un case study: "De emergencia a producción en 72 horas".
  - Posible colaboración futura: Mi Gente Ve podría usar Wolfmedic para gestión interna.

---

## PROBLEMA A RESOLVER

### Estado actual (ineficiente)
- Tutor llama a coordinador por WhatsApp: "Mi perro tiene síntomas"
- Coordinador busca veterinario disponible (manual, caótico)
- Acuerdan hora por chat (se olvidan, se superponen)
- No hay registro de citas pasadas
- Veterinarios no pueden fijar su horario de antemano

### Solución que entreguemos
Un sistema de **3 piezas**:

1. **Widget público** (`agenda.html`): Tutor elige veterinario, día, hora, deja sus datos. Recibe cita + enlace WhatsApp + archivo para calendario.
2. **Panel veterinario** (`admin.html`): Vet fija su horario semanal (hasta 2 rangos por día), bloquea ausencias, ve sus citas.
3. **API backend** (Node.js + Express): Genera huecos, previene doble reserva, maneja zonas horarias (America/Caracas).

### Impacto esperado
- Reduce fricción: tutor → reserva en 2 min (en lugar de múltiples mensajes)
- Profesionalización: registro de citas, historial, análisis
- Escalabilidad: de 1 vet a 10+ sin caos
- Trazabilidad: para Mi Gente Ve, para emergencias, para el caso study de Wolfgis

---

## ARQUITECTURA Y CÓDIGO

### Stack elegido
- **Backend:** Node.js 22 (integra SQLite nativo, sin compilación)
- **BD:** SQLite para MVP (fácil deploy, 0 dependencias); portable a Postgres
- **Frontend:** HTML/JS vanilla (sin frameworks, funciona en cualquier navegador)
- **Seguridad:** Token por now, login real después
- **Timezone:** America/Caracas (UTC−4)

### Archivos principales

```
src/
  ├─ slots.js      [⭐ CORAZÓN] Generador de huecos disponibles
  │              (hora local → UTC, respeta ausencias, lead time, doble reserva)
  │              (Independent de BD, portable a PHP/Python)
  ├─ db.js         Capa de datos (SQLite ahora; Postgres después)
  ├─ server.js     API REST: endpoints públicos y admin
  └─ format.js     Armado de .ics (calendario) y WhatsApp

public/
  ├─ agenda.html   Widget para tutor (350 líneas, 3 pasos, vanilla JS)
  └─ admin.html    Panel veterinario (200 líneas, edita horario + ve citas)
```

### Cómo funciona (flujo de una reserva)

```
[Tutor]
  ↓ abre agenda.html
  ↓ elige veterinario → GET /api/vets/:slug/slots
  ↓ visualiza huecos disponibles (generados por slots.js)
  ↓ elige día/hora → POST /api/bookings
  ↓
[Backend: API/BD]
  ↓ valida que el hueco existe y no está reservado
  ↓ intenta INSERT en appointments
  ↓ si hay colisión: UNIQUE INDEX falla → HTTP 409
  ↓ si éxito: cita creada, devuelve enlaces
  ↓
[Tutor]
  ↓ recibe confirmación
  ↓ botón "Descargar calendario" → .ics (RFC 5545)
  ↓ botón "Confirmar por WhatsApp" → wa.me/numero-vet?text=mensaje-prellenado
```

### Lógica crítica: Generación de huecos

En `slots.js`:
1. Lee horario semanal del vet (ej. Lun-Vie 09:00-12:00, 15:00-18:00) → **en hora local**
2. Para cada día en el horizonte (7 días default):
   - Convierte la hora local a UTC (respetando timezone de la fecha para DST)
   - Genera huecos de 30 min (configurable)
   - Excluye: lead time (mínimo 2h antelación), ausencias, citas ya reservadas
3. Devuelve array de `{startMs, endMs, startIso, endIso, localTime}`

**Por qué esto es importante:** Es portable a PHP/Python/Supabase sin tocar el rest del código.

### Prevención de doble reserva

```sql
CREATE UNIQUE INDEX ux_booked_slot
  ON appointments(vet_id, start_ms) WHERE status = 'booked';
```

Si dos usuarios POST el mismo hueco en simultáneo:
- INSERT 1 gana
- INSERT 2 falla con UNIQUE violation
- API atrapa error → HTTP 409 "ese horario fue tomado, elige otro"
- **Robusto:** A nivel de BD, no de aplicación.

---

## VARIABLES DE ENTORNO Y CONFIGURACIÓN

```bash
# Obligatoria
ADMIN_TOKEN=un-token-largo-aleatorio

# Opcionales (con defaults)
PORT=3000
DB_PATH=agenda.db
CORS_ORIGIN=https://migenteve.com
COORD_WHATSAPP=+584141234567
```

---

## API: CONTRATO PÚBLICO

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/vets` | Lista de veterinarios activos |
| GET | `/api/vets/:slug` | Datos de un vet |
| GET | `/api/vets/:slug/slots?days=7` | Huecos disponibles (7 días) |
| POST | `/api/bookings` | Crear una cita |
| GET | `/api/bookings/:id/ics` | Descargar .ics |

### POST /api/bookings (ejemplo)

**Request:**
```json
{
  "vetSlug": "dra-rivas",
  "startIso": "2026-06-29T13:00:00Z",
  "modality": "video",
  "tutorName": "María",
  "tutorWhatsapp": "+584141234567",
  "animalName": "Toby",
  "species": "Perro",
  "urgency": "Moderado",
  "symptoms": "Vómitos desde ayer"
}
```

**Response (201 Created):**
```json
{
  "id": 1,
  "vet": "Dra. Ana Rivas",
  "whenLocal": "lunes 29 de junio, 09:00",
  "timezone": "America/Caracas",
  "modality": "Videollamada",
  "whatsappLink": "https://wa.me/584141234567?text=...",
  "icsUrl": "/api/bookings/1/ics"
}
```

**Error (409 Conflict):**
```json
{
  "error": "Ese horario ya fue reservado. Elige otro."
}
```

---

## API: ADMINISTRACIÓN (token requerido)

Header: `x-admin-token: {ADMIN_TOKEN}`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/admin/vets/:slug/availability` | Leer horario semanal |
| PUT | `/api/admin/vets/:slug/availability` | Reemplazar horario |
| POST | `/api/admin/vets/:slug/time-off` | Bloquear ausencia |
| GET | `/api/admin/vets/:slug/appointments` | Ver próximas citas |

### PUT /api/admin/vets/:slug/availability (ejemplo)

**Request:**
```json
{
  "rules": [
    { "weekday": 1, "startMin": 540, "endMin": 720 },    // Lun 09:00-12:00
    { "weekday": 1, "startMin": 900, "endMin": 1080 },   // Lun 15:00-18:00
    { "weekday": 2, "startMin": 540, "endMin": 720 }     // Mar 09:00-12:00
  ]
}
```

Nota: `weekday` es ISO (1=lunes ... 7=domingo), minutos desde medianoche en **hora local del vet**.

---

## DECISIONES TÉCNICAS Y POR QUÉ

| Decisión | Razonamiento | Alternativa |
|----------|--------------|-------------|
| **SQLite ahora** | MVP rápido, 0 dependencias, integrado Node 22 | Postgres en producción (script de migración fácil) |
| **Node.js** | JavaScript en backend y frontend, equipo conoce | PHP, Python |
| **Token compartido** | Rápido; funciona para coordinación | Login real después (JWT por vet) |
| **Huecos on-demand** | No cachea; siempre frescos | Cache con invalidación (para >100 vets) |
| **Índice único BD** | Previene doble reserva a nivel de BD | Validación en app (menos robusto) |
| **Hora local en reglas** | Como piensan los vets ("09:00 en mi zona") | Almacenar en UTC (requiere conversión inversa) |
| **RFC 5545 (.ics)** | Estándar; abre en cualquier calendario | JSON (menos compatible) |
| **Vanilla JS frontend** | Sin dependencias, funciona en cualquier navegador | React, Vue (overhead innecesario para MVP) |

---

## PRÓXIMOS PASOS RECOMENDADOS (después de MVP)

### Semana 1 (Post-emergencia inmediata)
1. **Cableado del triaje actual:** El formulario de "Solicitar orientación" que ya existe en migenteve.com debería poder enviar datos al widget (urgency, symptoms).
2. **Datos reales:** Crear los veterinarios de Mi Gente Ve en la BD (nombre, zona horaria, WhatsApp, horarios).
3. **Testing en producción:** Validar con usuarios reales.

### Semana 2–3
1. **Recordatorios automáticos:** WhatsApp 24h antes de la cita (Twilio).
2. **Historial:** Ver citas pasadas, marcar como realizada/no-show.
3. **Dashboard:** Métricas para Mi Gente Ve (citas/week, vet con más demanda, etc.).

### Mes 2
1. **Autenticación real:** Login por veterinario (no token compartido).
2. **Escalabilidad:** Postgres en producción, caché de huecos.
3. **Integración Wolfmedic:** Mi Gente Ve podría usar Wolfmedic para ficha médica del animal (complementario).

---

## BENEFICIO MUTUO: WOLFGIS Y MI GENTE VE

### Para Mi Gente Ve
✅ Sistema profesional, gratuito, escalable  
✅ Reducción de fricción en atención  
✅ Registro y trazabilidad (importante en emergencia)  
✅ Posible integración con Wolfmedic para ficha médica  

### Para Wolfgis
✅ **Case study en emergencia:** "De problema a solución en 72 horas"  
✅ **Demo vivo de capacidad técnica:** Cuando presentemos Wolfmedic a clientes médicos, es un ejemplo real  
✅ **Visibilidad:** Mi Gente Ve es conocida en Venezuela; el crédito nos ayuda  
✅ **Aprendizaje:** Real-world telemedicina; feedback valioso para Wolfmedic  
✅ **Colaboración futura:** Mi Gente Ve podría ser un early adopter de Wolfmedic  
✅ **Propósito:** Demuestra que Wolfgis no solo vende; también construye para comunidades en crisis  

### Cómo comunicarlo
- En tu web: "Wolfgis apoya la emergencia veterinaria de Venezuela"
- Con Mi Gente Ve: "Construida por Wolfgis, el equipo detrás de Wolfmedic"
- En presentaciones: "Mientras ayudamos, también demostramos..."

---

## QUÉ VAS A ENCONTRAR EN EL CÓDIGO

### src/slots.js (~100 líneas)
La pieza más importante. Genera huecos respetando:
- Horario local del vet (weekday + startMin/endMin)
- Conversión a UTC (con zona horaria)
- Lead time (mínima antelación)
- Ausencias puntuales
- Citas ya reservadas
- Resultado: array de huecos disponibles

**Esto es lo que necesitas replicar si portas a PHP/Python.**

### src/db.js (~120 líneas)
- Esquema SQLite: vets, availability_rules, time_off, appointments
- Índice único en (vet_id, start_ms) para prevenir doble reserva
- CRUD: crear vet, leer reglas, insertar cita, etc.
- Seed: crea "dra-rivas" de ejemplo

**Reemplazable por Postgres sin tocar server.js ni slots.js.**

### src/server.js (~150 líneas)
- Express: setup, middleware CORS
- Endpoints públicos: GET /api/vets, GET /api/vets/:slug/slots, POST /api/bookings
- Endpoints admin: GET/PUT availability, POST time-off, GET appointments
- Manejo de errores: 409 (hueco tomado), 401 (token), 404 (vet no existe)

### src/format.js (~35 líneas)
- buildIcs(appt, vet): RFC 5545, compatible calendarios
- buildWhatsappLink(appt, vet): Mensaje prellenado, dirigido al número del vet

### public/agenda.html (~350 líneas)
- Widget: paso 1 (elige vet), paso 2 (elige día/hora), paso 3 (datos)
- Validación: nombre, WhatsApp, modalidad obligatorios
- Confirmación: muestra enlaces descargables
- Sin dependencias externas, vanilla JS

### public/admin.html (~200 líneas)
- Panel: entra con token + slug
- Edita grilla semanal (hasta 2 rangos por día)
- Bloquea ausencias (fecha-hora con rango)
- Ve próximas citas

---

## INSTRUCCIONES PARA EJECUTAR (ahora mismo)

```bash
# 1. Descomprime (si descargaste .tar.gz)
tar -xzf agenda-vet-migenteve.tar.gz
cd agenda-vet

# 2. Instala dependencias
npm install

# 3. Arranca servidor
ADMIN_TOKEN=secreto123 node src/server.js

# 4. En otro terminal, prueba
curl localhost:3000/api/vets

# 5. Abre en navegador
# Tutor:      http://localhost:3000/agenda.html
# Veterinario: http://localhost:3000/admin.html  
#              (token: secreto123, slug: dra-rivas)
```

---

## PROBLEMAS Y SOLUCIONES (rápido)

| Problema | Causa | Solución |
|----------|-------|----------|
| Node no reconoce `sqlite` | BD corrupta | `rm agenda.db && npm start` |
| CORS error en iframe | Dominio restringido | `CORS_ORIGIN=https://tu-dominio.com` |
| Horas mal | Zona horaria | Verificar `timezone` en veterinario (por defecto America/Caracas) |
| No puedo crear cita | Hueco fuera de horario | Editar horario en admin.html y guardar |

---

## CÓMO INTEGRARLO EN MIGENTEVE.COM

Opción más rápida (sin tocar tu web mucho):

```html
<!-- En la sección "Atención virtual" de tu web -->
<iframe
  src="https://agenda.migenteve.com/agenda.html?api=https://agenda.migenteve.com"
  style="width:100%;max-width:600px;height:900px;border:0"
  title="Agendar consulta veterinaria"></iframe>
```

El parámetro `?api=` le indica dónde está el backend. Puede ser:
- `https://agenda.migenteve.com` (mismo dominio)
- `https://api.migenteve.com` (subdominio aparte)
- Cualquier URL que sirva la API

---

## PRÓXIMAS MEJORAS QUE PODRÍAMOS HACER (opcionalmente)

1. **Recordatorios:** WhatsApp al tutor 24h antes (Twilio)
2. **Dashboard:** Mi Gente Ve ve estadísticas (citas/semana, vet con más demanda, etc.)
3. **Login real:** Cada vet con su contraseña (no token compartido)
4. **Migración Postgres:** Para producción y escala
5. **Integración Wolfmedic:** Ficha médica del animal en el mismo sistema
6. **Exportar datos:** CSV de citas para auditoría

---

## ARQUITECTURA DE ARCHIVOS (lo que hay en el .tar.gz)

```
agenda-vet/
├── src/
│   ├── server.js     ← Arranca aquí (npm start)
│   ├── db.js         ← Esquema, CRUD, seed
│   ├── slots.js      ← Generador de huecos
│   └── format.js     ← .ics y WhatsApp
├── public/
│   ├── agenda.html   ← Widget (abre en navegador)
│   └── admin.html    ← Panel admin (abre en navegador)
├── package.json      ← Dependencias (express, luxon)
├── package-lock.json
├── .env.example      ← Variables de entorno
└── README.md         ← Docs técnicas

Y se genera automáticamente:
├── agenda.db         ← SQLite (creada al primer arranque)
└── node_modules/     ← (npm install)
```

---

## MODELO DE DATOS (si necesitas replicar en otra BD)

```sql
-- Veterinarios
CREATE TABLE vets (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  specialty TEXT,
  timezone TEXT DEFAULT 'America/Caracas',
  slot_minutes INTEGER DEFAULT 30,
  lead_minutes INTEGER DEFAULT 120,
  horizon_days INTEGER DEFAULT 7,
  modalities TEXT DEFAULT 'video,audio,whatsapp',
  whatsapp TEXT,
  active INTEGER DEFAULT 1
);

-- Horario semanal
CREATE TABLE availability_rules (
  id INTEGER PRIMARY KEY,
  vet_id INTEGER REFERENCES vets(id),
  weekday INTEGER,        -- 1=lunes ... 7=domingo
  start_min INTEGER,      -- minutos desde medianoche (hora local)
  end_min INTEGER
);

-- Ausencias puntuales
CREATE TABLE time_off (
  id INTEGER PRIMARY KEY,
  vet_id INTEGER REFERENCES vets(id),
  start_ms INTEGER,       -- UTC epoch miliseconds
  end_ms INTEGER,
  reason TEXT
);

-- Citas
CREATE TABLE appointments (
  id INTEGER PRIMARY KEY,
  vet_id INTEGER REFERENCES vets(id),
  start_ms INTEGER,
  end_ms INTEGER,
  status TEXT DEFAULT 'booked',   -- booked|cancelled|done
  modality TEXT,
  tutor_name TEXT,
  tutor_whatsapp TEXT,
  animal_name TEXT,
  species TEXT,
  urgency TEXT,
  symptoms TEXT,
  created_ms INTEGER
);

-- Prevención de doble reserva (CRÍTICO)
CREATE UNIQUE INDEX ux_booked_slot
  ON appointments(vet_id, start_ms) WHERE status = 'booked';
```

---

## CÓMO LO PRESENTA WOLFGIS

Sugerir esto cuando hables públicamente:

> "Ante la emergencia veterinaria causada por el terremoto en Venezuela, 
> Wolfgis desarrolló en 72 horas un sistema de agenda de telemedicina para 
> Mi Gente Ve. Es proof-of-concept de cómo Wolfmedic puede gestionar citas 
> médicas (en este caso, veterinarias, pero aplicable a medicina humana).
> 
> Sistema: Node.js + Express + SQLite (MVP → Postgres en escala)
> Resultado: 3 componentes (API, widget tutor, panel vet) + doble reserva 
> imposible + timezonas correctas + .ics para calendarios.
> 
> Aprendizajes aplicables a Wolfmedic: telemedicina real, integración con 
> WhatsApp, prevención de conflictos de horario."

---

## AHORA, EN CLAUDE CODE:

Te paso el código completo en los próximos mensajes. Lo que quiero que hagas:

1. **Lee y entiende la arquitectura:** Especialmente `src/slots.js` (lo único verdaderamente difícil).
2. **Arranca localmente:** `npm install && ADMIN_TOKEN=secreto123 node src/server.js`
3. **Testea los flujos:**
   - Entra a agenda.html como tutor → elige vet → reserva hueco
   - Entra a admin.html como vet → edita horario → ve que los huecos cambian
   - Intenta doble reserva (debe dar 409)
4. **Sugiere mejoras:** ¿Qué cambios te gustaría para Mi Gente Ve? ¿Para que Wolfgis se vea mejor?
5. **Implementa:** Si hay algo urgente (recordatorios, login, métricas), dime y lo hacemos.

**Eso es. El resto del código está listo, testeado, y funciona. 🚀**

---

## ARCHIVOS QUE NECESITARÁS TENER:

**src/server.js** — Código principal, API REST
**src/db.js** — Base de datos, esquema, CRUD
**src/slots.js** — Generador de huecos (lo más importante)
**src/format.js** — Formatos (.ics, WhatsApp)
**public/agenda.html** — Widget para tutor
**public/admin.html** — Panel para veterinario
**package.json** — Dependencias (express, luxon)

Los pego a continuación para que los copies a tus archivos. 👇
