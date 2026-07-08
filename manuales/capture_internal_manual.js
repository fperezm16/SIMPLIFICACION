const fs = require('fs');
const path = require('path');
const puppeteer = require('../backend/node_modules/puppeteer-core');

const outDir = path.join(__dirname, 'assets');
const baseUrl = 'http://127.0.0.1:4200';
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];

const common = {
  fecha: '2026-06-22',
  persona_tipo: 'individual',
  documento_propietario: 'Documento de demostración',
  direccion: 'Dirección de demostración',
  telefono: '22223333',
  correo: 'solicitante.demo@example.com',
  nit: 'CF',
  uso: 'privado',
  fabricante: 'Fabricante demo',
  numero_serie: 'SERIE-DEMO',
  modelo: 'Modelo demo',
  anio_fabricacion: '2024',
  colores: 'Blanco y azul',
  tipo_internacion: false,
  tipo_reservacion: false,
  tipo_inscripcion: false,
  tipo_certificado_prov: false,
  tipo_reposicion: false,
  tipo_cambio_prop: false,
  tipo_cambio_datos: false,
  tipo_certificacion: false
};

const ranReception = {
  ...common,
  id: 2001,
  created_at: '2026-06-22T14:30:00.000Z',
  unidad_clave: 'RAN',
  gestion_nombre: 'Reserva, Prórroga o Cesión de Matrícula',
  registro_codigo: 'RAN-06-2026-0001',
  nombre_propietario: 'Solicitante de demostración',
  matricula_tg: 'TG-DEM',
  tipo_reservacion: true,
  dpi_filename: 'dpi-demostracion.pdf',
  has_dpi: true,
  receptor_opened_at: null,
  assigned_analista_id: null,
  assigned_emisor_id: null,
  assigned_aprobador_id: null
};

const ranAnalyst = {
  ...ranReception,
  receptor_opened_at: '2026-06-22T14:40:00.000Z',
  assigned_analista_id: 200,
  assigned_analista_name: 'Analista RAN',
  assigned_analista_email: 'analista.ran@example.com',
  comentarios_revision: 'Verificar documentación y datos de matrícula.'
};

const financialApprover = {
  ...common,
  id: 3001,
  created_at: '2026-06-22T15:10:00.000Z',
  unidad_clave: 'FINANCIERO',
  gestion_nombre: 'Solicitud para emisión de solvencia financiera',
  registro_codigo: 'FINANCIERO-06-2026-0001',
  nombre_propietario: 'Empresa de demostración',
  representante_legal: 'Representante de demostración',
  matricula_tg: 'TG-DEM',
  receptor_opened_at: '2026-06-22T15:20:00.000Z',
  assigned_analista_id: 210,
  assigned_analista_name: 'Analista Financiero',
  assigned_emisor_id: 310,
  assigned_emisor_name: 'Emisor Financiero',
  assigned_aprobador_id: 400,
  assigned_aprobador_name: 'Aprobador Financiero',
  sent_to_emisor_at: '2026-06-22T15:35:00.000Z',
  sent_to_aprobador_at: '2026-06-22T15:50:00.000Z',
  carta_representacion_filename: 'carta-representacion-demo.pdf',
  has_carta_representacion: true,
  analyst_pdf_filename: 'boleta-demo.pdf',
  has_analyst_pdf: true,
  detalle_formulario: {
    gestion_tipo: 'solvencias',
    proceso_codigo: 'solvencia_financiera_aeronave',
    proceso_label: 'Solvencia financiera de aeronave',
    nombre_empresa: 'Empresa de demostración',
    nombre_solicitante: 'Representante de demostración',
    matricula: 'TG-DEM'
  }
};

const logs = [
  { id: 1, submission_id: 2001, event_code: 'usuario_envio', event_label: 'Usuario envió solicitud', actor_role: 'user', actor_name: 'Solicitante demo', created_at: '2026-06-22T14:30:00.000Z' },
  { id: 2, submission_id: 2001, event_code: 'receptor_abre', event_label: 'Recepción abrió el formulario', actor_role: 'revisor', actor_name: 'Recepción RAN', created_at: '2026-06-22T14:40:00.000Z' },
  { id: 3, submission_id: 2001, event_code: 'asignado_analista', event_label: 'Asignado a analista', actor_role: 'revisor', actor_name: 'Recepción RAN', created_at: '2026-06-22T14:45:00.000Z' }
];

