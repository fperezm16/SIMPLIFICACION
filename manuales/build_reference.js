const fs = require('fs');
const path = require('path');
const {
  AlignmentType,
  Document,
  Footer,
  Header,
  PageNumber,
  Packer,
  Paragraph,
  TextRun
} = require(path.join(process.env.TEMP, 'codex-docx-runtime', 'node_modules', 'docx'));

const output = path.join(__dirname, 'reference_manual.docx');
const gray = '666666';

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: 'Calibri', size: 22, color: '000000' },
        paragraph: { spacing: { after: 120, line: 300 } }
      }
    },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Subtitle', quickFormat: true, run: { font: 'Calibri', size: 52, bold: true, color: '0B2545' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 480, after: 160 } } },
      { id: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Calibri', size: 30, color: '2E74B5' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 240 } } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Calibri', size: 32, bold: true, color: '2E74B5' }, paragraph: { spacing: { before: 360, after: 200 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Calibri', size: 26, bold: true, color: '2E74B5' }, paragraph: { spacing: { before: 280, after: 140 }, keepNext: true, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Calibri', size: 24, bold: true, color: '1F4D78' }, paragraph: { spacing: { before: 200, after: 100 }, keepNext: true, outlineLevel: 2 } },
      { id: 'Caption', name: 'Caption', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Calibri', size: 18, italics: true, color: gray }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 140 } } }
    ]
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 } } },
    headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: 'DGAC  |  Sistema de trámites  |  Manual de usuario externo', font: 'Calibri', size: 17, color: gray })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Dirección General de Aeronáutica Civil  •  Página ', font: 'Calibri', size: 17, color: gray }), new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 17, color: gray })] })] }) },
    children: [new Paragraph('Referencia de estilos')]
  }]
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(output, buffer);
  process.stdout.write(`${output}\n`);
});
