const fs = require('fs');
const path = require('path');
const puppeteer = require('../backend/node_modules/puppeteer-core');

const outDir = path.join(__dirname, 'assets');
const baseUrl = 'http://localhost:4200';
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];

const cors = { 'Access-Control-Allow-Origin': baseUrl };

const users = [
  { id: 1, name: 'Administrador DGAC', email: 'admin.dgac@example.com', role: 'admin', unit_access: ['GENERAL', 'RAN', 'FINANCIERO'], created_at: '2026-06-20T09:00:00.000Z' },
  { id: 2, name: 'Recepción RAN', email: 'recepcion.ran@example.com', role: 'revisor', unit_access: ['RAN'], created_at: '2026-06-20T10:10:00.000Z' },
  { id: 3, name: 'Analista RAN', email: 'analista.ran@example.com', role: 'analista', unit_access: ['RAN'], created_at: '2026-06-20T10:20:00.000Z' },
  { id: 4, name: 'Aprobador RAN', email: 'aprobador.ran@example.com', role: 'aprobador', unit_access: ['RAN'], created_at: '2026-06-20T10:30:00.000Z' },
  { id: 5, name: 'Analista Financiero', email: 'analista.fin@example.com', role: 'analista', unit_access: ['FINANCIERO'], created_at: '2026-06-21T08:00:00.000Z' },
  { id: 6, name: 'Emisor Financiero', email: 'emisor.fin@example.com', role: 'emisor', unit_access: ['FINANCIERO'], created_at: '2026-06-21T08:20:00.000Z' },
  { id: 7, name: 'Aprobador Financiero', email: 'aprobador.fin@example.com', role: 'aprobador', unit_access: ['FINANCIERO'], created_at: '2026-06-21T08:30:00.000Z' },
  { id: 8, name: 'Supervisor', email: 'supervisor@example.com', role: 'supervisor', unit_access: ['GENERAL', 'RAN', 'FINANCIERO'], created_at: '2026-06-21T09:00:00.000Z' }
];

const dashboard = {
  generated_at: '2026-06-23T10:00:00.000Z',
  totals: { total: 14, active: 8, approved: 4, returned: 2 },
  by_unit: [
    {
      unit: 'RAN',
      total: 8,
      active: 5,
      status_counts: { enviado: 1, en_recepcion: 1, asignado: 2, en_aprobacion: 1, aprobado: 2, devuelto: 1 },
      avg_stage_hours: { receptor: 2.5, analista: 18.2, aprobador: 8.4, total_aprobado: 31.7 }
    },
    {
      unit: 'FINANCIERO',
      total: 6,
      active: 3,
      status_counts: { enviado: 1, asignado: 1, en_aprobacion: 1, aprobado: 2, devuelto_analista: 1 },
      avg_stage_hours: { receptor: 1.8, analista: 12.5, aprobador: 5.2, total_aprobado: 24.6 }
    }
  ],
  processes: [
    { id: 101, registro_codigo: 'RAN-01-2026', unidad_clave: 'RAN', gestion_nombre: 'Reserva de matrícula', nombre_propietario: 'Aeronaves del Norte', estado_code: 'asignado', estado_label: 'Analista', created_at: '2026-06-22T09:00:00.000Z', assigned_analista_name: 'Analista RAN', assigned_aprobador_name: 'Sin asignar', receptor_hours: 2.1, analista_hours: 12.7, aprobador_hours: null, current_stage_hours: 12.7 },
    { id: 102, registro_codigo: 'RAN-02-2026', unidad_clave: 'RAN', gestion_nombre: 'Cambio de propietario', nombre_propietario: 'Transportes Aéreos GT', estado_code: 'en_aprobacion', estado_label: 'Aprobador', created_at: '2026-06-21T11:00:00.000Z', assigned_analista_name: 'Analista RAN', assigned_aprobador_name: 'Aprobador RAN', receptor_hours: 1.5, analista_hours: 20.4, aprobador_hours: 6.2, current_stage_hours: 6.2 },
    { id: 201, registro_codigo: 'FINANCIERO-01-2026', unidad_clave: 'FINANCIERO', gestion_nombre: 'Solvencia financiera', nombre_propietario: 'Servicios Aéreos del Sur', estado_code: 'en_aprobacion', estado_label: 'Aprobador', created_at: '2026-06-22T13:00:00.000Z', assigned_analista_name: 'Analista Financiero', assigned_aprobador_name: 'Aprobador Financiero', receptor_hours: 1.2, analista_hours: 8.5, aprobador_hours: 3.2, current_stage_hours: 3.2 },
    { id: 202, registro_codigo: 'FINANCIERO-02-2026', unidad_clave: 'FINANCIERO', gestion_nombre: 'Contraseña de pago', nombre_propietario: 'Operador Demo', estado_code: 'aprobado', estado_label: 'Aprobado', created_at: '2026-06-20T15:00:00.000Z', assigned_analista_name: 'Analista Financiero', assigned_aprobador_name: 'Aprobador Financiero', receptor_hours: 0.8, analista_hours: 7.4, aprobador_hours: 2.1, current_stage_hours: null }
  ]
};

