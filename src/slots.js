'use strict';

/**
 * Generador de huecos disponibles.
 * Independiente de la BD — recibe datos puros, devuelve array de huecos.
 * Portable a PHP/Python sin cambiar la lógica.
 */

const { DateTime } = require('luxon');

/**
 * @param {object} vet        - Registro de veterinario (timezone, slot_minutes, lead_minutes, horizon_days)
 * @param {object[]} rules    - [{weekday:1-7, start_min, end_min}]  (hora local del vet)
 * @param {object[]} timeOff  - [{start_ms, end_ms}]
 * @param {object[]} booked   - [{start_ms, end_ms}]
 * @param {number} nowMs      - Timestamp actual en ms (para tests: inyectable)
 * @returns {object[]}        - [{startMs, endMs, startIso, endIso, localTime}]
 */
function generateSlots(vet, rules, timeOff, booked, nowMs) {
  const now = nowMs !== undefined ? nowMs : Date.now();
  const tz = vet.timezone || 'America/Caracas';
  const slotMs = (vet.slot_minutes || 30) * 60_000;
  const leadMs = (vet.lead_minutes || 120) * 60_000;
  const horizon = vet.horizon_days || 7;
  const earliest = now + leadMs;

  // Indexar ocupados para lookup O(1)
  const blockedRanges = [
    ...timeOff.map(t => ({ s: t.start_ms, e: t.end_ms })),
    ...booked.map(b => ({ s: b.start_ms, e: b.end_ms })),
  ];

  const slots = [];
  const nowDt = DateTime.fromMillis(now, { zone: tz });

  for (let dayOffset = 0; dayOffset < horizon; dayOffset++) {
    const day = nowDt.plus({ days: dayOffset }).startOf('day');
    const isoWeekday = day.weekday; // 1=lun ... 7=dom

    const dayRules = rules.filter(r => r.weekday === isoWeekday);
    if (dayRules.length === 0) continue;

    for (const rule of dayRules) {
      let cursor = day.plus({ minutes: rule.start_min });
      const rangeEnd = day.plus({ minutes: rule.end_min });

      while (cursor < rangeEnd) {
        const slotEnd = cursor.plus({ milliseconds: slotMs });
        if (slotEnd > rangeEnd) break;

        const startMs = cursor.toMillis();
        const endMs = slotEnd.toMillis();

        if (startMs >= earliest && !isBlocked(startMs, endMs, blockedRanges)) {
          slots.push({
            startMs,
            endMs,
            startIso: cursor.toUTC().toISO(),
            endIso: slotEnd.toUTC().toISO(),
            localTime: cursor.toFormat('cccc d LLLL, HH:mm', { locale: 'es' }),
          });
        }

        cursor = slotEnd;
      }
    }
  }

  return slots;
}

function isBlocked(startMs, endMs, ranges) {
  for (const r of ranges) {
    if (startMs < r.e && endMs > r.s) return true;
  }
  return false;
}

module.exports = { generateSlots };
