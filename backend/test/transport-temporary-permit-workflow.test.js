const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createTransportLineWorkflowRouter } = require('../src/transport-line-workflow');

const pdf_base64 = Buffer.from('%PDF-1.4\ntrailer\n%%EOF').toString('base64');
const file = { filename: 'prueba.pdf', pdf_base64 };

test('el permiso temporal no regular respeta sus seis pasos, devoluciones y archivo', async () => {
  const users = {
    1: { id: 1, email: 'analista@dgac.test', role: 'analista_servicios_aereos', unit_access: ['TRANSPORTE_AEREO'] },
    2: { id: 2, email: 'usuario@test.com', role: 'user', unit_access: [] },
    3: { id: 3, email: 'jefatura@dgac.test', role: 'jefatura_transporte_aereo', unit_access: ['TRANSPORTE_AEREO'] }
  };
  const row = {
    id: 41,
    unidad_clave: 'TRANSPORTE_AEREO',
    created_by_user_id: 2,
    assigned_analista_id: 1,
    correo: 'usuario@test.com',
    nombre_propietario: 'Operador no regular de prueba',
    telefono: '12345678',
    registro_codigo: 'TRANSPORTE-41',
    detalle_formulario: {
      slug: 'permiso-temporal-no-regular',
      codigo: 'TA-04-2024',
      campos_digitales: { entidad: 'Operador no regular de prueba' },
      opciones: {},
      tablas: {}
    }
  };
  const docs = new Map();
  let snapshot;
  const query = async (sql, values = []) => {
    if (sql === 'BEGIN') { snapshot = { detail: structuredClone(row.detalle_formulario), docs: new Map(docs) }; return { rows: [], rowCount: 0 }; }
    if (sql === 'ROLLBACK') { row.detalle_formulario = snapshot.detail; docs.clear(); for (const [key, value] of snapshot.docs) docs.set(key, value); return { rows: [], rowCount: 0 }; }
    if (sql === 'COMMIT') return { rows: [], rowCount: 0 };
    if (sql.includes('FROM users WHERE id')) return { rows: users[values[0]] ? [users[values[0]]] : [], rowCount: users[values[0]] ? 1 : 0 };
    if (sql.includes('SELECT * FROM submissions') || sql.includes('SELECT s.*, a.name AS assigned_analista_name')) return { rows: Number(values[0]) === row.id ? [structuredClone(row)] : [], rowCount: Number(values[0]) === row.id ? 1 : 0 };
    if (sql.includes('FROM submission_logs l LEFT JOIN users u')) return { rows: [], rowCount: 0 };
    if (sql.includes('FROM submission_documents WHERE submission_id') && sql.includes('ORDER BY')) return { rows: [...docs.values()].map(({ document_key, label, filename }) => ({ document_key, label, filename })), rowCount: docs.size };
    if (sql.includes('INSERT INTO submission_documents')) { docs.set(values[1], { document_key: values[1], label: values[2], filename: values[3], pdf: values[4] }); return { rows: [], rowCount: 1 }; }
    if (sql.includes('UPDATE submissions SET detalle_formulario')) { row.detalle_formulario.transporte_linea = JSON.parse(values[1]); return { rows: [], rowCount: 1 }; }
    if (sql.includes('INSERT INTO submission_logs')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const app = express();
  app.use(express.json());
  app.use('/api/transport-line-workflow', createTransportLineWorkflowRouter({
    pool,
    requireAuth: (req, _res, next) => { req.user = { sub: Number(req.header('x-test-user')) }; next(); }
  }));
  const server = app.listen(0);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/transport-line-workflow/41`;
    const act = async (user, action, files = {}, notes = '', notifications = {}) => {
      const response = await fetch(`${base}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test-user': String(user) },
        body: JSON.stringify({ action, files, notes, notifications })
      });
      return { status: response.status, body: await response.json() };
    };

    const detailResponse = await fetch(base, { headers: { 'x-test-user': '1' } });
    const detail = await detailResponse.json();
    assert.equal(detail.workflow_type, 'temporary_non_regular_permit');

    assert.equal((await act(1, 'request_correction')).status, 409);
    assert.equal((await act(1, 'request_correction', {}, 'Completar la documentación')).body.etapa, 'user_correction');
    assert.equal((await act(2, 'resubmit')).status, 400);
    assert.equal((await act(2, 'resubmit', { correction: file })).body.etapa, 'analyst_review');
    assert.equal((await act(1, 'send_to_head')).body.etapa, 'jefatura_review');
    assert.equal((await act(3, 'authorize_temporary_permit', { opinions: file })).status, 400);
    assert.equal((await act(3, 'authorize_temporary_permit', { opinions: file, temporary_permit: file })).body.etapa, 'user_review');

    const userView = await fetch(base, { headers: { 'x-test-user': '2' } });
    const userBody = await userView.json();
    assert.equal(userBody.documentos.some(doc => doc.document_key === 'ta_line_temporary_permit'), true);

    assert.equal((await act(2, 'object')).status, 409);
    assert.equal((await act(2, 'object', {}, 'Corregir el contenido del permiso')).body.etapa, 'jefatura_review');
    assert.equal((await act(3, 'authorize_temporary_permit', { opinions: file, temporary_permit: file })).body.etapa, 'user_review');
    assert.equal((await act(2, 'accept')).body.etapa, 'analyst_close');
    assert.equal((await act(1, 'archive_temporary')).status, 400);
    assert.equal((await act(1, 'archive_temporary', { archive_record: file })).body.etapa, 'finished');
    assert.equal(docs.has('ta_line_archive_record'), true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