const searchRows = [
  {
    id: 101,
    registro_codigo: 'RAN-01-2026',
    unidad_clave: 'RAN',
    gestion_nombre: 'Reserva de matrícula',
    nombre_propietario: 'Aeronaves del Norte',
    correo: 'solicitante.ran@example.com',
    nit: '1234567-8',
    matricula_tg: 'TG-ABC',
    created_at: '2026-06-22T09:00:00.000Z',
    assigned_analista_name: 'Analista RAN',
    assigned_emisor_name: null,
    assigned_aprobador_name: 'Aprobador RAN'
  },
  {
    id: 201,
    registro_codigo: 'FINANCIERO-01-2026',
    unidad_clave: 'FINANCIERO',
    gestion_nombre: 'Solvencia financiera',
    nombre_propietario: 'Servicios Aéreos del Sur',
    correo: 'financiero@example.com',
    nit: '9876543-1',
    matricula_tg: 'TG-FIN',
    created_at: '2026-06-22T13:00:00.000Z',
    assigned_analista_name: 'Analista Financiero',
    assigned_emisor_name: 'Emisor Financiero',
    assigned_aprobador_name: 'Aprobador Financiero'
  }
];

async function setupPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);

  page.on('request', (request) => {
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();
    const respond = (body, contentType = 'application/json') => request.respond({
      status: 200,
      contentType,
      headers: cors,
      body: contentType === 'application/json' ? JSON.stringify(body) : body
    });

    if (method === 'GET' && pathname === '/api/auth/me') {
      return respond({ id: 1, email: 'admin.dgac@example.com', name: 'Administrador DGAC', role: 'admin', unit_access: ['GENERAL', 'RAN', 'FINANCIERO'] });
    }
    if (method === 'GET' && pathname === '/api/users') return respond(users);
    if (method === 'PATCH' && /^\/api\/users\/\d+\/role$/.test(pathname)) return respond(users[1]);
    if (method === 'PATCH' && /^\/api\/users\/\d+\/units$/.test(pathname)) return respond(users[1]);
    if (method === 'POST' && pathname === '/api/users') return respond(users[0]);
    if (method === 'DELETE' && /^\/api\/users\/\d+$/.test(pathname)) return respond({ message: 'Usuario eliminado' });
    if (method === 'GET' && pathname === '/api/supervisor/dashboard') return respond(dashboard);
    if (method === 'GET' && pathname === '/api/supervisor/report') return respond('registro,unidad,estado\nRAN-01-2026,RAN,Analista\n', 'text/csv');
    if (method === 'GET' && pathname === '/api/submissions/search') return respond(searchRows);
    return request.continue();
  });

  await page.goto(`${baseUrl}/auth`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => {
    sessionStorage.setItem('auth_token', 'token-admin-demostracion');
    sessionStorage.setItem('auth_user', JSON.stringify({
      id: 1,
      email: 'admin.dgac@example.com',
      name: 'Administrador DGAC',
      role: 'admin',
      unit_access: ['GENERAL', 'RAN', 'FINANCIERO']
    }));
  });
  return page;
}

(async () => {
  const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error('No se encontró un navegador compatible.');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-first-run', '--disable-features=Translate', '--window-size=1440,1000']
  });

  try {
    const adminPage = await setupPage(browser);
    await adminPage.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await adminPage.waitForSelector('app-admin-page table', { timeout: 15000 });
    await new Promise((resolve) => setTimeout(resolve, 700));
    await adminPage.screenshot({ path: path.join(outDir, '14-admin-usuarios.png'), fullPage: false });
    await adminPage.close();

    const supervisorPage = await setupPage(browser);
    await supervisorPage.goto(`${baseUrl}/supervision`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await supervisorPage.waitForSelector('.kpi-grid', { timeout: 15000 });
    await new Promise((resolve) => setTimeout(resolve, 700));
    await supervisorPage.screenshot({ path: path.join(outDir, '15-admin-dashboard-supervision.png'), fullPage: false });
    await supervisorPage.close();

    const searchPage = await setupPage(browser);
    await searchPage.goto(`${baseUrl}/busqueda`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await searchPage.waitForSelector('input', { timeout: 15000 });
    await searchPage.type('input', 'RAN FINANCIERO');
    await searchPage.keyboard.press('Enter');
    await searchPage.waitForSelector('table, .result, .results, .card', { timeout: 15000 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 900));
    await searchPage.screenshot({ path: path.join(outDir, '16-admin-busqueda.png'), fullPage: false });
    await searchPage.close();
  } finally {
    await browser.close();
  }
})();
