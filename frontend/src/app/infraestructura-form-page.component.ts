import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, HostListener, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { API_BASE } from './api.config';
import { AuthService } from './auth.service';

type InfraFieldType = 'text' | 'email' | 'tel' | 'textarea' | 'date' | 'number';

type InfraField = {
  key: string;
  label: string;
  type?: InfraFieldType;
  required?: boolean;
  full?: boolean;
  rows?: number;
  hint?: string;
};

type InfraOption = {
  key: string;
  label: string;
};

type InfraSection = {
  title: string;
  fields: InfraField[];
};

type InfraAttachment = {
  key: string;
  label: string;
  appliesIf?: string;
  required?: boolean;
};

type InfraFormConfig = {
  slug: string;
  code: string;
  menuLabel: string;
  title: string;
  subtitle: string;
  intro?: string;
  optionsTitle?: string;
  options?: InfraOption[];
  authorizationOptions?: InfraOption[];
  helipadTypeOptions?: InfraOption[];
  operationOptions?: InfraOption[];
  sections: InfraSection[];
  attachments?: InfraAttachment[];
  supportAsset?: string;
  supportAssetLabel?: string;
  structuralNote?: string;
  declarationText?: string;
  payloadMap: {
    nameField: string;
    addressField: string;
    phoneField: string;
    emailField: string;
    documentField?: string;
    nitField?: string;
    notesField: string;
  };
};

const COMMON_APPLICANT_FIELDS: InfraField[] = [
  { key: 'nombres', label: 'Nombres', required: true },
  { key: 'apellidos', label: 'Apellidos', required: true },
  { key: 'dpi', label: 'DPI', required: true },
  { key: 'direccion', label: 'Dirección', required: true },
  { key: 'telefonos', label: 'Teléfonos', type: 'tel', required: true },
  { key: 'correo_electronico', label: 'Correo electrónico', type: 'email', required: true }
];

const LEGAL_REPRESENTATION_FIELDS: InfraField[] = [
  { key: 'nombre_entidad', label: 'Nombre de la entidad', full: true, hint: 'Debe coincidir en toda la documentación' },
  { key: 'nit_entidad', label: 'NIT de la entidad' },
  { key: 'inscripcion_registro', label: 'Inscripción de registro' },
  { key: 'numero_registro', label: 'Número de registro' },
  { key: 'folio_entidad', label: 'Folio' },
  { key: 'libro_entidad', label: 'Libro' },
  { key: 'telefonos_entidad', label: 'Teléfonos', type: 'tel' },
  { key: 'correo_entidad', label: 'Correo electrónico', type: 'email' }
];

