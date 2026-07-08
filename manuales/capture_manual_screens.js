const fs = require('fs');
const path = require('path');
const puppeteer = require('../backend/node_modules/puppeteer-core');
const jwt = require('../backend/node_modules/jsonwebtoken');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

const outDir = path.join(__dirname, 'assets');
const baseUrl = 'http://127.0.0.1:4200';
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];

function findBrowser() {
  const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) throw new Error('No se encontró Microsoft Edge o Google Chrome.');
  return executablePath;
}

async function settle(page) {
  await new Promise((resolve) => setTimeout(resolve, 1400));
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function capture(page, filename) {
  await settle(page);
  await page.screenshot({ path: path.join(outDir, filename), fullPage: false });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--no-first-run', '--disable-features=Translate', '--window-size=1440,1000']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

    await page.goto(`${baseUrl}/auth`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await capture(page, '01-inicio-sesion.png');

    await page.$$eval('button', (buttons) => {
      const target = buttons.find((button) => button.textContent.includes('Crear cuenta'));
      if (target) target.click();
    });
    await capture(page, '02-crear-cuenta.png');

    const user = {
      id: 999999,
      email: 'usuario.manual@example.com',
      name: 'Usuario de demostración',
      role: 'user',
      unit_access: []
    };
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '2h' });

    await page.evaluate(({ tokenValue, userValue }) => {
      sessionStorage.setItem('auth_token', tokenValue);
      sessionStorage.setItem('auth_user', JSON.stringify(userValue));
    }, { tokenValue: token, userValue: user });

    const screens = [
      ['/', '03-inicio-usuario.png'],
      ['/ran/formulario-2', '04-formulario-ran.png'],
      ['/financiero/solvencia-pago', '05-formulario-financiero.png'],
      ['/aila/permiso-trabajo', '06-formulario-aila.png'],
      ['/dvso/dvso-639', '07-formulario-dvso.png']
    ];

    for (const [route, filename] of screens) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await capture(page, filename);

      if (route === '/') {
        await page.hover('.units-menu');
        await capture(page, '03b-menu-unidades.png');
      }

      if (route === '/ran/formulario-2') {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise((resolve) => setTimeout(resolve, 700));
        await page.screenshot({ path: path.join(outDir, '04b-envio-ran.png'), fullPage: false });
      }
    }
  } finally {
    await browser.close();
  }
})();
