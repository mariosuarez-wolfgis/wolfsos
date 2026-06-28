# 🐾 Wolf SOS — Sistema de Agenda Veterinaria de Telemedicina

**Sistema de citas online para Mi Gente Ve**  
Construido con Node.js 22 + SQLite (MVP) → Postgres (producción)

---

## 🚀 Inicio rápido (Hoy, localmente)

### 1. Instalar
```bash
npm install
```

### 2. Agregar veterinarios
```bash
node setup.js add-vet "Dra. Ana Rivas" "+584141234567" "Medicina General"
node setup.js add-vet "Dr. Carlos López" "+584129876543" "Cirugía"
node setup.js list-vets
```

### 3. Arrancar servidor
```bash
ADMIN_TOKEN=tu-token-secreto node src/server.js
```

Verás:
```
🐾 Wolf SOS Agenda Veterinaria
   Servidor: http://localhost:3000
   Tutor:    http://localhost:3000/agenda.html
   Admin:    http://localhost:3000/admin.html
```

### 4. Acceder
- **Tutores (público):** `http://localhost:3000/agenda.html`
- **Veterinarios (admin):** `http://localhost:3000/admin.html`
  - Slug: ej. `dra-ana-rivas`
  - Token: `tu-token-secreto`

---

## 📱 Flujos de uso

### Tutor (Mi Gente Ve)
1. Abre `agenda.html`
2. Elige veterinario
3. Elige día/hora disponible
4. Ingresa datos: nombre, WhatsApp, mascota, síntomas
5. Recibe enlace WhatsApp + archivo `.ics` para calendario

### Veterinario
1. Abre `admin.html`
2. Panel "Horario": Edita tu semana (hasta 2 rangos/día)
3. Panel "Ausencias": Bloquea vacaciones, emergencias
4. Panel "Mis citas": Ve próximas citas, contacta tutores por WhatsApp

---

## 🌐 Desplegar a producción (hoy)

### Opción 1: Render.com (más fácil, gratis 1 mes)
```bash
# 1. Crea cuenta en render.com
# 2. New → Web Service → Connect GitHub (o upload repo)
# 3. Build command: npm install
# 4. Start command: ADMIN_TOKEN=$ADMIN_TOKEN node src/server.js
# 5. Env vars:
#    ADMIN_TOKEN=algo-secreto
#    PORT=3000
#    CORS_ORIGIN=https://tu-dominio.com
```

### Opción 2: Tu servidor (VPS, cPanel, etc.)
```bash
# SSH a tu servidor
scp -r ./. usuario@servidor:/var/www/wolf-sos

ssh usuario@servidor
cd /var/www/wolf-sos
npm install
ADMIN_TOKEN=secreto123 npm start

# O con systemd (permanente):
sudo nano /etc/systemd/system/wolf-sos.service
```

**Ejemplo systemd:**
```ini
[Unit]
Description=Wolf SOS Veterinary Scheduler
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/wolf-sos
Environment="ADMIN_TOKEN=algo-muy-secreto"
Environment="PORT=3000"
Environment="CORS_ORIGIN=https://tu-dominio.com"
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable wolf-sos
sudo systemctl start wolf-sos
sudo systemctl status wolf-sos
```

---

## 🔗 Integración con Mi Gente Ve

### Opción A: iframe en tu web (recomendado)
```html
<!-- En migenteve.com/servicios o donde quieras -->
<iframe
  src="https://agenda.tu-dominio.com/agenda.html"
  style="width:100%;max-width:600px;height:900px;border:0;border-radius:10px"
  title="Agendar consulta veterinaria"
  allow="geolocation">
</iframe>
```

### Opción B: API REST
Tus sistemas pueden crear citas directamente:
```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "vetSlug": "dra-ana-rivas",
    "startIso": "2026-06-29T13:00:00Z",
    "modality": "video",
    "tutorName": "María",
    "tutorWhatsapp": "+584141234567",
    "animalName": "Toby",
    "species": "Perro",
    "urgency": "Moderado",
    "symptoms": "Vómitos"
  }'
```

### Opción C: Webhook entrante
Si tienes un formulario en migenteve.com, puede enviar datos aquí automáticamente.

---

## 📊 API Pública (sin autenticación)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/vets` | Lista de veterinarios activos |
| GET | `/api/vets/:slug` | Datos de un vet |
| GET | `/api/vets/:slug/slots?days=7` | Huecos disponibles (7 días) |
| POST | `/api/bookings` | Crear una cita |
| GET | `/api/bookings/:id/ics` | Descargar .ics (RFC 5545) |

## 🔐 API Admin (requiere token)

Header: `x-admin-token: TU_TOKEN`

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/vets/:slug/availability` | Leer horario semanal |
| PUT | `/api/admin/vets/:slug/availability` | Reemplazar horario |
| POST | `/api/admin/vets/:slug/time-off` | Bloquear ausencia |
| GET | `/api/admin/vets/:slug/appointments` | Ver citas próximas |

---

## 🛠️ Variables de entorno

```bash
ADMIN_TOKEN=algo-muy-secreto     # ⚠️ Obligatorio
PORT=3000                         # (default)
DB_PATH=agenda.db                 # (default)
CORS_ORIGIN=https://migenteve.com # (default: *)
```

---

## 📁 Estructura del proyecto

```
.
├── src/
│   ├── server.js       ← API REST + endpoints
│   ├── db.js           ← Esquema SQLite + CRUD
│   ├── slots.js        ← Generador de huecos (core logic)
│   └── format.js       ← .ics + WhatsApp
├── public/
│   ├── agenda.html     ← Widget para tutores
│   └── admin.html      ← Panel para veterinarios
├── setup.js            ← CLI para agregar vets
├── package.json
└── README.md           ← este archivo
```

---

## ❓ Preguntas frecuentes

### ¿Cómo cambio el token admin?
```bash
ADMIN_TOKEN=nuevo-token-secreto node src/server.js
```

### ¿Cómo edito el horario de un vet?
1. Abre `admin.html`
2. Entra con el slug del vet y el token
3. Panel "Horario" → modifica los rangos → "Guardar horario"

### ¿Qué pasa si se cae el servidor?
- SQLite se guarda automáticamente
- Si hay citas guardadas, no se pierden
- Solo necesitas volver a arrancar

### ¿Puedo pasar a Postgres en producción?
Sí, reemplaza `src/db.js` con conexión Postgres. La API no cambia.

### ¿Cómo backupeo la BD?
```bash
cp agenda.db agenda.db.backup
```

---

## 🐛 Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| `EADDRINUSE 3000` | Puerto ocupado | `lsof -i :3000` y matar proceso, o usar otro PORT |
| Admin.html: "Failed to parse URL" | API no detectada | Asegúrate de usar `http://localhost:3000/admin.html` |
| Slots vacíos | Veterinario sin horario | Edita horario en admin.html |
| Doble reserva permitida | Raro (no debería pasar) | Reinicia servidor, verifica UNIQUE INDEX en BD |

---

## 📞 Soporte

**Email:** engineering@wolfgis.tech  
**Docs técnicas:** [PROMPT-COMPLETO-PARA-CLAUDE-CODE.md](PROMPT-COMPLETO-PARA-CLAUDE-CODE.md)

---

**Wolf SOS** © 2026 Wolfgis — Construido para Mi Gente Ve en emergencia veterinaria. 🐾