const HELIPUERTO_FORM: InfraFormConfig = {
  slug: 'helipuertos',
  code: 'INFRA-HELIPUERTO-2026',
  menuLabel: 'Formulario de helipuertos',
  title: 'Formulario de solicitud de autorización de construcción y operación, actualización y/o modificación de helipuertos',
  subtitle: 'Departamento de Infraestructura Aeroportuaria',
  intro: 'Estimado Sr. Director: por este medio se presenta solicitud para autorización de:',
  authorizationOptions: [
    { key: 'construccion_operacion', label: 'Construcción y operación' },
    { key: 'actualizacion', label: 'Actualización' },
    { key: 'modificacion', label: 'Modificación' }
  ],
  helipadTypeOptions: [
    { key: 'privado', label: 'Privado' },
    { key: 'comercial', label: 'Comercial' }
  ],
  operationOptions: [
    { key: 'diurna', label: 'Diurna' },
    { key: 'nocturna', label: 'Nocturna' },
    { key: 'vfr', label: 'VFR' },
    { key: 'ifr', label: 'IFR' }
  ],
  payloadMap: {
    nameField: 'nombres',
    addressField: 'direccion',
    phoneField: 'telefonos',
    emailField: 'correo_electronico',
    documentField: 'dpi',
    nitField: 'nit_entidad',
    notesField: 'nombre_helipuerto'
  },
  structuralNote: '* Si el helipuerto es elevado y/o está soportado por estructuras metálicas, la firma debe ser de un profesional en Ingeniería Estructural, incorporando constancia de colegiado activo.',
  sections: [
    { title: 'Datos del solicitante', fields: COMMON_APPLICANT_FIELDS },
    { title: 'Representación legal', fields: LEGAL_REPRESENTATION_FIELDS },
    {
      title: 'Datos del helipuerto',
      fields: [
        { key: 'nombre_helipuerto', label: 'Nombre', required: true, full: true, hint: 'Debe coincidir en toda la documentación' },
        { key: 'direccion_helipuerto', label: 'Dirección del helipuerto', required: true, full: true, hint: 'Debe coincidir en toda la documentación' },
        { key: 'municipio', label: 'Municipio', required: true },
        { key: 'departamento', label: 'Departamento', required: true },
        { key: 'finca', label: 'Finca' },
        { key: 'folio_helipuerto', label: 'Folio' },
        { key: 'libro_helipuerto', label: 'Libro' },
        { key: 'de_helipuerto', label: 'De' }
      ]
    },
    {
      title: 'Coordenadas WGS84 del centro geométrico del helipuerto',
      fields: [
        { key: 'latitud_grados', label: 'Latitud - grados', type: 'number' },
        { key: 'latitud_minutos', label: 'Latitud - minutos', type: 'number' },
        { key: 'latitud_segundos', label: 'Latitud - segundos', type: 'number', hint: 'Usar 2 decimales' },
        { key: 'longitud_grados', label: 'Longitud - grados', type: 'number' },
        { key: 'longitud_minutos', label: 'Longitud - minutos', type: 'number' },
        { key: 'longitud_segundos', label: 'Longitud - segundos', type: 'number', hint: 'Usar 2 decimales' }
      ]
    },
    {
      title: 'Especificaciones del helipuerto',
      fields: [
        { key: 'tipo_helipuerto_suelo', label: 'Tipo de helipuerto - suelo' },
        { key: 'tipo_helipuerto_elevado', label: 'Tipo de helipuerto - elevado' },
        { key: 'elevacion_metros', label: 'Elevación del punto más alto - metros', type: 'number', hint: 'Usar 2 decimales' },
        { key: 'elevacion_pies', label: 'Elevación del punto más alto - pies', type: 'number', hint: 'Usar 2 decimales' },
        { key: 'fato_ancho', label: 'Dimensiones FATO - ancho (m)', type: 'number', hint: 'Usar 2 decimales' },
        { key: 'fato_largo', label: 'Dimensiones FATO - largo (m)', type: 'number', hint: 'Usar 2 decimales' },
        { key: 'tlof_ancho', label: 'Dimensiones TLOF - ancho (m)', type: 'number', hint: 'Usar 2 decimales' },
        { key: 'tlof_largo', label: 'Dimensiones TLOF - largo (m)', type: 'number', hint: 'Usar 2 decimales' }
      ]
    },
    {
      title: 'Helicóptero de diseño',
      fields: [
        { key: 'd_diseno', label: 'D de diseño (m)', type: 'number' },
        { key: 'mtom', label: 'Masa máxima de despegue - MTOM (kg)', type: 'number' },
        { key: 'marca_helicoptero', label: 'Marca' },
        { key: 'modelo_helicoptero', label: 'Modelo' },
        { key: 'pistas_helipuertos_area', label: 'Pistas o helipuertos en área (1 km = 0.54 millas náuticas)', type: 'textarea', rows: 2, full: true }
      ]
    },
    {
      title: 'Información operativa',
      fields: [
        { key: 'orientacion_norte_magnetico', label: 'Orientación del helipuerto respecto al norte magnético', full: true },
        { key: 'direcciones_superficies_aproximacion', label: 'Dirección(es) de las superficies de aproximación', type: 'textarea', rows: 2, full: true },
        { key: 'ayudas_visuales', label: 'Ayudas visuales', type: 'textarea', rows: 3, full: true, hint: 'Descripción del sistema de balizaje y equipamientos' },
        { key: 'naturaleza_resistencia_piso', label: 'Naturaleza y resistencia del piso del área de aterrizaje y despegue', type: 'textarea', rows: 2, full: true },
        { key: 'servicios_contra_incendio', label: 'Información sobre servicios contra incendio', type: 'textarea', rows: 2, full: true },
        { key: 'combustibles_lubricantes', label: 'Combustibles y lubricantes', type: 'textarea', rows: 2, full: true },
        { key: 'vientos_predominantes', label: 'Vientos predominantes', type: 'textarea', rows: 2, full: true },
        { key: 'temperatura_maxima_promedio', label: 'Temperatura máxima promedio (°C)', type: 'number' },
        { key: 'acceso_helipuerto', label: 'Acceso a helipuerto', type: 'textarea', rows: 2, full: true }
      ]
    },
    {
      title: 'Profesionales de la elaboración del proyecto',
      fields: [
        { key: 'profesional_nombre', label: 'Nombre', full: true },
        { key: 'profesional_telefono', label: 'Teléfono', type: 'tel' },
        { key: 'profesional_correo', label: 'Correo electrónico', type: 'email' },
        { key: 'informacion_adicional', label: 'Información adicional', type: 'textarea', rows: 3, full: true }
      ]
    },
    { title: 'Declaración', fields: [{ key: 'fecha_solicitud', label: 'Fecha', type: 'date', required: true }] }
  ]
};

