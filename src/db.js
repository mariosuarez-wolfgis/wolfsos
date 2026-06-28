'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL y SUPABASE_SERVICE_KEY requeridos en .env');
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
  // Buscar por email o UUID
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

async function createVet(email, passwordHash, name, specialty, whatsapp) {
  const { data, error } = await supabase
    .from('vets')
    .insert([{
      email,
      password_hash: passwordHash,
      name,
      specialty: specialty || null,
      whatsapp,
      active: true
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --- AVAILABILITY ---

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
  // Borrar existentes
  await supabase
    .from('availability_rules')
    .delete()
    .eq('vet_id', vetId);

  if (rules.length === 0) return;

  // Insertar nuevos
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

// --- TIME OFF ---

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
    created_ms: data.createdMs
  };

  const { data: result, error } = await supabase
    .from('appointments')
    .insert([toInsert])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') { // UNIQUE violation
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

module.exports = {
  supabase,
  listVets,
  getVet,
  getVetById,
  createVet,
  getRules,
  replaceRules,
  getTimeOff,
  addTimeOff,
  getBookedSlots,
  insertAppointment,
  getAppointment,
  listAppointments,
};
