# 🔗 Integración de Wolf SOS con Mi Gente Ve

**Guía para conectar el sistema de agenda con tu web (migenteve.com)**

---

## ⚡ Opción rápida: iframe (HOY, sin cambios de código)

Si tu web ya está en `migenteve.com`, agrega esto en la sección donde quieres el formulario de agendar:

```html
<!-- En tu página migenteve.com/servicios o donde sea -->
<section id="agendar-consulta">
  <h2>Agendar consulta veterinaria</h2>
  <p>Elige un veterinario, día y hora disponible</p>
  
  <iframe
    src="https://agenda.tu-dominio.com/agenda.html"
    style="
      width: 100%;
      max-width: 600px;
      height: 900px;
      border: none;
      border-radius: 12px;
      box-shadow: 0 2px 20px rgba(0,0,0,0.08);
      display: block;
      margin: 20px auto;
    "
    title="Wolf SOS — Agendar consulta veterinaria"
    allow="geolocation">
  </iframe>
</section>
```

**Listo.** Los tutores verán el formulario integrado. Las citas se guardan en Wolf SOS automáticamente.

---

## 🔧 Opción 2: API REST (más control)

Si tu código está en Node.js, React, PHP, etc., puedes llamar directo a los endpoints:

### Crear una cita programáticamente

```javascript
// Tu código (ej. un formulario personalizado en tu web)
async function crearCita(datos) {
  const response = await fetch('https://agenda.tu-dominio.com/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vetSlug: 'dra-ana-rivas',           // Slug del vet (ej. dra-ana-rivas)
      startIso: '2026-06-29T13:00:00Z',   // Hora UTC (ej. 09:00 hora Venezuela)
      modality: 'video',                   // video | audio | whatsapp
      tutorName: 'María González',
      tutorWhatsapp: '+584141234567',
      animalName: 'Toby',
      species: 'Perro',                    // Perro | Gato | Ave | Conejo | Otro
      urgency: 'Moderado',                 // Leve | Moderado | Grave | Emergencia
      symptoms: 'Vómitos desde ayer'
    })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Error:', error.error);  // "Ese horario ya fue reservado..."
    return null;
  }

  const booking = await response.json();
  console.log('✅ Cita creada:', booking.id);
  return booking;
}
```

**Response (éxito 201):**
```json
{
  "id": 42,
  "vet": "Dra. Ana Rivas",
  "whenLocal": "lunes 29 de junio, 09:00",
  "timezone": "America/Caracas",
  "modality": "Videollamada",
  "whatsappLink": "https://wa.me/584141234567?text=...",
  "icsUrl": "/api/bookings/42/ics"
}
```

**Response (error 409 - horario ocupado):**
```json
{
  "error": "Ese horario ya fue reservado. Elige otro."
}
```

---

## 📋 Pasos para hoy (urgente)

### 1️⃣ Elegir dónde hospedar Wolf SOS

**Opción A: Render.com (gratis, fácil)**
- Ve a https://render.com
- New → Web Service → Connect GitHub
- Build: `npm install`
- Start: `ADMIN_TOKEN=$ADMIN_TOKEN node src/server.js`
- Variables: `ADMIN_TOKEN=algo-muy-secreto`, `CORS_ORIGIN=https://migenteve.com`
- Tu URL será: `https://wolf-sos-xxxxx.onrender.com`

**Opción B: Tu servidor (VPS, cPanel, etc.)**
```bash
ssh usuario@tu-servidor
cd /var/www
git clone <tu-repo>
cd wolf-sos
npm install
ADMIN_TOKEN=secreto123 npm start  # O usar systemd
```
- Tu URL será: `https://agenda.tu-dominio.com`

### 2️⃣ Agregar veterinarios (desde CLI)

```bash
node setup.js add-vet "Dra. Ana Rivas" "+584141234567" "Medicina General"
node setup.js add-vet "Dr. Carlos López" "+584129876543" "Cirugía"
node setup.js list-vets
```

### 3️⃣ Crear un .env con el token (IMPORTANTE)

```bash
# .env (no subir a GitHub)
ADMIN_TOKEN=algo-muy-secreto-y-largo-que-solo-tu-sabes
PORT=3000
CORS_ORIGIN=https://migenteve.com
```

### 4️⃣ Integrar en migenteve.com

Reemplaza `https://agenda.tu-dominio.com` en el iframe con tu URL real.

### 5️⃣ Verificar

- Abre `https://agenda.tu-dominio.com/agenda.html` → ¿Ves los veterinarios?
- Abre `https://agenda.tu-dominio.com/admin.html` → ¿Puedes loguearte?
- Intenta agendar una cita de prueba → ¿Aparece en el panel admin?

---

## 📊 Importar pacientes (si ya tienes una lista)

### Si tienes un CSV de pacientes:

```csv
nombre,whatsapp,email,mascota,especie
María González,+584141234567,maria@email.com,Toby,Perro
Juan Pérez,+584129876543,juan@email.com,Luna,Gato
```

Puedo crear un script que:
1. Lee el CSV
2. Los carga en una tabla `patients` (opcional)
3. Permite auto-completar datos al agendar

Dime si tienes esto y te lo preparo.

---

## 🔐 Seguridad para producción

### Checklist antes de lanzar:

- [ ] `ADMIN_TOKEN` es algo largo y aleatorio (>20 caracteres)
- [ ] `CORS_ORIGIN` está configurado al dominio correcto (no `*`)
- [ ] Base de datos backed up: `cp agenda.db agenda.db.bak`
- [ ] Certificado HTTPS activado
- [ ] Logs monitoreados (verificar errores)
- [ ] Plan de backup automático (diario)

### Cambiar token después del lanzamiento:

```bash
ADMIN_TOKEN=nuevo-token-super-secreto npm start
```

Los veterinarios deberán re-loguearse con el nuevo token.

---

## 📞 Contactos de veterinarios para setup

Por favor dame esto para Mi Gente Ve:

```
Nombre completo del vet
Número de WhatsApp (con código país +58)
Especialidad (ej. Medicina General, Cirugía, etc.)
Horario preferido (ej. Lun-Vie 09:00-12:00, 15:00-18:00)
Modalidades (video, audio, whatsapp)
```

Con eso ejecuto:
```bash
node setup.js add-vet "Nombre" "+58412..." "[especialidad]"
```

---

## 🐛 Solucionar problemas en integración

| Problema | Solución |
|----------|----------|
| El iframe está en blanco | Verifica que la URL sea correcta y sin typos |
| CORS error en navegador | Agrega la URL de tu web a `CORS_ORIGIN` |
| Las citas no aparecen en admin | Verifica que estés logueado con el token correcto |
| El admin.html no responde | Reinicia el servidor: `npm start` |
| Los slots están vacíos | Edita el horario del vet en el panel admin |

---

## 🚀 Siguiente fase (después de hoy)

Una vez que Wolf SOS esté estable:

1. **Recordatorios:** WhatsApp 24h antes de cita (Twilio)
2. **Dashboard Mi Gente Ve:** Métricas (citas/semana, vet más demandado, etc.)
3. **Integración Wolfmedic:** Ficha médica del animal
4. **Login real:** Cada vet con contraseña propia (no token compartido)
5. **Migrations a Postgres:** Para escala

---

**¿Preguntas?** Contacta a engineering@wolfgis.tech