const ALTURA_MAXIMA_FORM: InfraFormConfig = {
  slug: 'altura-maxima-permisible',
  code: 'INFRA-ALTURA-MAXIMA-PERMISIBLE',
  menuLabel: 'Análisis de altura máxima permisible',
  title: 'Solicitud para análisis de altura máxima permisible',
  subtitle: 'Departamento de Infraestructura Aeroportuaria',
  intro: 'Estimado Sr. Director: por este medio se presenta solicitud para análisis de altura máxima permisible para:',
  optionsTitle: 'Solicitud de',
  options: [
    { key: 'edificio', label: 'Edificio' },
    { key: 'torre', label: 'Torre' },
    { key: 'rotulos_publicitarios', label: 'Rótulos publicitarios' },
    { key: 'otro', label: 'Otro' }
  ],
  payloadMap: {
    nameField: 'nombre_solicitante',
    addressField: 'direccion_proyecto',
    phoneField: 'telefonos_solicitante',
    emailField: 'correo_solicitante',
    documentField: 'dpi',
    notesField: 'nombre_proyecto'
  },
  structuralNote: 'El nombre del proyecto debe coincidir de igual forma en todos los documentos a completar.',
  sections: [
    {
      title: 'Datos del proyecto',
      fields: [
        { key: 'fecha_solicitud', label: 'Fecha en que se presenta', type: 'date', required: true },
        { key: 'otro_especifique', label: 'Si es otro, especifique', full: true },
        { key: 'nombre_proyecto', label: 'Nombre del proyecto', required: true, full: true },
        { key: 'direccion_proyecto', label: 'Dirección del proyecto', required: true, full: true },
        { key: 'municipio', label: 'Municipio', required: true },
        { key: 'departamento', label: 'Departamento', required: true },
        { key: 'finca', label: 'Finca' },
        { key: 'folio', label: 'Folio' },
        { key: 'libro', label: 'Libro' },
        { key: 'de', label: 'De' }
      ]
    },
    {
      title: 'Datos del solicitante, gestor y constructor',
      fields: [
        { key: 'nombre_solicitante', label: 'Nombre del solicitante', required: true },
        { key: 'dpi', label: 'DPI', required: true },
        { key: 'telefonos_solicitante', label: 'Teléfonos del solicitante', type: 'tel', required: true },
        { key: 'correo_solicitante', label: 'Correo electrónico del solicitante', type: 'email', required: true },
        { key: 'nombre_gestor', label: 'Nombre y teléfonos del gestor' },
        { key: 'correo_gestor', label: 'Correo electrónico del gestor', type: 'email' },
        { key: 'nombre_constructor', label: 'Nombre y teléfonos del constructor' },
        { key: 'correo_constructor', label: 'Correo electrónico del constructor', type: 'email' }
      ]
    },
    {
      title: 'Coordenadas geográficas WGS84 del centro de la estructura',
      fields: [
        { key: 'latitud_grados', label: 'Latitud - grados', type: 'number' },
        { key: 'latitud_minutos', label: 'Latitud - minutos', type: 'number' },
        { key: 'latitud_segundos', label: 'Latitud - segundos', type: 'number', hint: 'Usar 2 decimales' },
        { key: 'longitud_grados', label: 'Longitud - grados', type: 'number' },
        { key: 'longitud_minutos', label: 'Longitud - minutos', type: 'number' },
        { key: 'longitud_segundos', label: 'Longitud - segundos', type: 'number', hint: 'Usar 2 decimales' }
      ]
    },
    {
      title: 'Alturas y observaciones',
      fields: [
        { key: 'cota_banqueta', label: 'Cota de banqueta del proyecto (msnmm)', type: 'number', hint: 'Usar 2 decimales' },
        { key: 'altura_total_estructura', label: 'Altura total de la estructura (metros)', type: 'number', hint: 'Usar 2 decimales' },
        { key: 'cota_final_estructura', label: 'Cota final de la estructura (msnmm)', type: 'number', hint: 'Usar 2 decimales' },
        { key: 'utilizara_grua', label: 'Utilizará grúa: Sí / No' },
        { key: 'altura_total_grua', label: 'Altura total de la grúa (metros)', type: 'number', hint: 'Si aplica, usar 2 decimales' },
        { key: 'observaciones', label: 'Observaciones', type: 'textarea', rows: 3, full: true }
      ]
    }
  ],
  attachments: [
    { key: 'identificacion_solicitante', label: 'Identificación del solicitante y acreditación de la calidad con que actúa, así como de su representada si fuese persona jurídica.' },
    { key: 'constitucion_sociedad', label: 'Constitución de sociedad con sus modificaciones.', appliesIf: 'Si aplica', required: false },
    { key: 'documentacion_propiedad', label: 'Documentación legal que acredite la propiedad del bien o figura jurídica que le otorgue el libre disfrute.' },
    { key: 'plano_topografico', label: 'Plano topográfico a escala adecuada con localización del terreno, coordenadas WGS84 y ubicación del entorno.' },
    { key: 'libreta_topografica', label: 'Libreta topográfica o registros que respalden la obtención de cota de banqueta.' },
    { key: 'dictamen_ign', label: 'Dictamen del Instituto Geográfico Nacional -IGN- sobre banco de marca.' },
    { key: 'planos_elevacion', label: 'Planos de elevación y sección de la parte más alta, firmados y sellados por profesional en la materia.' },
    { key: 'comprobante_pago', label: 'Comprobante de pago para obtener dictamen.' },
    { key: 'acta_notarial_senalizacion', label: 'Acta notarial de compromiso de señalización correspondiente.' },
    { key: 'plano_grua', label: 'Para grúa: plano de elevación acotado desde la cota obtenida en la nivelación hasta la altura máxima.', appliesIf: 'Si aplica', required: false }
  ],
  supportAsset: 'assets/infraestructura/soporte-altura-maxima-permisible.pdf',
  supportAssetLabel: 'Ver páginas de soporte de altura máxima permisible'
};

