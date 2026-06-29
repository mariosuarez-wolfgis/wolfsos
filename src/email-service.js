'use strict';

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Enviar email de invitación a veterinario
async function sendVetInvitationEmail(vetEmail, invitationUrl, invitationToken) {
  // Si Resend no está configurado, solo mostrar en logs
  if (!process.env.RESEND_API_KEY) {
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 INVITACIÓN GENERADA (EMAIL NO CONFIGURADO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Email: ${vetEmail}
Enlace de invitación: ${invitationUrl}
Token: ${invitationToken}

⚠️  Para enviar automáticamente, configura:
   RESEND_API_KEY=tu-api-key-resend
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
    return { message: 'Invitation link created (email not configured)' };
  }

  try {
    const result = await resend.emails.send({
      from: 'Wolf SOS <onboarding@resend.dev>',
      to: vetEmail,
      subject: '🐾 Invitación a Wolf SOS - Plataforma de Consultas Veterinarias',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2d6a4f;">¡Bienvenido a Wolf SOS! 🐾</h2>

          <p>Ha sido invitado a unirse a nuestra plataforma de consultas veterinarias en línea.</p>

          <p><strong>Tu código de invitación:</strong></p>
          <code style="display: block; background: #f5f5f0; padding: 15px; border-radius: 8px; margin: 20px 0; font-weight: bold; word-break: break-all;">
            ${invitationToken}
          </code>

          <p><strong>Haz clic en el enlace para completar tu registro:</strong></p>
          <a href="${invitationUrl}" style="display: inline-block; background: #2d6a4f; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 20px 0;">
            Completar Registro
          </a>

          <p style="color: #666; font-size: 0.9rem; margin-top: 30px;">
            O copia este enlace en tu navegador:<br>
            <code style="word-break: break-all;">${invitationUrl}</code>
          </p>

          <p style="color: #999; font-size: 0.85rem; margin-top: 40px;">
            Este enlace expira en 7 días.<br>
            Si no solicitaste esta invitación, ignora este email.
          </p>
        </div>
      `,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    console.log(`✉️  Email enviado a ${vetEmail} (ID: ${result.data.id})`);
    return result;
  } catch (err) {
    console.error(`❌ Error enviando email a ${vetEmail}:`, err.message);
    throw err;
  }
}

// Enviar confirmación de cita
async function sendAppointmentConfirmation(tutorEmail, tutorWhatsapp, vetName, appointmentTime) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`📧 Confirmación de cita para ${tutorEmail} (email no configurado)`);
    return;
  }

  try {
    const result = await resend.emails.send({
      from: 'Wolf SOS <onboarding@resend.dev>',
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
      `,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

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
