const test = require('node:test');
const assert = require('node:assert/strict');

const mailerPath = require.resolve('../config/mailer');
const servicePath = require.resolve('../services/emailNotificationService');
const calls = [];
let failure = null;

require.cache[mailerPath] = {
  id: mailerPath,
  filename: mailerPath,
  loaded: true,
  exports: {
    sendMail: async (message) => {
      calls.push(message);
      if (failure) throw failure;
    }
  }
};
delete require.cache[servicePath];
const { notifyAssignee, notifyUserStatus } = require('../services/emailNotificationService');

const context = {
  id: 13,
  registro_codigo: 'RAN-13-2026',
  unidad_clave: 'RAN',
  gestion_nombre: 'Certificación',
  nombre_propietario: 'Solicitante de prueba'
};

test.beforeEach(() => {
  calls.length = 0;
  failure = null;
});

test('notifica al responsable interno con enlace al módulo de revisión', async () => {
  const sent = await notifyAssignee({
    to: 'aprobador@dgac.test',
    recipientName: 'Aprobador',
    roleLabel: 'aprobador',
    actionLabel: 'Formulario enviado a aprobador',
    context
  });

  assert.equal(sent, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].to, 'aprobador@dgac.test');
  assert.match(calls[0].subject, /Formulario enviado a aprobador: RAN-13-2026/);
  assert.match(calls[0].html, /\/revision/);
});

test('notifica al propietario con el estado actualizado', async () => {
  const sent = await notifyUserStatus({
    to: 'usuario@dgac.test',
    recipientName: 'Usuario',
    subjectPrefix: 'Boleta de pago disponible',
    heading: 'Tu boleta de pago ya está disponible',
    message: 'Ingresa al portal para descargarla.',
    context
  });

  assert.equal(sent, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].to, 'usuario@dgac.test');
  assert.match(calls[0].subject, /Boleta de pago disponible: RAN-13-2026/);
});

test('registra destinatario, asunto y código cuando SMTP rechaza el envío', async () => {
  failure = Object.assign(new Error('Authentication failed'), { code: 'EAUTH', responseCode: 535 });
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    const sent = await notifyUserStatus({
      to: 'usuario@dgac.test',
      subjectPrefix: 'Cambio de estado',
      heading: 'Actualización',
      message: 'Prueba',
      context
    });
    assert.equal(sent, false);
  } finally {
    console.error = originalError;
  }

  assert.equal(errors.length, 1);
  assert.equal(errors[0][1].recipient, 'usuario@dgac.test');
  assert.equal(errors[0][1].code, 'EAUTH');
  assert.equal(errors[0][1].responseCode, 535);
});