const cors = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4200' };

async function createRolePage(browser, role, id, unitAccess, rows) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);

  page.on('request', (request) => {
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    const respond = (body) => request.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });

    if (method === 'GET' && pathname === '/api/submissions') return respond(rows);
    if (method === 'GET' && /^\/api\/submissions\/\d+\/logs$/.test(pathname)) return respond(logs);
    if (method === 'POST' && /^\/api\/submissions\/\d+\/open$/.test(pathname)) return respond({ receptor_opened_at: new Date().toISOString() });
    if (method === 'GET' && pathname === '/api/analistas') return respond([{ id: 200, name: 'Analista RAN', email: 'analista.ran@example.com', unit_access: ['RAN'] }, { id: 210, name: 'Analista Financiero', email: 'analista.financiero@example.com', unit_access: ['FINANCIERO'] }]);
    if (method === 'GET' && pathname === '/api/emisores') return respond([{ id: 310, name: 'Emisor Financiero', email: 'emisor.financiero@example.com', unit_access: ['FINANCIERO'] }]);
    if (method === 'GET' && pathname === '/api/aprobadores') return respond([{ id: 400, name: 'Aprobador Financiero', email: 'aprobador.financiero@example.com', unit_access: ['RAN', 'FINANCIERO'] }]);
    if (method === 'GET' && pathname === '/api/submissions/archive') return respond([]);
    if (method === 'GET' && pathname === '/api/financial-approved-history') return respond([]);
    if (method === 'GET' && pathname === '/api/approver-dashboard') return respond({ units: unitAccess, summary: { active_total: 2, pending_approval_total: 1, approved_total: 4, delivered_total: 3 }, stage_timings: [], process_bottlenecks: [], assignments: [] });
    return request.continue();
  });

  await page.goto(`${baseUrl}/auth`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(({ userRole, userId, units }) => {
    sessionStorage.setItem('auth_token', 'token-interno-demostracion');
    sessionStorage.setItem('auth_user', JSON.stringify({ id: userId, email: `${userRole}@example.com`, name: `Usuario ${userRole}`, role: userRole, unit_access: units }));
  }, { userRole: role, userId: id, units: unitAccess });
  await page.goto(`${baseUrl}/revision`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.process-card', { timeout: 10000 });
  await new Promise((resolve) => setTimeout(resolve, 900));
  return page;
}

(async () => {
  const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error('No se encontró un navegador compatible.');

  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-first-run', '--disable-features=Translate', '--window-size=1440,1000'] });
  try {
    const reception = await createRolePage(browser, 'revisor', 100, ['RAN'], [ranReception]);
    await reception.screenshot({ path: path.join(outDir, '09-interno-recepcion-ran.png'), fullPage: false });
    await reception.close();

    const analyst = await createRolePage(browser, 'analista', 200, ['RAN'], [ranAnalyst]);
    await analyst.click('.open-btn');
    await analyst.waitForSelector('.editor', { timeout: 10000 });
    await analyst.$eval('.editor', (element) => element.scrollIntoView({ block: 'start' }));
    await new Promise((resolve) => setTimeout(resolve, 700));
    await analyst.screenshot({ path: path.join(outDir, '10-interno-analista-ran.png'), fullPage: false });
    await analyst.$eval('.editor-actions', (element) => element.scrollIntoView({ block: 'center' }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    await analyst.screenshot({ path: path.join(outDir, '11-interno-acciones-ran.png'), fullPage: false });
    await analyst.close();

    const approver = await createRolePage(browser, 'aprobador', 400, ['FINANCIERO'], [financialApprover]);
    await approver.click('.open-btn');
    await approver.waitForSelector('.editor', { timeout: 10000 });
    await approver.$eval('.editor', (element) => element.scrollIntoView({ block: 'start' }));
    await new Promise((resolve) => setTimeout(resolve, 700));
    await approver.screenshot({ path: path.join(outDir, '12-interno-aprobador-financiero.png'), fullPage: false });
    await approver.$eval('.editor-actions', (element) => element.scrollIntoView({ block: 'center' }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    await approver.screenshot({ path: path.join(outDir, '13-interno-acciones-financiero.png'), fullPage: false });
    await approver.close();
  } finally {
    await browser.close();
  }
})();
