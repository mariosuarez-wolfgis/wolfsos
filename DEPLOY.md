# 🚀 Deploy a Producción — HOY

**Para que Mi Gente Ve acceda en 30 minutos**

---

## Plan A: Render.com (✅ RECOMENDADO — gratis, automático)

### Paso 1: Preparar en GitHub (2 min)

```bash
cd /ruta/a/wolf-sos
git init
git add .
git commit -m "🐾 Wolf SOS v1.0 — Sistema de agenda veterinaria"
git remote add origin https://github.com/tu-usuario/wolf-sos.git
git push -u origin main
```

### Paso 2: Render.com (5 min)

1. Ve a **https://dashboard.render.com**
2. Sign up (si no tienes cuenta)
3. Click **New** → **Web Service**
4. Conecta tu repo de GitHub
5. Llena el formulario:
   - **Name:** `wolf-sos`
   - **Build Command:** `npm install`
   - **Start Command:** `node src/server.js`
   - **Environment:** Node 22

### Paso 3: Variables de entorno (1 min)

En Render, ve a **Environment** y agrega:

```
ADMIN_TOKEN=tu-token-secreto-muy-largo-ej-abcd1234efgh5678ijkl9012
CORS_ORIGIN=https://migenteve.com
PORT=3000
```

**Copia el token a un lugar seguro** (lo necesitarán los vets para loguearse)

### Paso 4: Deploy (esperando 2-3 min)

Render automaticamente:
1. Clona tu repo
2. Ejecuta `npm install`
3. Arranca el servidor
4. Te da una URL: `https://wolf-sos-xxxxx.onrender.com`

**Tu sistema estará en:** `https://wolf-sos-xxxxx.onrender.com/agenda.html`

---

## Plan B: Tu propio servidor

Si tienes VPS / cPanel / servidor propio:

### SSH al servidor:
```bash
ssh usuario@tu-servidor.com
cd /var/www
git clone https://github.com/tu-usuario/wolf-sos.git
cd wolf-sos
npm install
```

### Crear `.env`:
```bash
nano .env
```

Pega:
```
ADMIN_TOKEN=tu-token-secreto-muy-largo
CORS_ORIGIN=https://tu-dominio.com
PORT=3000
```

### Arrancar (con systemd, permanente):

```bash
sudo nano /etc/systemd/system/wolf-sos.service
```

Pega:
```ini
[Unit]
Description=Wolf SOS Veterinary Scheduler
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/wolf-sos
EnvironmentFile=/var/www/wolf-sos/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Luego:
```bash
sudo systemctl daemon-reload
sudo systemctl enable wolf-sos
sudo systemctl start wolf-sos
sudo systemctl status wolf-sos
```

Tu URL será: `https://tu-dominio.com/agenda.html` (si tienes Nginx/Apache apuntando ahí)

---

## Paso 5: Agregar veterinarios

Desde tu máquina local:

```bash
node setup.js add-vet "Dra. Ana Rivas" "+584141234567" "Medicina General"
node setup.js add-vet "Dr. Carlos López" "+584129876543" "Cirugía"
node setup.js list-vets
```

**O manualmente en producción:**

Si tu servidor no tiene acceso directo, crea una ruta admin para agregar vets:

```bash
ssh usuario@tu-servidor
cd /var/www/wolf-sos
node setup.js add-vet "Nombre" "+584141234567"
```

---

## Paso 6: Verificar

### ✅ ¿Está arriba?

```bash
curl https://wolf-sos-xxxxx.onrender.com/api/vets
```

Debería devolver JSON con los veterinarios.

### ✅ ¿Ves el widget?

```
https://wolf-sos-xxxxx.onrender.com/agenda.html
```

Debería mostrar la lista de vets.

### ✅ ¿Funciona el panel admin?

```
https://wolf-sos-xxxxx.onrender.com/admin.html
```

Entra con:
- Slug: `dra-ana-rivas` (o el que creaste)
- Token: `tu-token-secreto`

---

## Paso 7: Integrar en migenteve.com

En tu web, agrega el iframe:

```html
<iframe
  src="https://wolf-sos-xxxxx.onrender.com/agenda.html"
  style="width:100%;max-width:600px;height:900px;border:none;border-radius:12px"
  title="Wolf SOS — Agendar consulta">
</iframe>
```

---

## 🔐 Seguridad antes de ir a prod

**Checklist:**

- [ ] Token es algo como: `abcd1234efgh5678ijkl9012mnop3456` (>30 chars)
- [ ] `CORS_ORIGIN` está configurado a tu dominio (no `*`)
- [ ] HTTPS activo (certificado SSL)
- [ ] Backups automáticos de la BD configurados
- [ ] Logs monitoreados

---

## 📞 Para los veterinarios

Comparte esto con cada vet:

```
🐾 Tu panel de administración está listo:

🔗 URL: https://wolf-sos-xxxxx.onrender.com/admin.html
👤 Tu slug: dra-ana-rivas
🔐 Token: [el token que tu admin te dió]

PASOS:
1. Abre el URL arriba
2. Ingresa slug + token
3. Ve a panel "Horario" y configura tu disponibilidad
4. Ve a "Mis citas" para ver reservas

Si tienen dudas, responde: "¿Ves la pantalla de login?"
```

---

## 🚨 En caso de emergencia

### El servidor no arranca

```bash
# Ver logs
journalctl -u wolf-sos -f

# O en Render, ve a Logs tab
```

### Muchas citas perdidas

```bash
# Backup:
cp agenda.db agenda.db.backup-2026-06-28
```

### Necesito cambiar algo rápido

```bash
# No edites en producción
# Editá localmente, git commit, git push
# Render automaticamente redeploy
```

---

## 📊 Próximo (después que esté estable)

- [ ] Recordatorios WhatsApp (Twilio)
- [ ] Dashboard Mi Gente Ve (estadísticas)
- [ ] Login real (contraseñas por vet)
- [ ] Migración a Postgres

---

**¿Listo?** Avísame cuando esté en el aire. 🚀
