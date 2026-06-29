'use strict';

const crypto = require('crypto');
const db = require('./db');
const emailService = require('./email-service');

// Generar token único de invitación
function generateInvitationToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Invitar veterinario (solo admin)
async function inviteVet(adminId, email) {
  const token = generateInvitationToken();

  const invitation = await db.createInvitation({
    token,
    email,
    invitedBy: adminId,
  });

  const invitationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3003'}/vet-register.html?token=${invitation.token}`;

  // Enviar email de invitación
  try {
    await emailService.sendVetInvitationEmail(email, invitationUrl, invitation.token);
  } catch (err) {
    console.error('Error sending invitation email:', err.message);
    // No fallar la invitación si hay error de email
  }

  return {
    invitationId: invitation.id,
    token: invitation.token,
    email: invitation.email,
    invitationUrl: invitationUrl,
  };
}

// Validar token de invitación
async function validateInvitationToken(token) {
  const invitation = await db.getInvitationByToken(token);

  if (!invitation) {
    throw new Error('Invalid invitation token');
  }

  if (invitation.used) {
    throw new Error('Invitation already used');
  }

  if (new Date(invitation.expires_at) < new Date()) {
    throw new Error('Invitation expired');
  }

  return invitation;
}

// Marcar invitación como usada
async function useInvitation(token, vetId) {
  await db.updateInvitation(token, { accepted_at: new Date(), accepted_by: vetId, used: true });
}

// Listar veterinarios (para admin)
async function listVetersAdmin(adminId) {
  return await db.listVets();
}

// Estadísticas (para admin)
async function getAdminStats() {
  const stats = await db.getAdminStats();
  return {
    totalVets: stats.total_vets || 0,
    appointmentsToday: stats.appointments_today || 0,
    appointmentsThisWeek: stats.appointments_this_week || 0,
    pendingInvitations: stats.pending_invitations || 0,
  };
}

// Ver cita (para admin o vet)
async function getAppointmentDetails(appointmentId, userId, userType) {
  const appointment = await db.getAppointment(appointmentId);

  if (!appointment) {
    throw new Error('Appointment not found');
  }

  // Verificar permisos
  if (userType === 'vet' && appointment.vet_id !== userId) {
    throw new Error('Unauthorized');
  }

  return appointment;
}

module.exports = {
  generateInvitationToken,
  inviteVet,
  validateInvitationToken,
  useInvitation,
  listVetersAdmin,
  getAdminStats,
  getAppointmentDetails,
};
