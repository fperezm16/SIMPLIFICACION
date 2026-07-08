const fs = require('fs');
const path = require('path');
const docx = require(path.join(process.env.TEMP, 'codex-docx-runtime', 'node_modules', 'docx'));

const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  TextRun
} = docx;

const outDir = __dirname;
const assets = path.join(outDir, 'assets');
const output = path.join(outDir, 'Manual_de_Usuario_Externo_DGAC.docx');
const logo = path.join(__dirname, '..', 'frontend', 'src', 'assets', 'dgac-header.png');

const COLORS = {
  blue: '2E74B5',
  darkBlue: '1F4D78',
  navy: '0B2545',
  gray: '666666',
  lightBlue: 'EAF6FD',
  white: 'FFFFFF'
};

const p = (text, options = {}) => new Paragraph({
  alignment: options.alignment || AlignmentType.LEFT,
  spacing: { before: options.before ?? 0, after: options.after ?? 120, line: options.line ?? 300 },
  keepNext: options.keepNext || false,
  children: [new TextRun({
    text,
    font: 'Calibri',
    size: options.size || 22,
    bold: options.bold || false,
    italics: options.italics || false,
    color: options.color || '000000'
  })]
});

const h1 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_1, keepNext: true });
const h2 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, keepNext: true });
const h3 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_3, keepNext: true });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

const bullets = (items) => items.map((text) => new Paragraph({
  numbering: { reference: 'manual-bullets', level: 0 },
  spacing: { after: 80, line: 300 },
  children: [new TextRun({ text, font: 'Calibri', size: 22 })]
}));

const numbered = (items) => items.map((text) => new Paragraph({
  numbering: { reference: 'manual-numbering', level: 0 },
  spacing: { after: 80, line: 300 },
  children: [new TextRun({ text, font: 'Calibri', size: 22 })]
}));

const note = (label, text) => new Paragraph({
  spacing: { before: 120, after: 160, line: 300 },
  indent: { left: 180, right: 180 },
  shading: { type: ShadingType.CLEAR, fill: COLORS.lightBlue, color: 'auto' },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color: COLORS.blue, space: 8 } },
  children: [
    new TextRun({ text: `${label}: `, font: 'Calibri', size: 22, bold: true, color: COLORS.darkBlue }),
    new TextRun({ text, font: 'Calibri', size: 22 })
  ]
});

function image(filename, caption, width = 590, height = 410) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 40 },
      keepNext: true,
      children: [new ImageRun({
        data: fs.readFileSync(path.join(assets, filename)),
        type: 'png',
        transformation: { width, height },
        altText: { title: caption, description: caption, name: filename }
      })]
    }),
    p(caption, { size: 18, italics: true, color: COLORS.gray, alignment: AlignmentType.CENTER, after: 140 })
  ];
}

const children = [];

// Portada: patrón editorial_cover.
children.push(
  p('', { after: 360 }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 640 },
    children: [new ImageRun({
      data: fs.readFileSync(logo),
      type: 'png',
      transformation: { width: 330, height: 82 },
      altText: { title: 'DGAC', description: 'Logotipo de la Dirección General de Aeronáutica Civil', name: 'dgac-header.png' }
    })]
  }),
  p('MANUAL DE USUARIO EXTERNO', { size: 52, bold: true, color: COLORS.navy, alignment: AlignmentType.CENTER, after: 200 }),
  p('Sistema de trámites en línea', { size: 34, color: COLORS.blue, alignment: AlignmentType.CENTER, after: 360 }),
  p('Guía para crear una cuenta, presentar solicitudes y consultar el avance de sus gestiones.', { size: 24, color: COLORS.gray, alignment: AlignmentType.CENTER, after: 960 }),
  p('Versión 1.0', { bold: true, color: COLORS.darkBlue, alignment: AlignmentType.CENTER, after: 60 }),
  p('Junio de 2026', { color: COLORS.gray, alignment: AlignmentType.CENTER, after: 60 }),
  p('Dirección General de Aeronáutica Civil de Guatemala', { size: 20, italics: true, color: COLORS.gray, alignment: AlignmentType.CENTER }),
  pageBreak()
);

