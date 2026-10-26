import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { API_BASE } from './api.config';
import { AuthService } from './auth.service';

type TransportFieldType = 'text' | 'email' | 'tel' | 'textarea' | 'date';

type TransportField = {
  key: string;
  label: string;
  type?: TransportFieldType;
  required?: boolean;
  full?: boolean;
  rows?: number;
};

type TransportTable = {
  key: string;
  title: string;
  rows: number;
  columns: Array<{ key: string; label: string }>;
};

type TransportOption = {
  key: string;
  label: string;
};

type TransportAttachment = {
  key: string;
  label: string;
  requiredWhenOption?: string;
};

type TransportPayloadMap = {
  nameField: string;
  addressField: string;
  phoneField: string;
  emailField: string;
  notesField?: string;
};

type TransportFormConfig = {
  slug: string;
  code: string;
  menuLabel: string;
  title: string;
  subtitle: string;
  pdfAsset: string;
  fields: TransportField[];
  optionsTitle?: string;
  options?: TransportOption[];
  tables: TransportTable[];
  attachments: TransportAttachment[];
  payloadMap: TransportPayloadMap;
};

const TRANSPORT_FORMS: TransportFormConfig[] = [
  {
    slug: 'trabajos-aereos-servicios-auxiliares',
    code: 'TA-01-2025',
    menuLabel: 'Certificado de explotación a trabajos aéreos/servicios auxiliares',
    title: 'SOLICITUD DEPARTAMENTO DE TRANSPORTE AÉREO CERTIFICADO DE EXPLOTACIÓN A TRABAJOS AÉREOS/SERVICIOS AUXILIARES',
    subtitle: 'Solicitud de certificado de explotación para trabajos aéreos o servicios auxiliares.',
    pdfAsset: 'assets/transporte-aereo/solicitud-certificado-explotacion-trabajos-aereos-servicios-auxiliares-2025.pdf',
    payloadMap: {
      nameField: 'entidad',
      addressField: 'direccion',
      phoneField: 'telefono',
      emailField: 'correo_electronico',
      notesField: 'trabajo_aereo_de'
    },
    fields: [
      { key: 'fecha_solicitud', label: 'Fecha de solicitud', type: 'date', required: true, full: true },
      { key: 'entidad', label: 'Entidad', required: true, full: true },
      { key: 'representante_legal', label: 'Representante legal', required: true, full: true },
      { key: 'direccion', label: 'Dirección', required: true, full: true },
      { key: 'telefono', label: 'Teléfono', type: 'tel', required: true },
      { key: 'correo_electronico', label: 'Correo electrónico', type: 'email', required: true },
      { key: 'trabajo_aereo_de', label: 'Trabajo aéreo de', type: 'textarea', rows: 2, full: true },
      { key: 'servicio_naturaleza_tecnica_de', label: 'Servicio de naturaleza técnica de', type: 'textarea', rows: 2, full: true },
      { key: 'observaciones', label: 'Observaciones', type: 'textarea', rows: 2, full: true }
    ],
    optionsTitle: 'Tipo de servicio',
    options: [
      { key: 'organizacion_mantenimiento_aprobada', label: 'Organización de mantenimiento aprobada' },
      { key: 'escuela_instruccion', label: 'Escuela de instrucción' }
    ],
    tables: [
      {
        key: 'aeronaves',
        title: 'Aeronave de instrucción o trabajos aéreos',
        rows: 2,
        columns: [
          { key: 'tipo', label: 'Tipo' },
          { key: 'matricula', label: 'Matrícula' },
          { key: 'serie', label: 'Serie' }
        ]
      },
      {
        key: 'habilitacion',
        title: 'Habilitación para escuela o naturaleza técnica',
        rows: 3,
        columns: [
          { key: 'habilitacion', label: 'Habilitación' },
          { key: 'descripcion', label: 'Descripción' }
        ]
      }
    ],
    attachments: [
      { key: 'patentes_nombramiento', label: 'Patentes de la empresa y nombramiento del representante legal.' },
      { key: 'poliza_seguros', label: 'Póliza de seguros de la empresa, incluyendo las aeronaves.' },
      { key: 'contrato_arrendamiento', label: 'Contrato de arrendamiento de aeronave, si no fueren propiedad de la empresa.' },
      { key: 'dictamen_tecnico_favorable', label: 'Haber culminado su proceso de certificación, dictamen técnico favorable DVSO / Departamento de Licencias.' }
    ]
  },
  {
    slug: 'linea-aerea',
    code: 'TA-02-2025',
    menuLabel: 'Certificado de explotación de una línea aérea',
    title: 'DEPARTAMENTO DE TRANSPORTE AÉREO SOLICITUD CERTIFICADO DE EXPLOTACIÓN DE UNA LÍNEA AÉREA',
    subtitle: 'Solicitud de certificado de explotación para operación de línea aérea.',
    pdfAsset: 'assets/transporte-aereo/solicitud-certificado-explotacion-linea-aerea-2025.pdf',
    payloadMap: {
      nameField: 'linea_aerea',
      addressField: 'direccion',
      phoneField: 'telefono',
      emailField: 'correo_electronico',
      notesField: 'tipo_servicio'
    },
    fields: [
      { key: 'fecha_solicitud', label: 'Fecha de solicitud', type: 'date', required: true, full: true },
      { key: 'representante_legal', label: 'Representante legal', required: true, full: true },
      { key: 'linea_aerea', label: 'Línea aérea', required: true, full: true },
      { key: 'direccion', label: 'Dirección', required: true, full: true },
      { key: 'telefono', label: 'Teléfono', type: 'tel', required: true },
      { key: 'correo_electronico', label: 'Correo electrónico', type: 'email', required: true },
      { key: 'tipo_servicio', label: 'Tipo de servicio', required: true, full: true },
      { key: 'observaciones', label: 'Observaciones', type: 'textarea', rows: 2, full: true }
    ],
    tables: [
      {
        key: 'rutas',
        title: 'No. de vuelo / rutas / horario / frecuencias',
        rows: 2,
        columns: [
          { key: 'numero_vuelo', label: 'No. vuelo' },
          { key: 'origen', label: 'Origen' },
          { key: 'sale', label: 'Sale' },
          { key: 'destino', label: 'Destino' },
          { key: 'llega', label: 'Llega' },
          { key: 'dias', label: 'Días' }
        ]
      },
      {
        key: 'aeronaves',
        title: 'Aeronaves',
        rows: 2,
        columns: [
          { key: 'tipo', label: 'Tipo' },
          { key: 'matricula', label: 'Matrícula' },
          { key: 'serie', label: 'Serie' }
        ]
      }
    ],
    attachments: [
      { key: 'patentes_nombramiento', label: 'Patentes de la empresa y nombramiento del representante legal.' },
      { key: 'poliza_seguros', label: 'Póliza de seguros de la empresa, incluya las aeronaves (Convenio de Montreal 1999).' },
      { key: 'certificados_aeronave', label: 'Certificado de aeronavegabilidad y certificado de matrícula.' },
      { key: 'contrato_arrendamiento', label: 'Contrato de arrendamiento de aeronave, si no fueren propiedad de la empresa.' },
      { key: 'certificado_operador_aereo', label: 'Certificado de operador aéreo, operaciones específicas.' },
      { key: 'cartas_rutas_vuelo', label: 'Cartas actualizadas y adecuadas para las rutas de vuelo.' },
      { key: 'lista_verificacion_seguridad', label: 'Lista de verificación del procedimiento del registro de seguridad de la aeronave.' },
      { key: 'manual_vuelo_operaciones', label: 'Manual de vuelo o documento de performance, manual de operaciones del explotador.' },
      { key: 'contrato_asistencia_tecnica', label: 'Contrato de servicios de asistencia técnica.' },
      { key: 'programa_seguridad_avsec', label: 'Aprobación del programa de seguridad AVSEC.' },
      { key: 'capacidad_financiera', label: 'Capacidad financiera de la empresa.' },
      { key: 'carta_designacion_reciprocidad', label: 'Carta de designación o de reciprocidad.' },
      { key: 'solvencia_cocesna', label: 'Solvencia de pagos con COCESNA, si opera vuelos internacionales.' },
      { key: 'certificacion_culminada', label: 'Haber culminado su proceso de certificación, empresas nacionales.' }
    ]
  },
  {
    slug: 'modificacion-horarios-rutas-frecuencias',
    code: 'TA-03-2025',
    menuLabel: 'Modificación de horarios, rutas y frecuencias',
    title: 'SOLICITUD DEPARTAMENTO DE TRANSPORTE AÉREO MODIFICACIÓN DE HORARIOS, RUTAS Y FRECUENCIAS',
    subtitle: 'Solicitud para cancelar o incorporar rutas y modificar horarios o frecuencias.',
    pdfAsset: 'assets/transporte-aereo/solicitud-modificacion-horarios-rutas-frecuencias-2025.pdf',
    payloadMap: {
      nameField: 'entidad',
      addressField: 'direccion',
      phoneField: 'telefono',
      emailField: 'correo_electronico',
      notesField: 'observaciones'
    },
    fields: [
      { key: 'fecha_solicitud', label: 'Fecha de solicitud', type: 'date', required: true, full: true },
      { key: 'entidad', label: 'Entidad', required: true, full: true },
      { key: 'representante_legal', label: 'Representante legal', required: true, full: true },
      { key: 'direccion', label: 'Dirección', required: true, full: true },
      { key: 'telefono', label: 'Teléfono', type: 'tel', required: true },
      { key: 'correo_electronico', label: 'Correo electrónico', type: 'email', required: true },
      { key: 'fecha_cancelacion', label: 'Fecha de cancelación', type: 'date' },
      { key: 'fecha_inicio', label: 'Fecha de inicio', type: 'date' },
      { key: 'observaciones', label: 'Observaciones', type: 'textarea', rows: 3, full: true }
    ],
    optionsTitle: 'Tipo de solicitud',
    options: [
      { key: 'incorporacion_ruta', label: 'Incorporación de ruta' },
      { key: 'modificacion_horario', label: 'Modificación de horario' },
      { key: 'modificacion_frecuencia', label: 'Modificación de frecuencia' }
    ],
    tables: [
      {
        key: 'rutas_canceladas',
        title: 'Ruta cancelada',
        rows: 2,
        columns: [
          { key: 'numero_vuelo', label: 'No. vuelo' },
          { key: 'origen', label: 'Origen' },
          { key: 'destino', label: 'Destino' },
          { key: 'dias', label: 'Días' }
        ]
      },
      {
        key: 'rutas_modificadas',
        title: 'Incorporación o modificación de ruta',
        rows: 3,
        columns: [
          { key: 'numero_vuelo', label: 'No. vuelo' },
          { key: 'origen', label: 'Origen' },
          { key: 'hora_salida', label: 'Hora' },
          { key: 'destino', label: 'Destino' },
          { key: 'hora_llegada', label: 'Hora' },
          { key: 'dias', label: 'Días' }
        ]
      }
    ],
    attachments: [
      { key: 'dictamen_tecnico_favorable_dvso', label: 'Dictamen Técnico Favorable (DVSO).' },
      {
        key: 'autorizacion_estado_origen',
        label: 'Autorización del estado de origen de la empresa (nuevas rutas).',
        requiredWhenOption: 'incorporacion_ruta'
      }
    ]
  },
  {
    slug: 'permiso-temporal-no-regular',
    code: 'TA-04-2024',
    menuLabel: 'Permiso temporal de explotación comercial no regular',
    title: 'DEPARTAMENTO DE TRANSPORTE AÉREO SOLICITUD PERMISO TEMPORAL DE EXPLOTACIÓN (VUELO COMERCIAL NO REGULAR)',
    subtitle: 'Solicitud de permiso temporal de explotación para vuelo comercial no regular.',
    pdfAsset: 'assets/transporte-aereo/solicitud-permiso-temporal-explotacion-comercial-no-regular-2024.pdf',
    payloadMap: {
      nameField: 'entidad',
      addressField: 'direccion',
      phoneField: 'telefono',
      emailField: 'correo_electronico',
      notesField: 'tipo_operacion'
    },
    fields: [
      { key: 'fecha_solicitud', label: 'Fecha de solicitud', type: 'date', required: true, full: true },
      { key: 'entidad', label: 'Entidad', required: true, full: true },
      { key: 'representante_legal', label: 'Representante legal', required: true, full: true },
      { key: 'direccion', label: 'Dirección', required: true, full: true },
      { key: 'telefono', label: 'Teléfono', type: 'tel', required: true },
      { key: 'correo_electronico', label: 'Correo electrónico', type: 'email', required: true },
      { key: 'observaciones', label: 'Observaciones', type: 'textarea', rows: 2, full: true }
    ],
    optionsTitle: 'Tipo de operación',
    options: [
      { key: 'no_regular_pasajeros', label: 'No regular / pasajeros' },
      { key: 'no_regular_carga', label: 'No regular / carga' }
    ],
    tables: [
      {
        key: 'aeronave',
        title: 'Aeronave',
        rows: 2,
        columns: [
          { key: 'tipo', label: 'Tipo' },
          { key: 'matricula', label: 'Matrícula' }
        ]
      },
      {
        key: 'detalles_operacion',
        title: 'Detalles de la operación',
        rows: 3,
        columns: [
          { key: 'numero_vuelo', label: 'No. vuelo' },
          { key: 'origen', label: 'Origen' },
          { key: 'hora_salida', label: 'Hora' },
          { key: 'destino', label: 'Destino' },
          { key: 'hora_llegada', label: 'Hora' },
          { key: 'dias', label: 'Días' }
        ]
      }
    ],
    attachments: [
      { key: 'patentes_nombramiento', label: 'Patentes de la empresa y nombramiento del representante legal solicitante.' },
      { key: 'certificado_operador_aereo', label: 'Certificado de operador aéreo, línea aérea operadora o contratada.' },
      { key: 'certificado_matricula', label: 'Certificado de matrícula.' },
      { key: 'certificado_aeronavegabilidad', label: 'Certificado de aeronavegabilidad.' },
      { key: 'poliza_seguro', label: 'Póliza de seguro que incluya la aeronave (Convenio de Montreal 1999).' },
      { key: 'contrato_arrendamiento_fletamento', label: 'Contrato de arrendamiento o fletamento entre solicitante y operador.' },
      { key: 'poliza_fianza_pasajeros', label: 'Póliza o fianza US 300.00 por pasajeros, vuelos originados en Guatemala.' },
      { key: 'dictamen_tecnico_favorable', label: 'Dictamen técnico favorable, líneas aéreas nacionales.' }
    ]
  }
];

