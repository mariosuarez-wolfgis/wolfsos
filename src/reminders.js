'use strict';

const cron = require('node-cron');
const db = require('./db');
const emailService = require('./email-service');
const { DateTime } = require('luxon');

// Estado en memoria para recordatorios ya enviados en esta sesión del servidor
// Formato: { appointmentId: { sent1h: boolean, sent15m: boolean } }
const remindersSent = {};

/**
 * Iniciar cron job de recordatorios
 * Se ejecuta cada minuto para chequear citas próximas
 */
function startRemindersCron() {
  console.log('⏰ Iniciando cron job de recordatorios...');

  // Ejecutar cada minuto
  cron.schedule('* * * * *', async () => {
    try {
      await checkAndSendReminders();
    } catch (err) {
      console.error('❌ [REMINDERS CRON] Error:', err.message);
    }
  });

  console.log('✅ Cron job de recordatorios activo');
}

/**
 * Chequear citas próximas y enviar recordatorios
 */
async function checkAndSendReminders() {
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;
  const fifteenMinMs = 15 * 60 * 1000;

  // Buscar citas en los próximos 65 minutos (para atrapar tanto 1h como 15min)
  const upcomingMs = now + oneHourMs + 5 * 60 * 1000; // +5 min buffer

  try {
    const appts = await db.getUpcomingAppointments(now, upcomingMs);

    for (const appt of appts) {
      const timeUntilStart = appt.start_ms - now;

      // Recordatorio 1 hora antes
      if (timeUntilStart <= oneHourMs && timeUntilStart > oneHourMs - 60000) {
        await sendReminderIfNotSent(appt, '1h');
      }

      // Recordatorio 15 minutos antes
      if (timeUntilStart <= fifteenMinMs && timeUntilStart > fifteenMinMs - 60000) {
        await sendReminderIfNotSent(appt, '15m');
      }
    }
  } catch (err) {
    console.error('❌ [REMINDERS] Error chequeando citas:', err.message);
  }
}

/**
 * Enviar recordatorio si aún no se ha enviado
 */
async function sendReminderIfNotSent(appointment, minutesBefore) {
  const apptId = appointment.id;
  const key = minutesBefore === '1h' ? 'sent1h' : 'sent15m';

  // Chequear si ya se envió en esta sesión del servidor
  if (!remindersSent[apptId]) {
    remindersSent[apptId] = { sent1h: false, sent15m: false };
  }

  if (remindersSent[apptId][key]) {
    return; // Ya se envió
  }

  try {
    // Obtener datos completos de la cita y del veterinario
    const vet = await db.getVetById(appointment.vet_id);
    if (!vet) {
      console.warn(`⚠️  [REMINDERS] Veterinario no encontrado para cita ${apptId}`);
      return;
    }

    const tz = vet.timezone || 'America/Caracas';
    const appointmentTime = DateTime.fromMillis(appointment.start_ms, { zone: tz }).toFormat(
      "cccc d 'de' LLLL 'a las' HH:mm",
      { locale: 'es' }
    );

    const messageMinutes = minutesBefore === '1h' ? 'en una hora' : 'en 15 minutos';

    // ===================================
    // Recordatorio al veterinario (email)
    // ===================================
    try {
      await emailService.sendAppointmentReminderToVet(
        vet.email,
        vet.whatsapp || '',
        appointment.tutor_name,
        appointment.tutor_whatsapp || '',
        appointment.animal_name,
        appointmentTime,
        appointment.meet_link
      );

      console.log(`✅ [REMINDERS] Recordatorio ${minutesBefore} enviado al vet ${vet.email} (cita ${apptId})`);
    } catch (err) {
      console.error(`⚠️  [REMINDERS] Error enviando email al vet:`, err.message);
    }

    // ===================================
    // Recordatorio al tutor (email si existe)
    // ===================================
    if (appointment.tutor_email) {
      try {
        const tutorMessage = `
Tu consulta veterinaria está ${messageMinutes}.

🐾 Consulta: ${appointment.animal_name}
⏰ Hora: ${appointmentTime}
🏥 Veterinario: ${vet.name}

${appointment.meet_link ? `📹 Enlace de Google Meet: ${appointment.meet_link}` : ''}

¡Prepárate para la consulta!
        `.trim();

        await emailService.sendAppointmentConfirmationToTutor(
          appointment.tutor_email,
          appointment.tutor_whatsapp,
          vet.name,
          appointmentTime,
          appointment.meet_link
        );

        console.log(`✅ [REMINDERS] Recordatorio ${minutesBefore} enviado al tutor ${appointment.tutor_email} (cita ${apptId})`);
      } catch (err) {
        console.error(`⚠️  [REMINDERS] Error enviando email al tutor:`, err.message);
      }
    }

    // Marcar como enviado
    remindersSent[apptId][key] = true;
  } catch (err) {
    console.error(`❌ [REMINDERS] Error enviando recordatorio ${minutesBefore}:`, err.message);
  }
}

module.exports = {
  startRemindersCron,
};