children.push(
  h1('1. Acerca de este manual'),
  p('Este manual está dirigido a personas y empresas que utilizan el sistema de trámites de la DGAC para presentar solicitudes, adjuntar documentos y consultar el avance de sus gestiones.'),
  h2('1.1 Antes de comenzar'),
  ...bullets([
    'Utilice una computadora o dispositivo con conexión estable a Internet.',
    'Tenga acceso a un correo electrónico activo; allí recibirá enlaces de verificación y recuperación.',
    'Prepare los documentos solicitados en formato PDF y respete el tamaño máximo mostrado en cada formulario.',
    'Use información que coincida con sus documentos oficiales y revise los datos antes de guardar.'
  ]),
  h2('1.2 Recorrido general'),
  ...numbered([
    'Crear y verificar la cuenta de usuario.',
    'Iniciar sesión con correo y contraseña.',
    'Elegir la unidad y el trámite correspondiente.',
    'Completar los campos y adjuntar los documentos requeridos.',
    'Guardar la solicitud y conservar el correlativo asignado.',
    'Consultar el estado, atender correcciones y descargar documentos cuando estén disponibles.'
  ]),
  note('Importante', 'Los campos marcados con asterisco (*) son obligatorios. El sistema no permitirá guardar una solicitud incompleta.'),
  pageBreak()
);

children.push(
  h1('2. Crear una cuenta'),
  ...numbered([
    'Abra el portal de trámites y seleccione la pestaña Crear cuenta.',
    'Escriba su nombre completo, correo electrónico y una contraseña segura.',
    'Pulse Crear cuenta.',
    'Revise su correo electrónico y abra el enlace de verificación enviado por el sistema.'
  ]),
  note('Contraseña', 'Debe tener al menos 8 caracteres e incluir una letra mayúscula, un número y un carácter especial, por ejemplo: ! @ # $ %.'),
  ...image('02-crear-cuenta.png', 'Figura 1. Pantalla para crear una cuenta de usuario.'),
  pageBreak()
);

children.push(
  h1('3. Iniciar sesión'),
  ...numbered([
    'Seleccione Iniciar sesión.',
    'Ingrese el correo electrónico registrado.',
    'Escriba su contraseña.',
    'Complete la verificación reCAPTCHA cuando aparezca.',
    'Pulse Entrar.'
  ]),
  ...image('01-inicio-sesion.png', 'Figura 2. Pantalla de inicio de sesión.'),
  note('Si no puede entrar', 'Confirme que el correo fue verificado y que no haya espacios antes o después del correo. Si olvidó la contraseña, utilice el enlace correspondiente.'),
  pageBreak()
);

children.push(
  h1('4. Conocer la pantalla de inicio'),
  p('Al iniciar sesión verá el nombre del usuario, el botón Cerrar sesión, el acceso Inicio y el menú Unidades. La pantalla Inicio muestra las gestiones realizadas y su avance.'),
  ...image('03-inicio-usuario.png', 'Figura 3. Pantalla de inicio de un usuario sin gestiones registradas.', 470, 326),
  h2('4.1 Menú Unidades'),
  p('Coloque el puntero sobre Unidades para consultar los módulos disponibles. Después, coloque el puntero sobre una unidad para elegir un trámite específico.'),
  ...image('03b-menu-unidades.png', 'Figura 4. Menú de unidades habilitadas para el usuario externo.', 470, 326),
  pageBreak()
);

children.push(
  h1('5. Elegir y completar un trámite'),
  p('Seleccione la unidad responsable del trámite. La disponibilidad puede variar según la configuración institucional.'),
  ...bullets([
    'RAN: reserva, prórroga o cesión de matrícula; certificaciones; y trámites UAV/RPA.',
    'DVSO: formularios técnicos como DVSO-623, 623A, 639, 639A, 800, 801 y DVSO-OPS-805.',
    'Financiero: solvencia financiera y contraseña de pago de otros rubros.',
    'AILA: permisos de ingreso o trabajos de infraestructura, cuando el acceso esté habilitado.'
  ]),
  h2('5.1 Reglas generales de llenado'),
  ...bullets([
    'Complete todos los campos obligatorios identificados con asterisco (*).',
    'Seleccione correctamente el tipo de persona, gestión o permiso.',
    'Escriba teléfonos, NIT, matrícula y fechas con el formato solicitado.',
    'No cierre la pestaña mientras carga documentos o guarda la solicitud.'
  ]),
  ...image('04-formulario-ran.png', 'Figura 5. Ejemplo de formulario del Registro Aeronáutico Nacional.', 540, 375),
  pageBreak()
);