@Component({
  selector: 'app-transporte-aereo-form-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './transporte-aereo-form-page.component.html',
  styleUrls: ['./transporte-aereo-form-page.component.css']
})
export class TransporteAereoFormPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly apiBase = API_BASE;
  readonly forms = TRANSPORT_FORMS;
  readonly currentConfig = signal<TransportFormConfig | null>(null);
  readonly pageTitle = computed(() => this.currentConfig()?.title || 'Formulario Transporte Aéreo');
  readonly maxFileSize = 10 * 1024 * 1024;
  readonly maxTableRows = 6;

  formValues: Record<string, string> = {};
  optionValues: Record<string, boolean> = {};
  tableValues: Record<string, string> = {};
  tableRowCounts: Record<string, number> = {};
  supportFiles: Record<string, File | null> = {};
  annexFile: File | null = null;
  isSubmitting = false;
  status: { type: 'success' | 'error'; message: string } | null = null;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const slug = String(params.get('slug') || '').trim().toLowerCase();
      const config = this.forms.find((entry) => entry.slug === slug) || this.forms[0];
      this.currentConfig.set(config);
      this.supportFiles = {};
      this.status = null;
      this.resetForm(config);
    });
  }

  trackField(_index: number, field: TransportField) {
    return field.key;
  }

  trackTable(_index: number, table: TransportTable) {
    return table.key;
  }

  trackOption(_index: number, option: TransportOption) {
    return option.key;
  }

  tableRows(table: TransportTable) {
    const rowCount = this.tableRowCounts[table.key] || table.rows;
    return Array.from({ length: rowCount }, (_value, index) => index);
  }

  tableCellKey(table: TransportTable, rowIndex: number, columnKey: string) {
    return `${table.key}_${rowIndex}_${columnKey}`;
  }

  addTableRow(table: TransportTable) {
    const currentRows = this.tableRowCounts[table.key] || table.rows;
    if (currentRows >= this.maxTableRows) return;

    for (const column of table.columns) {
      this.tableValues[this.tableCellKey(table, currentRows, column.key)] = '';
    }
    this.tableRowCounts = { ...this.tableRowCounts, [table.key]: currentRows + 1 };
  }

  tableReachedMaximum(table: TransportTable) {
    return (this.tableRowCounts[table.key] || table.rows) >= this.maxTableRows;
  }

  showAnnexUpload(config: TransportFormConfig) {
    return config.tables.some((table) => this.tableReachedMaximum(table));
  }

  onSupportFileSelected(event: Event, attachment: TransportAttachment) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.status = null;
    this.supportFiles = { ...this.supportFiles, [attachment.key]: null };
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.status = { type: 'error', message: `El documento "${attachment.label}" debe cargarse en formato PDF.` };
      input.value = '';
      return;
    }
    if (file.size > this.maxFileSize) {
      this.status = { type: 'error', message: `El documento "${attachment.label}" supera el tamaño máximo de 10 MB.` };
      input.value = '';
      return;
    }
    this.supportFiles = { ...this.supportFiles, [attachment.key]: file };
  }

  onAnnexFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.status = null;
    this.annexFile = null;
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.status = { type: 'error', message: 'El documento "Anexos" debe cargarse en formato PDF.' };
      input.value = '';
      return;
    }
    if (file.size > this.maxFileSize) {
      this.status = { type: 'error', message: 'El documento "Anexos" supera el tamaño máximo de 10 MB.' };
      input.value = '';
      return;
    }
    this.annexFile = file;
  }

  async onSubmit() {
    const config = this.currentConfig();
    if (!config) return;
    this.status = null;

    const missing = config.fields
      .filter((field) => field.required && !String(this.formValues[field.key] || '').trim())
      .map((field) => field.label);

    if (missing.length) {
      this.status = { type: 'error', message: `Faltan campos obligatorios: ${missing.join(', ')}.` };
      return;
    }
    const requiredAttachments = this.requiredAttachments(config);
    const missingDocuments = requiredAttachments
      .filter((attachment) => !this.supportFiles[attachment.key])
      .map((attachment) => attachment.label);
    if (missingDocuments.length) {
      this.status = { type: 'error', message: `Debes adjuntar todos los documentos requeridos. Falta: ${missingDocuments[0]}` };
      return;
    }

    this.isSubmitting = true;
    try {
      const currentUser = this.auth.currentUser;
      const selectedAttachments = config.attachments.filter((attachment) => Boolean(this.supportFiles[attachment.key]));
      const supportDocuments = await Promise.all(selectedAttachments.map(async (attachment) => {
        const file = this.supportFiles[attachment.key];
        return {
          key: attachment.key,
          label: attachment.label,
          filename: file?.name || `${attachment.key}.pdf`,
          mime: 'application/pdf',
          pdf_base64: file ? await this.readFileAsBase64(file) : ''
        };
      }));
      if (this.showAnnexUpload(config) && this.annexFile) {
        supportDocuments.push({
          key: 'anexos',
          label: 'Anexos',
          filename: this.annexFile.name,
          mime: 'application/pdf',
          pdf_base64: await this.readFileAsBase64(this.annexFile)
        });
      }
      const payload = {
        unidad_clave: 'TRANSPORTE_AEREO',
        gestion_nombre: config.menuLabel,
        nombre_propietario: this.value(config.payloadMap.nameField) || String(currentUser?.name || currentUser?.email || 'Usuario').trim(),
        correo: this.value(config.payloadMap.emailField) || String(currentUser?.email || '').trim(),
        telefono: this.value(config.payloadMap.phoneField) || null,
        direccion: this.value(config.payloadMap.addressField) || 'N/D',
        documento_propietario: null,
        nit: null,
        uso: config.code,
        especificaciones: this.value(config.payloadMap.notesField),
        detalle_formulario: {
          tipo: 'transporte_aereo',
          codigo: config.code,
          slug: config.slug,
          titulo: config.title,
          modalidad: 'formulario_digital',
          campos_digitales: this.digitalFields(config),
          opciones: this.digitalOptions(config),
          tablas: this.digitalTables(config),
          adjuntos_requeridos: requiredAttachments.map((attachment) => attachment.label),
          documentos_soporte: supportDocuments.map((doc) => ({
            key: doc.key,
            label: doc.label,
            filename: doc.filename,
            mime: doc.mime
          }))
        },
        support_documents: supportDocuments
      };

      this.http.post(`${this.apiBase}/submissions`, payload).subscribe({
        next: (saved: any) => {
          const registro = saved?.registro_codigo ? ` Correlativo: ${saved.registro_codigo}.` : '';
          this.status = { type: 'success', message: `Solicitud de Transporte Aéreo enviada correctamente.${registro}` };
          this.supportFiles = {};
          this.annexFile = null;
          this.resetForm(config);
          this.isSubmitting = false;
        },
        error: (err) => {
          this.status = { type: 'error', message: err?.error?.error || 'No se pudo enviar la solicitud de Transporte Aéreo.' };
          this.isSubmitting = false;
        }
      });
    } catch {
      this.status = { type: 'error', message: 'No se pudo leer el archivo PDF seleccionado.' };
      this.isSubmitting = false;
    }
  }

  fileSizeLabel(file: File) {
    return `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  }

  isAttachmentRequired(attachment: TransportAttachment) {
    return !attachment.requiredWhenOption || Boolean(this.optionValues[attachment.requiredWhenOption]);
  }

  private resetForm(config: TransportFormConfig) {
    const fields: Record<string, string> = {};
    const options: Record<string, boolean> = {};
    const tables: Record<string, string> = {};
    this.tableRowCounts = Object.fromEntries(config.tables.map((table) => [table.key, table.rows]));

    for (const field of config.fields) {
      fields[field.key] = field.key === 'fecha_solicitud' ? this.todayLocalDateValue() : '';
    }
    for (const option of config.options || []) options[option.key] = false;
    for (const table of config.tables) {
      for (const rowIndex of this.tableRows(table)) {
        for (const column of table.columns) {
          tables[this.tableCellKey(table, rowIndex, column.key)] = '';
        }
      }
    }

    this.formValues = fields;
    this.optionValues = options;
    this.tableValues = tables;
    this.supportFiles = Object.fromEntries(config.attachments.map((attachment) => [attachment.key, null]));
    this.annexFile = null;
  }

  private value(key?: string) {
    return key ? String(this.formValues[key] || '').trim() : '';
  }

  private requiredAttachments(config: TransportFormConfig) {
    return config.attachments.filter((attachment) => this.isAttachmentRequired(attachment));
  }

  private todayLocalDateValue() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private digitalFields(config: TransportFormConfig) {
    return Object.fromEntries(config.fields.map((field) => [field.key, this.value(field.key)]));
  }

  private digitalOptions(config: TransportFormConfig) {
    return Object.fromEntries((config.options || []).map((option) => [option.key, Boolean(this.optionValues[option.key])]));
  }

  private digitalTables(config: TransportFormConfig) {
    const result: Record<string, Array<Record<string, string>>> = {};
    for (const table of config.tables) {
      result[table.key] = this.tableRows(table).map((rowIndex) => {
        const row: Record<string, string> = {};
        for (const column of table.columns) {
          row[column.key] = String(this.tableValues[this.tableCellKey(table, rowIndex, column.key)] || '').trim();
        }
        return row;
      });
    }
    return result;
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}
