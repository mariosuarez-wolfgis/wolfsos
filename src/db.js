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
    .eq('active', true)
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

async function getVetTimeBlocks(vetId, fromMs, toMs) {
  const { data, error } = await supabase
    .from('vet_time_blocks')
    .select('*')
    .eq('vet_id', vetId)
    .gte('end_ms', fromMs)
    .lte('start_ms', toMs)
    .order('start_ms');
  if (error) throw error;
  return data || [];
}

async function createTimeBlock(vetId, startMs, endMs, durationMinutes = 30) {
  const { data, error } = await supabase
    .from('vet_time_blocks')
    .insert([{
      id: uuidv4(),
      vet_id: vetId,
      start_ms: startMs,
      end_ms: endMs,
      duration_minutes: durationMinutes,
    }])
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
    .eq('status', 'booked')
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

module.exports = {
  supabase,
  // Vets
  listVets,
  getVet,
  getVetById,
  createVetWithGoogle,
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
  insertAppointment,
  getAppointment,
  listAppointments,
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
};