const PISTAS_FORM: InfraFormConfig = {
  slug: 'pistas',
  code: 'INFRA-PISTAS',
  menuLabel: 'Construcción, operación, actualización y/o modificación de pista',
  title: 'Formulario de solicitud de autorización de construcción y operación, actualización y/o modificación de pista',
  subtitle: 'Departamento de Infraestructura Aeroportuaria',
  intro: 'Estimado Sr. Director: por este medio se presenta solicitud para autorización de:',
  authorizationOptions: [
    { key: 'construccion_operacion', label: 'Construcción y operación' },
    { key: 'actualizacion', label: 'Actualización' },
    { key: 'modificacion', label: 'Modificación' }
  ],
  operationOptions: [
    { key: 'diurna', label: 'Diurna' },
    { key: 'nocturna', label: 'Nocturna' }
  ],
  payloadMap: {
    nameField: 'nombres',
    addressField: 'direccion_pista',
    phoneField: 'telefonos',
    emailField: 'correo_electronico',
    documentField: 'dpi',
    nitField: 'nit_entidad',
    notesField: 'nombre_pista'
  },
  declarationText: 'Yo, el abajo firmante, declaro que la Dirección General de Aeronáutica Civil no es responsable de información errónea, incongruente o inconsistente proporcionada; que no existe impedimento legal o judicial para la construcción de la pista; y que la información proporcionada en este formulario es fiel y veraz.',
  sections: [
    { title: 'Datos del solicitante', fields: COMMON_APPLICANT_FIELDS },
    { title: 'Representación legal', fields: LEGAL_REPRESENTATION_FIELDS },
    {
      title: 'Datos de la pista',
      fields: [
        { key: 'fecha_solicitud', label: 'Fecha', type: 'date', required: true },
        { key: 'nombre_pista', label: 'Nombre de la pista', required: true, full: true },
        { key: 'direccion_pista', label: 'Dirección de la pista', required: true, full: true },
        { key: 'municipio', label: 'Municipio', required: true },
        { key: 'departamento', label: 'Departamento', required: true },
        { key: 'finca', label: 'Finca' },
        { key: 'folio', label: 'Folio' },
        { key: 'libro', label: 'Libro' },
        { key: 'de', label: 'De' }
      ]
    },
    {
      title: 'Coordenadas WGS84 de umbrales y ARP',
      fields: [
        { key: 'umbral_1', label: 'Umbral 1' },
        { key: 'umbral_1_latitud', label: 'Umbral 1 - latitud' },
        { key: 'umbral_1_longitud', label: 'Umbral 1 - longitud' },
        { key: 'umbral_2', label: 'Umbral 2' },
        { key: 'umbral_2_latitud', label: 'Umbral 2 - latitud' },
        { key: 'umbral_2_longitud', label: 'Umbral 2 - longitud' },
        { key: 'arp', label: 'ARP' },
        { key: 'arp_latitud', label: 'ARP - latitud' },
        { key: 'arp_longitud', label: 'ARP - longitud' }
      ]
    },
    {
      title: 'Especificaciones de la pista',
      fields: [
        { key: 'largo_pista', label: 'Largo de pista (metros)', type: 'number' },
        { key: 'ancho_pista', label: 'Ancho de pista (metros)', type: 'number' },
        { key: 'naturaleza_piso', label: 'Naturaleza del piso', full: true, hint: 'Tierra, grama, pavimento, etc.' },
        { key: 'resistencia_piso', label: 'Resistencia del piso', full: true, hint: 'En kg/MPa o PCN' },
        { key: 'rumbo_magnetico', label: 'Rumbo magnético' },
        { key: 'rumbo_verdadero', label: 'Rumbo verdadero' },
        { key: 'elevacion_umbral_1', label: 'Elevación umbral 1' },
        { key: 'elevacion_umbral_2', label: 'Elevación umbral 2' },
        { key: 'elevacion_arp', label: 'Elevación ARP' },
        { key: 'pendiente_pista_1', label: 'Pendiente pista 1 (%)', type: 'number' },
        { key: 'pendiente_pista_2', label: 'Pendiente pista 2 (%)', type: 'number' },
        { key: 'distancia_municipio', label: 'Dirección y distancia al municipio más cercano', full: true },
        { key: 'distancia_pista', label: 'Dirección y distancia a la pista más cercana', full: true },
        { key: 'uso_pista', label: 'Uso de la pista: privado / público' },
        { key: 'ayudas_visuales', label: 'Ayudas visuales', type: 'textarea', rows: 2, full: true },
        { key: 'naturaleza_resistencia_area', label: 'Naturaleza y resistencia del piso del área de aterrizaje y despegue', type: 'textarea', rows: 2, full: true },
        { key: 'servicios_contra_incendio', label: 'Información sobre servicios contra incendio', type: 'textarea', rows: 2, full: true }
      ]
    },
    {
      title: 'Profesionales de la elaboración del proyecto',
      fields: [
        { key: 'profesional_nombre', label: 'Nombre', full: true },
        { key: 'profesional_telefono', label: 'Teléfono', type: 'tel' },
        { key: 'profesional_correo', label: 'Correo electrónico', type: 'email' },
        { key: 'informacion_adicional', label: 'Información adicional', type: 'textarea', rows: 3, full: true }
      ]
    }
  ],
  attachments: [
    { key: 'identificacion_solicitante', label: 'Identificación del solicitante y acreditación de la calidad con que actúa, así como de su representada si fuese persona jurídica.' },
    { key: 'constitucion_sociedad', label: 'Original o fotocopia de la escritura pública de constitución de la sociedad, asociación o fundación y modificaciones registrales.' },
    { key: 'documentacion_propiedad', label: 'Documentación legal que acredite la propiedad del bien o figura jurídica que le otorgue el libre disfrute.' },
    { key: 'planos_localizacion_construccion', label: 'Planos de localización y construcción, incluyendo zonas de protección, franjas, aproximación y planos firmados por profesional.' },
    { key: 'colegiado_activo', label: 'Constancia de colegiado activo vigente del profesional que autoriza los planos del proyecto.' },
    { key: 'comprobante_pago', label: 'Comprobante de pago para obtener dictamen, indicando el nombre del aeródromo.' },
    { key: 'soporte_autorizacion_operacion', label: 'Soporte requerido para autorización de operación una vez finalizada la construcción, inspección y cancelación de pago correspondiente.' }
  ],
  supportAsset: 'assets/infraestructura/soporte-pistas.pdf',
  supportAssetLabel: 'Ver páginas de soporte de pistas'
};

