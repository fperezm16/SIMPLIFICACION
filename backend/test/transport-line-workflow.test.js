const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createTransportLineWorkflowRouter } = require('../src/transport-line-workflow');

const pdf_base64 = Buffer.from('%PDF-1.4\ntrailer\n%%EOF').toString('base64');
const file = { filename: 'prueba.pdf', pdf_base64 };

test('el certificado de línea aérea respeta roles, documentos y etapas', async () => {
  const users = {
    1: { id: 1, email: 'analista@dgac.test', role: 'analista_servicios_aereos', unit_access: ['TRANSPORTE_AEREO'] },
    2: { id: 2, email: 'usuario@test.com', role: 'user', unit_access: [] },
    3: { id: 3, email: 'jefatura@dgac.test', role: 'jefatura_transporte_aereo', unit_access: ['TRANSPORTE_AEREO'] },
    4: { id: 4, email: 'legal@dgac.test', role: 'asesoria_juridica_transporte_aereo', unit_access: ['TRANSPORTE_AEREO'] },
    5: { id: 5, email: 'despacho@dgac.test', role: 'despacho_superior_transporte_aereo', unit_access: ['TRANSPORTE_AEREO'] },
    6: { id: 6, email: 'ajeno@test.com', role: 'user', unit_access: [] }
  };
  const row = { id: 11, unidad_clave: 'TRANSPORTE_AEREO', created_by_user_id: 2, correo: 'usuario@test.com', nombre_propietario: 'Línea de prueba', telefono: '12345678', registro_codigo: 'TRANSPORTE-11', detalle_formulario: { slug: 'linea-aerea', campos_digitales: { linea_aerea: 'Línea de prueba' }, opciones: {}, tablas: { rutas: [{ origen: 'GUA', destino: 'MIA' }] } } };
  const docs = new Map([['patentes_nombramiento', { document_key: 'patentes_nombramiento', label: 'Patentes y nombramiento', filename: 'patentes.pdf', pdf: Buffer.from('%PDF-1.4') }]]);
  let snapshot;
  const query = async (sql, values = []) => {
    if (sql === 'BEGIN') { snapshot = { detail: structuredClone(row.detalle_formulario), docs: new Map(docs) }; return { rows: [], rowCount: 0 }; }
    if (sql === 'ROLLBACK') { row.detalle_formulario = snapshot.detail; docs.clear(); for (const [key, value] of snapshot.docs) docs.set(key, value); return { rows: [], rowCount: 0 }; }
    if (sql === 'COMMIT') return { rows: [], rowCount: 0 };
    if (sql.includes('FROM users WHERE id')) return { rows: users[values[0]] ? [users[values[0]]] : [], rowCount: users[values[0]] ? 1 : 0 };
    if (sql.includes('FROM submissions s LEFT JOIN users a')) return { rows: [structuredClone(row)], rowCount: 1 };
    if (sql.includes('SELECT * FROM submissions') || sql.includes('SELECT s.*, a.name AS assigned_analista_name')) return { rows: Number(values[0]) === row.id ? [structuredClone(row)] : [], rowCount: Number(values[0]) === row.id ? 1 : 0 };
    if (sql.includes('FROM submission_logs l LEFT JOIN users u')) return { rows: [], rowCount: 0 };
    if (sql.includes('FROM submission_documents WHERE submission_id') && sql.includes('ORDER BY')) return { rows: [...docs.values()].map(({ document_key, label, filename }) => ({ document_key, label, filename })), rowCount: docs.size };
    if (sql.includes('SELECT filename, pdf FROM submission_documents')) return { rows: docs.has(values[1]) ? [docs.get(values[1])] : [], rowCount: docs.has(values[1]) ? 1 : 0 };
    if (sql.includes('INSERT INTO submission_documents')) { docs.set(values[1], { document_key: values[1], label: values[2], filename: values[3], pdf: values[4] }); return { rows: [], rowCount: 1 }; }
    if (sql.includes('UPDATE submissions SET detalle_formulario')) { row.detalle_formulario.transporte_linea = JSON.parse(values[1]); return { rows: [], rowCount: 1 }; }
    if (sql.includes('INSERT INTO submission_logs')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const app = express();
  app.use(express.json());
  app.use('/api/transport-line-workflow', createTransportLineWorkflowRouter({ pool, requireAuth: (req, _res, next) => { req.user = { sub: Number(req.header('x-test-user')) }; next(); } }));
  const server = app.listen(0);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/transport-line-workflow/11`;
    const list = async (user) => {
      const response = await fetch(base.replace(/\/11$/, ''), { headers: { 'x-test-user': String(user) } });
      assert.equal(response.status, 200);
      return response.json();
    };
    const open = async (user) => {
      const response = await fetch(`${base}/open`, { method: 'POST', headers: { 'x-test-user': String(user) } });
      return { status: response.status, body: await response.json() };
    };
    const act = async (user, action, files = {}, notes = '', extra = {}) => {
      const response = await fetch(`${base}/actions`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': String(user) }, body: JSON.stringify({ action, files, notes, ...extra }) });
      return { status: response.status, body: await response.json() };
    };
    const staffView = await fetch(base, { headers: { 'x-test-user': '1' } });
    assert.equal((await list(1))[0].estado_visual, 'pending');
    assert.equal((await list(3)).length, 0);
    assert.equal((await open(1)).body.estado_visual, 'pending');
    assert.equal((await list(1))[0].estado_visual, 'pending');
    row.assigned_analista_id = 1;
    assert.equal((await list(1))[0].estado_visual, 'pending');
    assert.equal((await open(1)).body.estado_visual, 'pending');
    assert.equal((await list(1))[0].estado_visual, 'pending');
    assert.equal((await open(3)).body.estado_visual, 'pending');
    const staffBody = await staffView.json();
    assert.equal(staffView.status, 200);
    assert.equal(staffBody.solicitud.campos_digitales.linea_aerea, 'Línea de prueba');
    assert.equal(staffBody.solicitud.tablas.rutas[0].destino, 'MIA');
    assert.deepEqual(staffBody.logs, []);
    assert.equal(staffBody.documentos.some(doc => doc.document_key === 'patentes_nombramiento'), true);
    const initialDocumentForStaff = await fetch(`${base}/documents/patentes_nombramiento`, { headers: { 'x-test-user': '1' } });
    assert.equal(initialDocumentForStaff.status, 200);
    assert.equal(initialDocumentForStaff.headers.get('content-type'), 'application/pdf');
    for (const staffId of [3, 4, 5]) {
      const staffResponse = await fetch(base, { headers: { 'x-test-user': String(staffId) } });
      const staffDetail = await staffResponse.json();
      assert.equal(staffResponse.status, 200);
      assert.equal(staffDetail.solicitud.campos_digitales.linea_aerea, 'Línea de prueba');
    }
    const initialDocumentForUser = await fetch(`${base}/documents/patentes_nombramiento`, { headers: { 'x-test-user': '2' } });
    assert.equal(initialDocumentForUser.status, 403);
    assert.equal((await act(6, 'send_to_head')).status, 403);
    assert.equal((await act(1, 'request_correction')).status, 409);
    assert.equal((await act(1, 'request_correction', {}, 'Falta documentación')).body.etapa, 'user_correction');
    assert.equal((await act(2, 'resubmit')).status, 400);
    assert.equal((await act(2, 'resubmit', { correction: file })).body.etapa, 'analyst_review');
    assert.equal((await list(1))[0].estado_visual, 'sent');
    assert.equal((await act(1, 'send_to_head')).body.etapa, 'jefatura_review');
    assert.equal((await list(1)).length, 0);
    assert.equal((await list(3))[0].estado_visual, 'sent');
    assert.equal((await open(3)).body.estado_visual, 'reviewing');
    assert.equal((await list(3))[0].estado_visual, 'reviewing');
    assert.equal((await act(3, 'send_projects', { opinions: file, certificate_project: file })).body.etapa, 'legal_and_despacho');
    assert.equal((await list(3)).length, 0);
    assert.equal((await list(4)).length, 1);
    assert.equal((await list(5)).length, 1);
    assert.equal((await act(5, 'sign_certificate', { signed_certificate: file })).body.etapa, 'legal_and_despacho');
    assert.equal((await list(5)).length, 0);
    assert.equal((await list(4)).length, 1);
    assert.equal((await act(4, 'legal_draft', { agreement_project: file })).body.etapa, 'analyst_payment');
    assert.equal((await act(1, 'send_payment_order', { payment_order: file }, '', { new_operator: true })).body.etapa, 'user_review');
    const userView = await fetch(base, { headers: { 'x-test-user': '2' } });
    const userBody = await userView.json();
    assert.equal(userView.status, 200);
    assert.equal(userBody.documentos.some(doc => doc.document_key === 'ta_line_agreement_project'), true);
    assert.equal(userBody.documentos.some(doc => doc.document_key === 'ta_line_signed_certificate'), true);
    assert.equal((await act(2, 'object', {}, 'El anexo requiere corrección')).body.etapa, 'jefatura_review');
    assert.equal((await act(3, 'send_projects', { opinions: file, certificate_project: file })).body.etapa, 'legal_and_despacho');
    assert.equal((await act(4, 'legal_draft', { agreement_project: file })).body.etapa, 'legal_and_despacho');
    assert.equal((await act(5, 'sign_certificate', { signed_certificate: file })).body.etapa, 'analyst_payment');
    assert.equal((await act(1, 'send_payment_order', { payment_order: file }, '', { new_operator: true })).body.etapa, 'user_review');
    assert.equal((await act(2, 'accept', { signed_by_user: file })).status, 400);
    assert.equal((await act(2, 'accept', { signed_by_user: file, registry_receipt: file })).body.etapa, 'jefatura_agreement');
    assert.equal((await act(3, 'send_agreement')).body.etapa, 'office_agreement');
    assert.equal((await act(5, 'sign_agreement', { signed_agreement: file })).body.etapa, 'analyst_close');
    assert.equal((await act(1, 'archive', {}, 'Distribuido y archivado')).status, 409);
    const notifications = Object.fromEntries(['seguridad_operacional', 'financiero', 'navegacion_aerea', 'operaciones_aeroportuarias', 'usuario', 'asesoria_juridica', 'expediente_archivado'].map(key => [key, true]));
    assert.equal((await act(1, 'archive', {}, 'Distribuido y archivado', { notifications })).body.etapa, 'finished');
    for (const staffId of [1, 3, 4, 5]) assert.equal((await list(staffId)).length, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