children.push(
  h1('6. Adjuntar documentos y guardar'),
  ...numbered([
    'Ubique cada sección de documentos requeridos.',
    'Pulse Seleccionar PDF y elija el archivo correspondiente.',
    'Verifique que el nombre del archivo aparezca en pantalla.',
    'Repita el proceso para todos los documentos obligatorios.',
    'Revise la información y pulse Guardar una sola vez.',
    'Espere el mensaje de confirmación y anote el correlativo asignado.'
  ]),
  ...image('04b-envio-ran.png', 'Figura 6. Área de carga de PDF y botón Guardar.', 540, 375),
  note('Archivos PDF', 'En el ejemplo, el límite indicado es de 10 MB por PDF. Si otro formulario muestra un límite diferente, prevalece el valor presentado en pantalla.'),
  pageBreak()
);

children.push(
  h1('7. Solicitudes del Departamento Financiero'),
  p('El módulo Financiero permite seleccionar la gestión correspondiente y completar los datos de facturación. Lea el título del formulario antes de comenzar para confirmar que eligió la solicitud correcta.'),
  ...bullets([
    'Ingrese NIT, nombre del arrendatario o dueño de la aeronave y datos de contacto.',
    'Complete los datos del solicitante exactamente como aparecen en su documento.',
    'Adjunte la carta de representación y los documentos que solicite la gestión.',
    'Después del procesamiento, revise Inicio para descargar la boleta o el documento disponible.'
  ]),
  ...image('05-formulario-financiero.png', 'Figura 7. Ejemplo de solicitud de solvencia de pago.', 540, 375),
  pageBreak()
);

children.push(
  h1('8. Solicitudes de AILA'),
  p('Cuando el módulo esté habilitado, el formulario de AILA permite gestionar permisos para trabajos de infraestructura e ingreso o egreso de herramientas, mercadería y mobiliario.'),
  ...numbered([
    'Seleccione permiso genérico o permiso urgente, según corresponda.',
    'Complete los datos del permiso, empresa, área de ingreso y motivo.',
    'Registre las personas, vehículos, herramientas o bienes solicitados.',
    'Adjunte los documentos requeridos y guarde la solicitud.'
  ]),
  ...image('06-formulario-aila.png', 'Figura 8. Clasificación y datos iniciales de una solicitud de AILA.', 540, 375),
  note('Anticipación', 'La pantalla indica que las solicitudes genéricas deben gestionarse con 72 horas de anticipación. Utilice la opción urgente únicamente cuando la situación corresponda.'),
  pageBreak()
);

children.push(
  h1('9. Formularios DVSO'),
  p('Los formularios DVSO reproducen la estructura del formato técnico correspondiente. Seleccione cuidadosamente el código del formulario antes de ingresar información.'),
  ...bullets([
    'DVSO-623: certificado de aeronavegabilidad para exportación, ala fija.',
    'DVSO-623A: certificado de aeronavegabilidad para exportación, helicóptero.',
    'DVSO-639 y DVSO-639A: solicitud y anexo para certificado de exportación.',
    'DVSO-800: permiso de vuelo especial.',
    'DVSO-801: dictamen técnico para RPA.',
    'DVSO-OPS-805: autorización para RPA o dron de turistas.'
  ]),
  h2('9.1 Recomendaciones'),
  ...numbered([
    'Use Descargar formato original si necesita consultar el documento oficial.',
    'Complete los datos técnicos tal como aparecen en la documentación de la aeronave.',
    'Revise fechas, matrícula, fabricante, modelo y número de serie.',
    'Adjunte los archivos solicitados y guarde la solicitud.'
  ]),
  note('Precisión técnica', 'Si tiene dudas sobre qué formulario corresponde, confirme primero con la unidad DVSO. Evite enviar el mismo trámite en formularios diferentes.'),
  pageBreak()
);

children.push(
  h1('10. Consultar el estado de una gestión'),
  p('Abra Inicio para consultar sus solicitudes. Las gestiones se agrupan por unidad y muestran el correlativo, estado, fecha y porcentaje de avance.'),
  ...bullets([
    'Actualizar: vuelve a consultar la información más reciente.',
    'Realizar correcciones: aparece cuando la unidad devuelve la solicitud y muestra el motivo.',
    'Descargar formulario: aparece cuando el documento aprobado está disponible.',
    'Descargar boleta de pago: aparece en los procesos financieros que ya cuentan con boleta.',
    'Descargar permiso o documento firmado: aparece cuando la unidad publica el documento final.',
    'Calificar servicio: permite valorar una gestión finalizada.'
  ]),
  h2('10.1 Atender una corrección'),
  ...numbered([
    'Lea completamente el motivo mostrado en la tarjeta de la gestión.',
    'Pulse Realizar correcciones.',
    'Modifique únicamente los datos o documentos solicitados.',
    'Revise el formulario y vuelva a enviarlo.'
  ]),
  note('Correlativo', 'Conserve el código asignado. Facilita la identificación del trámite cuando solicite asistencia.'),
  pageBreak()
);