@Component({
  selector: 'app-infraestructura-form-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './infraestructura-form-page.component.html',
  styleUrls: ['./infraestructura-form-page.component.css']
})
export class InfraestructuraFormPageComponent implements OnInit, AfterViewInit {
  @ViewChild('signatureCanvas') private signatureCanvas?: ElementRef<HTMLCanvasElement>;

  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly apiBase = API_BASE;
  readonly forms = [HELIPUERTO_FORM, ALTURA_MAXIMA_FORM, PISTAS_FORM];
  readonly currentConfig = signal<InfraFormConfig | null>(null);
  readonly pageTitle = computed(() => this.currentConfig()?.title || 'Formulario de Infraestructura');
  readonly maxFileSize = 10 * 1024 * 1024;

  formValues: Record<string, string> = {};
  optionValues: Record<string, boolean> = {};
  authorizationValues: Record<string, boolean> = {};
  helipadTypeValues: Record<string, boolean> = {};
  operationValues: Record<string, boolean> = {};
  supportFiles: Record<string, File | null> = {};
  signatureDataUrl = '';
  hasSignature = false;
  isSubmitting = false;
  status: { type: 'success' | 'error'; message: string } | null = null;
  private isSigning = false;
  private lastSignaturePoint: { x: number; y: number } | null = null;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const slug = String(params.get('slug') || '').trim().toLowerCase();
      const config = this.forms.find((entry) => entry.slug === slug) || this.forms[0];
      this.currentConfig.set(config);
      this.status = null;
      this.resetForm(config);
      setTimeout(() => this.prepareSignatureCanvas());
    });
  }

  ngAfterViewInit(): void {
    this.prepareSignatureCanvas();
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.prepareSignatureCanvas(true);
  }

  trackSection(index: number) {
    return index;
  }

  trackField(_index: number, field: InfraField) {
    return field.key;
  }

  trackOption(_index: number, option: InfraOption) {
    return option.key;
  }

  trackAttachment(_index: number, attachment: InfraAttachment) {
    return attachment.key;
  }

  onSupportFileSelected(event: Event, attachment: InfraAttachment) {
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

  async onSubmit() {
    const config = this.currentConfig();
    if (!config) return;
    this.status = null;

    const missing = this.allFields(config)
      .filter((field) => field.required && !String(this.formValues[field.key] || '').trim())
      .map((field) => field.label);

    if (missing.length) {
      this.status = { type: 'error', message: `Faltan campos obligatorios: ${missing.join(', ')}.` };
      return;
    }
    if (config.options?.length && !Object.values(this.optionValues).some(Boolean)) {
      this.status = { type: 'error', message: `Debes seleccionar una opción en "${config.optionsTitle || 'Solicitud de'}".` };
      return;
    }
    if (config.authorizationOptions?.length && !Object.values(this.authorizationValues).some(Boolean)) {
      this.status = { type: 'error', message: 'Debes seleccionar el tipo de autorización.' };
      return;
    }
    if (config.helipadTypeOptions?.length && !Object.values(this.helipadTypeValues).some(Boolean)) {
      this.status = { type: 'error', message: 'Debes seleccionar si el helipuerto es privado o comercial.' };
      return;
    }

    if (!this.hasSignature || !this.signatureDataUrl) {
      this.status = { type: 'error', message: 'Debes firmar la solicitud antes de enviarla.' };
      return;
    }

    this.isSubmitting = true;
    try {
      const currentUser = this.auth.currentUser;
      const payload = {
        unidad_clave: 'INFRAESTRUCTURA',
        gestion_nombre: config.menuLabel,
        nombre_propietario: this.value(config.payloadMap.nameField) || String(currentUser?.name || currentUser?.email || 'Usuario').trim(),
        correo: this.value(config.payloadMap.emailField) || String(currentUser?.email || '').trim(),
        telefono: this.value(config.payloadMap.phoneField) || null,
        direccion: this.value(config.payloadMap.addressField) || 'N/D',
        documento_propietario: this.value(config.payloadMap.documentField) || null,
        nit: this.value(config.payloadMap.nitField) || null,
        uso: config.code,
        especificaciones: this.value(config.payloadMap.notesField),
        detalle_formulario: {
          tipo: 'infraestructura',
          codigo: config.code,
          slug: config.slug,
          titulo: config.title,
          modalidad: 'formulario_digital',
          campos_digitales: this.digitalFields(config),
          opciones: {
            ...Object.fromEntries((config.options || []).map((option) => [`solicitud_${option.key}`, Boolean(this.optionValues[option.key])])),
            ...Object.fromEntries((config.authorizationOptions || []).map((option) => [`autorizacion_${option.key}`, Boolean(this.authorizationValues[option.key])])),
            ...Object.fromEntries((config.helipadTypeOptions || []).map((option) => [`tipo_helipuerto_${option.key}`, Boolean(this.helipadTypeValues[option.key])])),
            ...Object.fromEntries((config.operationOptions || []).map((option) => [`condicion_operacional_${option.key}`, Boolean(this.operationValues[option.key])]))
          },
          solicitud_de: this.selectedOptions(config.options || [], this.optionValues),
          autorizacion_de: this.selectedOptions(config.authorizationOptions || [], this.authorizationValues),
          tipo_helipuerto: this.selectedOptions(config.helipadTypeOptions || [], this.helipadTypeValues),
          condicion_operacional: this.selectedOptions(config.operationOptions || [], this.operationValues),
          adjuntos_requeridos: (config.attachments || []).map((attachment) => attachment.label),
          documentos_soporte_consulta: config.supportAsset ? {
            label: config.supportAssetLabel || 'Ver documento de soporte',
            asset: config.supportAsset
          } : null,
          firma_digital_base64: this.signatureDataUrl
        }
      };

      this.http.post(`${this.apiBase}/submissions`, payload).subscribe({
        next: (saved: any) => {
          const registro = saved?.registro_codigo ? ` Correlativo: ${saved.registro_codigo}.` : '';
          this.status = { type: 'success', message: `Solicitud de Infraestructura enviada correctamente.${registro}` };
          this.resetForm(config);
          setTimeout(() => this.prepareSignatureCanvas());
          this.isSubmitting = false;
        },
        error: (err) => {
          this.status = { type: 'error', message: err?.error?.error || 'No se pudo enviar la solicitud de Infraestructura.' };
          this.isSubmitting = false;
        }
      });
    } catch {
      this.status = { type: 'error', message: 'No se pudo leer uno de los archivos PDF seleccionados.' };
      this.isSubmitting = false;
    }
  }

  fileSizeLabel(file: File) {
    return `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  }

  private resetForm(config: InfraFormConfig) {
    const fields: Record<string, string> = {};
    for (const field of this.allFields(config)) {
      fields[field.key] = field.key === 'fecha_solicitud' ? this.todayLocalDateValue() : '';
    }
    this.formValues = fields;
    this.optionValues = Object.fromEntries((config.options || []).map((option) => [option.key, false]));
    this.authorizationValues = Object.fromEntries((config.authorizationOptions || []).map((option) => [option.key, false]));
    this.helipadTypeValues = Object.fromEntries((config.helipadTypeOptions || []).map((option) => [option.key, false]));
    this.operationValues = Object.fromEntries((config.operationOptions || []).map((option) => [option.key, false]));
    this.supportFiles = Object.fromEntries((config.attachments || []).map((attachment) => [attachment.key, null]));
    this.clearSignature();
  }

  startSignature(event: PointerEvent) {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    this.isSigning = true;
    this.lastSignaturePoint = this.signaturePoint(event);
    this.drawSignaturePoint(this.lastSignaturePoint);
    this.storeSignature();
  }

  moveSignature(event: PointerEvent) {
    if (!this.isSigning || !this.lastSignaturePoint) return;
    event.preventDefault();
    const nextPoint = this.signaturePoint(event);
    this.drawSignatureLine(this.lastSignaturePoint, nextPoint);
    this.lastSignaturePoint = nextPoint;
    this.storeSignature();
  }

  endSignature(event: PointerEvent) {
    if (!this.isSigning) return;
    event.preventDefault();
    this.isSigning = false;
    this.lastSignaturePoint = null;
    this.storeSignature();
  }

  clearSignature() {
    this.signatureDataUrl = '';
    this.hasSignature = false;
    this.isSigning = false;
    this.lastSignaturePoint = null;
    this.prepareSignatureCanvas(false);
  }

  private allFields(config: InfraFormConfig) {
    return config.sections.flatMap((section) => section.fields);
  }

  private value(key?: string) {
    return key ? String(this.formValues[key] || '').trim() : '';
  }

  private todayLocalDateValue() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private digitalFields(config: InfraFormConfig) {
    return Object.fromEntries(this.allFields(config).map((field) => [field.key, this.value(field.key)]));
  }

  private selectedOptions(options: InfraOption[], values: Record<string, boolean>) {
    return options.filter((option) => values[option.key]).map((option) => option.label);
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private prepareSignatureCanvas(keepCurrent = false) {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) return;
    const previousSignature = keepCurrent && this.hasSignature ? this.signatureDataUrl : '';
    const parent = canvas.parentElement;
    const cssWidth = Math.max(280, Math.min(parent?.clientWidth || 720, 760));
    const cssHeight = 170;
    const ratio = window.devicePixelRatio || 1;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(cssHeight * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    this.drawSignatureBackground(ctx, cssWidth, cssHeight);
    if (previousSignature) {
      const image = new Image();
      image.onload = () => {
        ctx.drawImage(image, 0, 0, cssWidth, cssHeight);
        this.drawSignatureGuide(ctx, cssWidth, cssHeight);
      };
      image.src = previousSignature;
    }
  }

  private drawSignatureBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    this.drawSignatureGuide(ctx, width, height);
  }

  private drawSignatureGuide(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.save();
    ctx.strokeStyle = '#9fb9cc';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(24, height - 34);
    ctx.lineTo(width - 24, height - 34);
    ctx.stroke();
    ctx.restore();
  }

  private signaturePoint(event: PointerEvent) {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  private signatureContext() {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#082f52';
    ctx.fillStyle = '#082f52';
    return ctx;
  }

  private drawSignaturePoint(point: { x: number; y: number }) {
    const ctx = this.signatureContext();
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSignatureLine(from: { x: number; y: number }, to: { x: number; y: number }) {
    const ctx = this.signatureContext();
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  private storeSignature() {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) return;
    this.hasSignature = true;
    this.signatureDataUrl = canvas.toDataURL('image/png');
  }
}
