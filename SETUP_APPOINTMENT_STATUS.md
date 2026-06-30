# Setup: Appointment Status & Analytics System

Este documento explica cómo configurar el nuevo sistema de estados de citas y dashboard de analytics.

## 🚀 Instalación

### 1. Ejecutar Migración SQL (Supabase)

1. Ve a [Supabase Console](https://app.supabase.com)
2. Selecciona tu proyecto `wolfsos`
3. Abre **SQL Editor**
4. Copia y pega el contenido de `migrations/001_add_appointment_status.sql`
5. Click en **Run** (o Ctrl+Enter)

**Resultado esperado:** Se agregan 6 columnas nuevas a la tabla `appointments` y se crean 3 índices.

### 2. Deploy Backend (Render)

Los cambios en `src/db.js` y `src/server.js` ya están en GitHub.

Simplemente haz push:
```bash
git push origin main
```

Render se redeplegará automáticamente. Espera 2-3 minutos.

### 3. Frontend (Ya incluido)

Los cambios en `public/admin.html` ya están listos. Solo recarga la página.

---

## 📋 Características

### Para Veterinarios (Vet Panel)

En la pestaña **"Mis Citas"**:

1. **Ver Stats**
   - Pendientes (⏳)
   - Atendidas (✅)
   - No asistieron (❌)
   - Canceladas (🚫)

2. **Filtrar Citas**
   - Por estado
   - Botones: Pendientes, Atendidas, No asistieron, Canceladas, Ver todas

3. **Cambiar Estado**
   - Click en "Cambiar estado"
   - Seleccionar: Atendida (default), No asistió, Cancelada
   - Agregar motivo (opcional)

**Estados disponibles:**
- `booked` - Pendiente (default)
- `attended` - Atendida ✅
- `no_show` - No asistió ❌
- `cancelled` - Cancelada 🚫

### Para Admin (Admin Dashboard)

En la pestaña **"Analytics"**:

1. **Stats Generales**
   - Total de citas atendidas
   - Total no asistencias
   - Total cancelaciones
   - % de asistencia

2. **Desempeño por Doctor**
   - Tabla con cada doctor
   - Citas atendidas por cada uno
   - Tasa de no-show
   - % de asistencia (rojo/naranja/verde)

3. **Alertas**
   - 🔴 **Críticas**: Doctores con alta tasa de no-show
   - 🟠 **Advertencias**: Doctores con baja actividad (<5 citas/semana)

4. **Rango de Fechas**
   - Por defecto: últimos 30 días
   - Personalizable con date pickers

---

## 🔌 Endpoints Nuevos

### Para Vets

```
PUT /api/vets/:vetId/appointments/:appointmentId/status
GET /api/vets/:vetId/stats
```

### Para Admin

```
GET /api/admin/stats/summary?from=ms&to=ms
GET /api/admin/stats/by-vet?from=ms&to=ms
GET /api/admin/alerts
```

---

## 📊 Campos Nuevos en `appointments`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `appointment_status` | TEXT | Estado: booked, attended, no_show, cancelled |
| `status_updated_at` | BIGINT | Timestamp de cuándo se cambió el estado |
| `status_updated_by` | UUID | ID del vet que cambió el estado |
| `cancellation_reason` | TEXT | Motivo de cancelación |
| `no_show_reason` | TEXT | Motivo de no-show |
| `vet_notes` | TEXT | Notas del vet sobre la cita |

---

## 🧪 Testing

### Probar como Veterinario

1. Login con credenciales de vet
2. Ve a **"Mis Citas"**
3. Crea una cita desde la página de tutores (agenda.html)
4. Verifica que aparezca en "Pendientes"
5. Click en "Cambiar estado" → "Atendida" → Guardar
6. Verifica que move a "Atendidas"

### Probar como Admin

1. Login como admin
2. Ve a **"Analytics"**
3. Selecciona rango de fechas
4. Click "Cargar"
5. Verifica: stats, tabla de doctores, alertas

---

## 🚨 Troubleshooting

### Stats muestran 0
- Verifica que haya citas creadas
- Asegúrate de que la migración SQL se ejecutó correctamente

### Tab de Analytics no aparece
- Si eres vet, no deberías ver el tab (está oculto)
- Solo aparece si tienes permisos de admin

### Error al cambiar estado
- Verifica que haya hecho login correctamente
- Revisa la consola (F12) para ver el error exacto

---

## 📝 Notas

- El sistema es backward-compatible: citas antiguas aparecen como `booked`
- Los filtros solo muestran citas de los últimos 7 días por defecto
- Analytics muestra últimos 30 días por defecto (personalizable)
- El auto-refresh de citas funciona cada 30 segundos cuando el tab está abierto

---

## 🎯 Próximos Pasos (Opcionales)

1. **Calendario interactivo** - View por día/semana/mes
2. **Notificaciones por email** - Alertas a admin cuando hay no-shows
3. **Exportar reportes** - CSV/PDF de estadísticas
4. **Historial de cambios** - Ver quién cambió qué estado y cuándo

---

**¿Problemas?** Revisa los logs en Render o la consola del navegador (F12).