children.push(
  h1('11. Recuperar la contraseña'),
  ...numbered([
    'En la pantalla de acceso pulse Olvidé mi contraseña.',
    'Ingrese el correo registrado y complete reCAPTCHA si aparece.',
    'Pulse Enviar enlace.',
    'Abra el mensaje recibido y siga el enlace para crear una contraseña nueva.',
    'Confirme la nueva contraseña e inicie sesión.'
  ]),
  h2('11.1 Seguridad de la cuenta'),
  ...bullets([
    'No comparta su contraseña ni los enlaces de recuperación.',
    'Cierre la sesión al utilizar equipos compartidos.',
    'No envíe documentos personales por medios distintos a los indicados por la DGAC.',
    'Verifique que se encuentra en el dominio institucional antes de ingresar credenciales.'
  ]),
  h2('11.2 Problemas frecuentes'),
  ...bullets([
    'No llega el correo: revise Spam o Correo no deseado y confirme que escribió correctamente la dirección.',
    'No se carga un PDF: confirme que sea PDF, que no esté dañado y que cumpla el límite de tamaño.',
    'El formulario no guarda: revise los campos con asterisco y los mensajes en color rojo.',
    'La información no cambia: pulse Actualizar en Inicio y espere unos segundos.'
  ]),
  pageBreak()
);

children.push(
  h1('12. Asistencia y control de versión'),
  p('Cuando solicite asistencia, indique su nombre, correo registrado, correlativo del trámite, unidad responsable y una descripción breve del inconveniente. No envíe contraseñas.'),
  note('Evidencia útil', 'Si es posible, adjunte una captura del mensaje de error sin mostrar información personal sensible.'),
  h2('12.1 Datos del manual'),
  ...bullets([
    'Documento: Manual de Usuario Externo - Sistema de Trámites DGAC.',
    'Versión: 1.0.',
    'Fecha: junio de 2026.',
    'Alcance: registro, ingreso, presentación, seguimiento, correcciones y descargas para usuarios externos.'
  ]),
  p('Fin del documento.', { bold: true, color: COLORS.darkBlue, alignment: AlignmentType.CENTER, before: 960 })
);

const document = new Document({
  creator: 'Dirección General de Aeronáutica Civil',
  title: 'Manual de Usuario Externo - Sistema de Trámites DGAC',
  subject: 'Registro, presentación y seguimiento de trámites en línea',
  description: 'Manual de uso del sistema de trámites DGAC para usuarios externos.',
  styles: {
    default: {
      document: {
        run: { font: 'Calibri', size: 22, color: '000000' },
        paragraph: { spacing: { after: 120, line: 300 } }
      }
    },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Calibri', size: 32, bold: true, color: COLORS.blue },
        paragraph: { spacing: { before: 360, after: 200 }, keepNext: true, outlineLevel: 0 }
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Calibri', size: 26, bold: true, color: COLORS.blue },
        paragraph: { spacing: { before: 280, after: 140 }, keepNext: true, outlineLevel: 1 }
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: 'Calibri', size: 24, bold: true, color: COLORS.darkBlue },
        paragraph: { spacing: { before: 200, after: 100 }, keepNext: true, outlineLevel: 2 }
      }
    ]
  },
  numbering: {
    config: [
      {
        reference: 'manual-numbering',
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } }, run: { font: 'Calibri', size: 22, bold: true, color: COLORS.darkBlue } }
        }]
      },
      {
        reference: 'manual-bullets',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } }, run: { font: 'Calibri', size: 22, color: COLORS.blue } }
        }]
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 }
      }
    },
    headers: {
      default: new Header({
        children: [p('DGAC  |  Sistema de trámites  |  Manual de usuario externo', { size: 17, color: COLORS.gray, after: 0 })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: 'Dirección General de Aeronáutica Civil  •  Página ', font: 'Calibri', size: 17, color: COLORS.gray }),
            new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 17, color: COLORS.gray })
          ]
        })]
      })
    },
    children
  }]
});

Packer.toBuffer(document).then((buffer) => {
  fs.writeFileSync(output, buffer);
  process.stdout.write(`${output}\n`);
});
