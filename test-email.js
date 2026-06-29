const emailService = require('./src/email-service');

console.log('🧪 Test Email Service');
console.log('GMAIL_USER:', process.env.GMAIL_USER || 'NO CONFIGURADO');
console.log('GMAIL_PASSWORD:', process.env.GMAIL_PASSWORD ? '✓ Configurado' : '❌ NO CONFIGURADO');

(async () => {
  try {
    console.log('\n📧 Intentando enviar email de prueba...\n');

    await emailService.sendVetInvitationEmail(
      'test@example.com',
      'http://localhost:3003/vet-register.html?token=abc123',
      'abc123'
    );

    console.log('\n✅ Email enviado exitosamente');
  } catch (err) {
    console.error('\n❌ Error enviando email:');
    console.error('   Mensaje:', err.message);
    console.error('   Código:', err.code);
    console.error('   Detalles:', err);
  }

  process.exit(0);
})();
