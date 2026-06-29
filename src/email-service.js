'use strict';

const nodemailer = require('nodemailer');

// Configurar transportador de Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'noreply@wolfsos.com',
    pass: process.env.GMAIL_PASSWORD || '',
  }
});

// Enviar email de invitación a veterinario
async function sendVetInvitationEmail(vetEmail, invitationUrl, invitationToken) {
  // Si Gmail no está configurado, solo mostrar en logs
  if (!process.env.GMAIL_USER || process.env.GMAIL_USER === 'tu-gmail@gmail.com') {
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 INVITACIÓN GENERADA (EMAIL NO CONFIGURADO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Email: ${vetEmail}
Enlace de invitación: ${invitationUrl}
Token: ${invitationToken}

⚠️  Para enviar automáticamente, configura:
   GMAIL_USER=tu-email@gmail.com
   GMAIL_PASSWORD=tu-app-password
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
    return { message: 'Invitation link created (email not configured)' };
  }

  try {
    const mailOptions = {
      from: `"Wolf SOS" <${process.env.GMAIL_USER}>`,
      to: vetEmail,
      subject: '🐾 Invitación a Wolf SOS - Plataforma de Consultas Veterinarias',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2d6a4f;">¡Bienvenido a Wolf SOS! 🐾</h2>

          <p>Ha sido invitado a unirse a nuestra plataforma de consultas veterinarias en línea.</p>

          <p><strong>Tu código de invitación:</strong></p>
          <code style="display: block; background: #f5f5f0; padding: 15px; border-radius: 8px; margin: 20px 0; font-weight: bold;">
            ${invitationToken}
          </code>

          <p><strong>Haz clic en el enlace para completar tu registro:</strong></p>
          <a href="${invitationUrl}" style="display: inline-block; background: #2d6a4f; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 20px 0;">
            Completar Registro
          </a>

          <p style="color: #666; font-size: 0.9rem; margin-top: 30px;">
            O copia este enlace en tu navegador:<br>
            <code>${invitationUrl}</code>
          </p>

          <p style="color: #999; font-size: 0.85rem; margin-top: 40px;">
            Este enlace expira en 7 días.<br>
            Si no solicitaste esta invitación, ignora este email.
          </p>
        </div>
      `,
      text: `
Bienvenido a Wolf SOS

Has sido invitado a unirse a nuestra plataforma de consultas veterinarias.

Tu código de invitación: ${invitationToken}

Completa tu registro aquí: ${invitationUrl}

Este enlace expira en 7 días.
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✉️  Email enviado a ${vetEmail}:`, result.messageId);
    return result;
  } catch (err) {
    console.error(`❌ Error enviando email a ${vetEmail}:`, err.message);
    throw err;
  }
}

// Enviar confirmación de cita
async function sendAppointmentConfirmation(tutorEmail, tutorWhatsapp, vetName, appointmentTime) {
  try {
    const mailOptions = {
      from: `"Wolf SOS" <${process.env.GMAIL_USER}>`,
      to: tutorEmail,
      subject: '📅 Confirmación de Cita - Wolf SOS',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2d6a4f;">¡Cita Confirmada! 🎉</h2>

          <p>Tu cita veterinaria ha sido agendada exitosamente.</p>

          <div style="background: #f0faf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Veterinario:</strong> ${vetName}</p>
            <p><strong>Hora:</strong> ${appointmentTime}</p>
            <p><strong>Contacto:</strong> ${tutorWhatsapp}</p>
          </div>

          <p>El veterinario te contactará por WhatsApp 15 minutos antes de la cita.</p>

          <p style="color: #999; font-size: 0.85rem; margin-top: 40px;">
            Wolf SOS - Plataforma de Consultas Veterinarias
          </p>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✉️  Confirmación enviada a ${tutorEmail}`);
    return result;
  } catch (err) {
    console.error(`❌ Error enviando confirmación:`, err.message);
    throw err;
  }
}

module.exports = {
  sendVetInvitationEmail,
  sendAppointmentConfirmation,
};
