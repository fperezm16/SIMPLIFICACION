const fs = require('fs');
const path = require('path');
const puppeteer = require(path.join(process.cwd(), 'backend', 'node_modules', 'puppeteer-core'));
const jwt = require(path.join(process.cwd(), 'backend', 'node_modules', 'jsonwebtoken'));
require(path.join(process.cwd(), 'backend', 'node_modules', 'dotenv')).config({ path: path.join(process.cwd(), 'backend', '.env') });

const outDir = path.join(process.cwd(), 'manuales', 'revision_internos', 'capturas_portal');
fs.mkdirSync(outDir, { recursive: true });
const baseUrl = 'http://localhost:4200';
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
function findBrowser(){ const p = browserCandidates.find(fs.existsSync); if(!p) throw new Error('No se encontró Edge o Chrome'); return p; }
async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function setupUser(page, user){
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '2h' });
  await page.goto(`${baseUrl}/auth`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(({token,user})=>{
    sessionStorage.setItem('auth_token', token);
    sessionStorage.setItem('auth_user', JSON.stringify(user));
  }, { token, user });
}
async function cleanAndShot(page, file, fullPage=false){
  await sleep(1400);
  await page.evaluate(() => { window.scrollTo(0,0); document.body.style.zoom = '0.9'; });
  await sleep(300);
  await page.screenshot({ path: path.join(outDir, file), fullPage });
}
async function clickText(page, text){
  await page.evaluate((text)=>{
    const all = Array.from(document.querySelectorAll('button,a'));
    const el = all.find(e => (e.textContent || '').trim().toLowerCase().includes(text.toLowerCase()));
    if(el) el.click();
  }, text);
  await sleep(1200);
}
(async()=>{
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, args: ['--no-first-run','--disable-features=Translate','--window-size=1440,1000'] });
  try{
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    page.setDefaultTimeout(30000);

    const revisorRan = { id: 27, email: 'r1@gmail.com', name: 'Recepción RAN', role: 'revisor', unit_access: ['RAN'] };
    const aprobadorFin = { id: 25, email: 'f4@gmail.com', name: 'Aprobador Financiero', role: 'aprobador', unit_access: ['FINANCIERO'] };
    const admin = { id: 3, email: 'admin@gmail.com', name: 'admin', role: 'admin', unit_access: ['GENERAL','RAN','DVSO','AILA','FINANCIERO'] };

    await setupUser(page, revisorRan);
    await page.goto(`${baseUrl}/revision`, { waitUntil: 'networkidle2', timeout: 30000 });
    await cleanAndShot(page, '01-modulo-revision-ran.png');
    await clickText(page, 'Archivo');
    await cleanAndShot(page, '02-modulo-archivo-real.png');

    await setupUser(page, aprobadorFin);
    await page.goto(`${baseUrl}/revision`, { waitUntil: 'networkidle2', timeout: 30000 });
    await cleanAndShot(page, '03-revision-aprobador-financiero.png');
    await clickText(page, 'Dashboard');
    await cleanAndShot(page, '04-dashboard-real.png', true);
    await clickText(page, 'Procesos aprobados');
    await cleanAndShot(page, '05-procesos-aprobados-real.png', true);

    await setupUser(page, admin);
    await page.goto(`${baseUrl}/busqueda`, { waitUntil: 'networkidle2', timeout: 30000 });
    await cleanAndShot(page, '06-busqueda-real.png');
    await page.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle2', timeout: 30000 });
    await cleanAndShot(page, '07-admin-roles-real.png', true);

    console.log(outDir);
  } finally { await browser.close(); }
})();



