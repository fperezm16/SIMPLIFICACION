const fs = require('fs');
const path = require('path');
const puppeteer = require('../backend/node_modules/puppeteer-core');

const outFile = path.join(__dirname, 'assets', '08-procesos-usuario.png');
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];

const rows = [
  {
    id: 1001,
    created_at: '2026-06-22T14:30:00.000Z',
    fecha: '2026-06-22',
    unidad_clave: 'RAN',
    gestion_nombre: 'Reserva, Prórroga o Cesión de Matrícula',
    registro_codigo: 'RAN-06-2026-0001',
    nombre_propietario: 'Usuario de demostración',
    correo: 'usuario.manual@example.com',
    matricula_tg: 'TG-DEM',
    process_label: 'Solicitud enviada',
    process_percent: 25,
    tipo_reservacion: true,
    tipo_internacion: false,
    tipo_inscripcion: false,
    tipo_certificado_prov: false,
    tipo_reposicion: false,
    tipo_cambio_prop: false,
    tipo_cambio_datos: false,
    tipo_certificacion: false
  },
  {
    id: 1002,
    created_at: '2026-06-22T15:10:00.000Z',
    fecha: '2026-06-22',
    unidad_clave: 'FINANCIERO',
    gestion_nombre: 'Solicitud para emisión de solvencia financiera',
    registro_codigo: 'FINANCIERO-06-2026-0001',
    nombre_propietario: 'Empresa de demostración',
    correo: 'usuario.manual@example.com',
    matricula_tg: 'TG-DEM',
    process_label: 'En revisión por analista',
    process_percent: 68,
    assigned_analista_id: 10,
    tipo_reservacion: false,
    tipo_internacion: false,
    tipo_inscripcion: false,
    tipo_certificado_prov: false,
    tipo_reposicion: false,
    tipo_cambio_prop: false,
    tipo_cambio_datos: false,
    tipo_certificacion: false
  }
];

(async () => {
  const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error('No se encontró un navegador compatible.');

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-first-run', '--disable-features=Translate', '--window-size=1440,1000']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.method() === 'GET' && /\/api\/my-submissions(?:\?|$)/.test(request.url())) {
        console.log(`Interceptando ${request.url()}`);
        request.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4200' },
          body: JSON.stringify(rows)
        });
      } else {
        request.continue();
      }
    });

    await page.goto('http://127.0.0.1:4200/auth', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => {
      sessionStorage.setItem('auth_token', 'token-de-demostracion');
      sessionStorage.setItem('auth_user', JSON.stringify({
        id: 999999,
        email: 'usuario.manual@example.com',
        name: 'Usuario de demostración',
        role: 'user',
        unit_access: []
      }));
    });

    await page.goto('http://127.0.0.1:4200/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await page.waitForSelector('.card', { timeout: 10000 });
    } catch (error) {
      console.log(`URL=${page.url()}`);
      console.log(await page.$eval('body', (body) => body.innerText));
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    await page.screenshot({ path: outFile, fullPage: false });
  } finally {
    await browser.close();
  }
})();
