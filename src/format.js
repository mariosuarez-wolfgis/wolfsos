'use strict';

const { DateTime } = require('luxon');

/**
 * Genera el contenido de un archivo .ics (RFC 5545) para una cita.
 */
function buildIcs(appt, vet) {
  const tz = vet.timezone || 'America/Caracas';
  const dtStart = DateTime.fromMillis(appt.start_ms, { zone: tz });
  const dtEnd = DateTime.fromMillis(appt.end_ms, { zone: tz });

  const fmt = dt => dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
  const uid = `appt-${appt.id}-${appt.start_ms}@migenteve`;

  const summary = `Consulta veterinaria: ${appt.animal_name} con ${vet.name}`;
  const description = [
    `Tutor: ${appt.tutor_name}`,
    `Animal: ${appt.animal_name} (${appt.species})`,
    `Urgencia: ${appt.urgency || 'No indicada'}`,
    `Modalidad: ${modalityLabel(appt.modality)}`,
    appt.symptoms ? `Síntomas: ${appt.symptoms}` : '',
  ]
    .filter(Boolean)
    .join('\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wolfgis//WolfSOS Agenda Vet//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${fmt(DateTime.utc())}`,
    `DTSTART:${fmt(dtStart)}`,
    `DTEND:${fmt(dtEnd)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Genera el enlace de WhatsApp con mensaje prellenado para confirmar la cita.
 */
function buildWhatsappLink(appt, vet) {
  const tz = vet.timezone || 'America/Caracas';
  const dt = DateTime.fromMillis(appt.start_ms, { zone: tz });
  const whenStr = dt.toFormat("cccc d 'de' LLLL 'a las' HH:mm", { locale: 'es' });

  const text = [
    `Hola ${vet.name}, confirmo mi cita:`,
    `📅 ${whenStr} (hora Venezuela)`,
    `🐾 Paciente: ${appt.animal_name} (${appt.species})`,
    `👤 Tutor: ${appt.tutor_name}`,
    `📱 Modalidad: ${modalityLabel(appt.modality)}`,
    appt.urgency ? `⚠️ Urgencia: ${appt.urgency}` : '',
    appt.symptoms ? `📝 Síntomas: ${appt.symptoms}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const phone = (vet.whatsapp || '').replace(/[^0-9]/g, '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function modalityLabel(m) {
  return { video: 'Videollamada', audio: 'Llamada de voz', whatsapp: 'WhatsApp' }[m] || m;
}

module.exports = { buildIcs, buildWhatsappLink };
