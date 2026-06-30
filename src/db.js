'use strict';

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL y SUPABASE_SERVICE_KEY requeridos');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- VETS ---

async function listVets() {
  const { data, error } = await supabase
    .from('vets')
    .select('*')
    .order('name');
  if (error) throw error;
  return data || [];
}

async function getVet(emailOrId) {
  let query = supabase.from('vets').select('*').eq('active', true);
  if (emailOrId.includes('@')) {
    query = query.eq('email', emailOrId);
  } else {
    query = query.eq('id', emailOrId);
  }
  const { data, error } = await query.single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function getVetById(id) {
  const { data, error } = await supabase
    .from('vets')
    .select('*')
    .eq('id', id)
    .eq('active', true)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function createVetWithGoogle(email, name, picture, accessToken, refreshToken, vetData) {
  const id = uuidv4();
  const { data, error } = await supabase
    .from('vets')
    .insert([{
      id,
      email,
      name,
      picture,
      google_access_token: accessToken,
      google_refresh_token: refreshToken,
      specialty: vetData?.specialty || null,
      whatsapp: vetData?.whatsapp || null,
      license_number: vetData?.licenseNumber || null,
      location: vetData?.location || null,
      bio: vetData?.bio || null,
      active: true,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function createVetWithPassword(email, passwordHash, specialty, licenseNumber, whatsapp, location, bio, name = null) {
  const id = uuidv4();
  const { data, error } = await supabase
    .from('vets')
    .insert([{
      id,
      email,
      password_hash: passwordHash,
      name: name || email.split('@')[0], // Usar nombre de invitación o email como fallback
      picture: null,
      specialty: specialty || null,
      whatsapp: whatsapp || null,
      license_number: licenseNumber || null,
      location: location || null,
      bio: bio || null,
      active: true,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateVetGoogleTokens(vetId, accessToken, refreshToken) {
  const { error } = await supabase
    .from('vets')
    .update({
      google_access_token: accessToken,
      google_refresh_token: refreshToken,
    })
    .eq('id', vetId);
  if (error) throw error;
}

// --- ADMIN ---

async function getAdmin(email) {
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('email', email)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function createAdmin(email, name, picture) {
  const id = uuidv4();
  const { data, error } = await supabase
    .from('admins')
    .insert([{ id, email, name, picture }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --- VET TIME BLOCKS (Bloques de horario flexibles) ---

async function getVetTimeBlocks(vetId, fromMs = null, toMs = null) {
  const { data, error } = await supabase
    .from('vet_time_blocks')
    .select('*')
    .eq('vet_id', vetId)
    .order('start_ms');
  if (error) throw error;

  // Retornar bloques SIN expandir (mostrar patrón original en UI)
  return (data || []).filter(b => {
    if (!fromMs || !toMs) return true;
    // Filtrar si está en rango (para bloques no recurrentes)
    if (!b.recurring_type || b.recurring_type === 'none') {
      return b.end_ms >= fromMs && b.start_ms <= toMs;
    }
    return true; // Incluir bloques recurrentes siempre
  });
}

// Nueva función: expandir bloques recurrentes solo para búsqueda de slots
async function getAvailableSlotsForBooking(vetId, fromMs, toMs) {
  const blocks = await getVetTimeBlocks(vetId);
  const expandedBlocks = [];

  for (const block of blocks) {
    // Si no es recurrente, incluir si está en rango
    if (!block.recurring_type || block.recurring_type === 'none') {
      if (block.end_ms >= fromMs && block.start_ms <= toMs) {
        expandedBlocks.push(block);
      }
      continue;
    }

    // Si es recurrente (weekly), expandir para cada día
    if (block.recurring_type === 'weekly') {
      const recurringDays = JSON.parse(block.recurring_days || '[]');
      const endDate = Math.min(block.recurring_end_date || toMs, toMs);
      const blockDuration = block.end_ms - block.start_ms;

      // Usar Luxon para obtener la hora correcta en UTC
      // block.start_ms ya está en UTC, así que obtener la hora del día en UTC
      const startDt = DateTime.fromMillis(block.start_ms, { zone: 'UTC' });
      const hoursOfDay = startDt.hour;
      const minutesOfDay = startDt.minute;
      const secondsOfDay = startDt.second;

      // Comenzar desde el bloque original, no desde "ahora"
      const loopStartMs = Math.max(block.start_ms, fromMs);
      for (let d = new Date(loopStartMs); d.getTime() <= endDate; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
        if (!recurringDays.includes(dayOfWeek)) continue;

        // Crear la fecha a medianoche UTC, luego agregar las horas
        const dayDt = DateTime.fromMillis(d.getTime(), { zone: 'UTC' }).startOf('day');
        const blockStartDt = dayDt.set({
          hour: hoursOfDay,
          minute: minutesOfDay,
          second: secondsOfDay
        });
        const blockStartMs = blockStartDt.toMillis();
        const blockEndMs = blockStartMs + blockDuration;

        if (blockEndMs >= fromMs && blockStartMs <= toMs) {
          expandedBlocks.push({
            ...block,
            start_ms: blockStartMs,
            end_ms: blockEndMs,
            _is_expanded: true,
          });
        }
      }
    }
  }

  return expandedBlocks.sort((a, b) => a.start_ms - b.start_ms);
}

async function createTimeBlock(vetId, startMs, endMs, durationMinutes = 30, recurringConfig = null) {
  const insert = {
    id: uuidv4(),
    vet_id: vetId,
    start_ms: startMs,
    end_ms: endMs,
    duration_minutes: durationMinutes,
    recurring_type: 'none',
    recurring_days: null,
    recurring_end_date: null,
  };

  // Si hay configuración recurrente
  if (recurringConfig && recurringConfig.recurringDays && recurringConfig.recurringDays.length > 0) {
    insert.recurring_type = 'weekly';
    insert.recurring_days = JSON.stringify(recurringConfig.recurringDays);
    insert.recurring_end_date = recurringConfig.recurringEndDate;
  }

  const { data, error } = await supabase
    .from('vet_time_blocks')
    .insert([insert])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteTimeBlock(blockId) {
  const { error } = await supabase
    .from('vet_time_blocks')
    .delete()
    .eq('id', blockId);
  if (error) throw error;
}

// --- APPOINTMENTS ---

async function getBookedSlots(vetId, fromMs, toMs) {
  const { data, error } = await supabase
    .from('appointments')
    .select('start_ms, end_ms')
    .eq('vet_id', vetId)
    .neq('appointment_status', 'cancelled') // Excluir citas canceladas
    .gte('end_ms', fromMs)
    .lte('start_ms', toMs);
  if (error) throw error;
  return data || [];
}

async function insertAppointment(data) {
  const toInsert = {
    id: uuidv4(),
    vet_id: data.vetId,
    start_ms: data.startMs,
    end_ms: data.endMs,
    status: 'booked',
    modality: data.modality,
    tutor_name: data.tutorName,
    tutor_whatsapp: data.tutorWhatsapp,
    tutor_email: data.tutorEmail || null,
    animal_name: data.animalName,
    species: data.species,
    urgency: data.urgency || null,
    symptoms: data.symptoms || null,
    triage_form_id: data.triageFormId || null,
    google_event_id: data.googleEventId || null,
    meet_link: data.meetLink || null,
    created_ms: data.createdMs,
  };

  const { data: result, error } = await supabase
    .from('appointments')
    .insert([toInsert])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      const err = new Error('Slot already booked');
      err.code = 'UNIQUE_VIOLATION';
      throw err;
    }
    throw error;
  }
  return result;
}

async function getAppointment(id) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function listAppointments(vetId, fromMs) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('vet_id', vetId)
    .eq('status', 'booked')
    .gte('start_ms', fromMs)
    .order('start_ms');
  if (error) throw error;
  return data || [];
}

async function updateAppointmentGoogleData(appointmentId, googleEventId, meetLink) {
  const { error } = await supabase
    .from('appointments')
    .update({
      google_event_id: googleEventId,
      meet_link: meetLink,
    })
    .eq('id', appointmentId);
  if (error) throw error;
}

// --- TRIAGE FORMS ---

async function createTriageForm(data) {
  const { data: result, error } = await supabase
    .from('triage_forms')
    .insert([{
      id: uuidv4(),
      tutor_name: data.tutorName,
      tutor_whatsapp: data.tutorWhatsapp,
      tutor_location: data.tutorLocation || null,
      tutor_can_videocall: data.tutorCanVideocall || false,
      animal_name: data.animalName || null,
      animal_species: data.animalSpecies,
      animal_age: data.animalAge || null,
      animal_weight: data.animalWeight || null,
      symptoms: data.symptoms,
      critical_signs: data.criticalSigns || [],
      urgency_level: data.urgencyLevel || null,
      photo_url: data.photoUrl || null,
    }])
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function getTriageForm(id) {
  const { data, error } = await supabase
    .from('triage_forms')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

// --- HELPERS ---

async function getRules(vetId) {
  const { data, error } = await supabase
    .from('availability_rules')
    .select('*')
    .eq('vet_id', vetId)
    .order('weekday, start_min');
  if (error) throw error;
  return data || [];
}

async function replaceRules(vetId, rules) {
  await supabase
    .from('availability_rules')
    .delete()
    .eq('vet_id', vetId);

  if (rules.length === 0) return;

  const toInsert = rules.map(r => ({
    vet_id: vetId,
    weekday: r.weekday,
    start_min: r.startMin,
    end_min: r.endMin
  }));

  const { error } = await supabase
    .from('availability_rules')
    .insert(toInsert);
  if (error) throw error;
}

async function getTimeOff(vetId, fromMs, toMs) {
  const { data, error } = await supabase
    .from('time_off')
    .select('*')
    .eq('vet_id', vetId)
    .gte('end_ms', fromMs)
    .lte('start_ms', toMs);
  if (error) throw error;
  return data || [];
}

async function addTimeOff(vetId, startMs, endMs, reason) {
  const { data, error } = await supabase
    .from('time_off')
    .insert([{
      id: uuidv4(),
      vet_id: vetId,
      start_ms: startMs,
      end_ms: endMs,
      reason: reason || null
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --- INVITATIONS ---

async function createInvitation(data) {
  const { data: result, error } = await supabase
    .from('vet_invitations')
    .insert([{
      id: uuidv4(),
      token: data.token,
      email: data.email,
      name: data.name || null,
      whatsapp: data.whatsapp || null,
      invited_by: data.invitedBy,
    }])
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function getInvitationByToken(token) {
  const { data, error } = await supabase
    .from('vet_invitations')
    .select('*')
    .eq('token', token)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function updateInvitation(token, updates) {
  const { error } = await supabase
    .from('vet_invitations')
    .update(updates)
    .eq('token', token);
  if (error) throw error;
}

async function getAdminStats() {
  try {
    const nowMs = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const todayEndMs = todayStartMs + 86_400_000;

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekStartMs = weekStart.getTime();
    const weekEndMs = weekStartMs + 7 * 86_400_000;

    // Total de vets activos
    const { data: vets, error: vetsError } = await supabase
      .from('vets')
      .select('id', { count: 'exact' })
      .eq('active', true);
    if (vetsError) throw vetsError;

    // Citas hoy
    const { data: apptToday, error: apptTodayError } = await supabase
      .from('appointments')
      .select('id', { count: 'exact' })
      .eq('status', 'booked')
      .gte('start_ms', todayStartMs)
      .lt('start_ms', todayEndMs);
    if (apptTodayError) throw apptTodayError;

    // Citas esta semana
    const { data: apptWeek, error: apptWeekError } = await supabase
      .from('appointments')
      .select('id', { count: 'exact' })
      .eq('status', 'booked')
      .gte('start_ms', weekStartMs)
      .lt('start_ms', weekEndMs);
    if (apptWeekError) throw apptWeekError;

    // Invitaciones pendientes
    const { data: invites, error: invitesError } = await supabase
      .from('vet_invitations')
      .select('id', { count: 'exact' })
      .eq('used', false);
    if (invitesError) throw invitesError;

    return {
      total_vets: vets?.length || 0,
      appointments_today: apptToday?.length || 0,
      appointments_this_week: apptWeek?.length || 0,
      pending_invitations: invites?.length || 0,
    };
  } catch (err) {
    console.error('Error getting admin stats:', err);
    throw err;
  }
}

// --- APPOINTMENT STATUS (Nuevo) ---

async function updateAppointmentStatus(appointmentId, vetId, newStatus, reason = null, notes = null) {
  const { data, error } = await supabase
    .from('appointments')
    .update({
      appointment_status: newStatus,
      status_updated_at: Date.now(),
      status_updated_by: vetId,
      cancellation_reason: newStatus === 'cancelled' ? reason : null,
      no_show_reason: newStatus === 'no_show' ? reason : null,
      vet_notes: notes || null,
    })
    .eq('id', appointmentId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listAppointmentsByStatus(vetId, status = null, fromMs = null) {
  let query = supabase
    .from('appointments')
    .select('*')
    .eq('vet_id', vetId);

  if (status) {
    query = query.eq('appointment_status', status);
  }

  if (fromMs) {
    query = query.gte('start_ms', fromMs);
  }

  const { data, error } = await query.order('start_ms', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Obtener citas próximas para recordatorios (todas las citas booked en un rango de tiempo)
async function getUpcomingAppointments(fromMs, toMs) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('status', 'booked')
    .gte('start_ms', fromMs)
    .lte('start_ms', toMs)
    .order('start_ms', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getVetAppointmentStats(vetId, fromMs = null, toMs = null) {
  let query = supabase
    .from('appointments')
    .select('appointment_status');

  query = query.eq('vet_id', vetId);

  if (fromMs) query = query.gte('start_ms', fromMs);
  if (toMs) query = query.lt('start_ms', toMs);

  const { data, error } = await query;
  if (error) throw error;

  const attended = data.filter(a => a.appointment_status === 'attended').length;
  const noShow = data.filter(a => a.appointment_status === 'no_show').length;
  const cancelled = data.filter(a => a.appointment_status === 'cancelled').length;
  const booked = data.filter(a => !a.appointment_status || a.appointment_status === 'booked').length;

  return {
    attended,
    no_show: noShow,
    cancelled,
    booked,
    total: data.length,
    attendanceRate: attended + noShow > 0 ? Math.round((attended / (attended + noShow)) * 100) : null,
  };
}

async function getAllAppointmentStats(fromMs = null, toMs = null) {
  let query = supabase.from('appointments').select('appointment_status');

  if (fromMs) query = query.gte('start_ms', fromMs);
  if (toMs) query = query.lt('start_ms', toMs);

  const { data, error } = await query;
  if (error) throw error;

  const attended = data.filter(a => a.appointment_status === 'attended').length;
  const noShow = data.filter(a => a.appointment_status === 'no_show').length;
  const cancelled = data.filter(a => a.appointment_status === 'cancelled').length;

  return { attended, no_show: noShow, cancelled, total: data.length };
}

async function getAllVetsStats(fromMs = null, toMs = null) {
  const vets = await listVets();
  const stats = [];

  for (const vet of vets) {
    stats.push({
      vetName: vet.name,
      vetEmail: vet.email,
      ...(await getVetAppointmentStats(vet.id, fromMs, toMs))
    });
  }

  return stats;
}

async function getAdminAlerts() {
  const weekAgoMs = Date.now() - 7 * 86400000;
  const vets = await listVets();
  const alerts = [];

  for (const vet of vets) {
    const stats = await getVetAppointmentStats(vet.id, weekAgoMs);

    if (stats.total < 5) {
      alerts.push({
        vetId: vet.id,
        vetName: vet.name,
        type: 'low_activity',
        message: `Solo ${stats.total} citas en última semana`,
        severity: 'warning',
      });
    }

    if (stats.attended + stats.no_show > 0 && stats.no_show > stats.attended) {
      const noShowRate = Math.round((stats.no_show / (stats.attended + stats.no_show)) * 100);
      alerts.push({
        vetId: vet.id,
        vetName: vet.name,
        type: 'high_no_show_rate',
        message: `Tasa de no-show: ${noShowRate}%`,
        severity: 'critical',
      });
    }
  }

  return alerts;
}

module.exports = {
  supabase,
  // Vets
  listVets,
  getVet,
  getVetById,
  createVetWithGoogle,
  createVetWithPassword,
  updateVetGoogleTokens,
  // Admin
  getAdmin,
  createAdmin,
  // Time blocks
  getVetTimeBlocks,
  createTimeBlock,
  deleteTimeBlock,
  // Appointments
  getBookedSlots,
  getAvailableSlotsForBooking,
  insertAppointment,
  getAppointment,
  listAppointments,
  listAppointmentsByStatus,
  getUpcomingAppointments,
  updateAppointmentGoogleData,
  // Triage
  createTriageForm,
  getTriageForm,
  // Helpers
  getRules,
  replaceRules,
  getTimeOff,
  addTimeOff,
  // Invitations
  createInvitation,
  getInvitationByToken,
  updateInvitation,
  getAdminStats,
  // Appointment Status
  updateAppointmentStatus,
  listAppointmentsByStatus,
  getVetAppointmentStats,
  getAllAppointmentStats,
  getAllVetsStats,
  getAdminAlerts,
};
