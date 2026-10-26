const fs = require('fs');
const path = require('path');

const runtimeModule = path.join(
  process.env.TEMP,
  'codex-html-docx-runtime',
  'node_modules',
  'html-to-docx'
);
const HTMLtoDOCX = require(runtimeModule);

const source = path.join(__dirname, 'Formato_Definicion_Flujo_Firma_RAN_Financiero.html');
const output = path.join(__dirname, 'Formato_Definicion_Flujo_Firma_RAN_Financiero.docx');

async function main() {
  const logoPath = path.join(__dirname, '..', 'frontend', 'src', 'assets', 'dgac-header.png');
  const logoData = fs.readFileSync(logoPath).toString('base64');
  const html = fs.readFileSync(source, 'utf8').replace(
    '../frontend/src/assets/dgac-header.png',
    `data:image/png;base64,${logoData}`
  );
  const buffer = await HTMLtoDOCX(html, null, {
    title: 'Formato de definicion del flujo de firma electronica',
    subject: 'Levantamiento funcional para RAN y Financiero',
    creator: 'DGAC',
    keywords: ['firma electronica', 'RAN', 'Financiero', 'flujo'],
    pageSize: { width: 12240, height: 15840 },
    margins: { top: 900, right: 900, bottom: 900, left: 900 },
    table: { row: { cantSplit: true } },
    font: 'Aptos',
    fontSize: 21,
    footer: true,
    pageNumber: true
  });
  fs.writeFileSync(output, buffer);
  process.stdout.write(`${output}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
