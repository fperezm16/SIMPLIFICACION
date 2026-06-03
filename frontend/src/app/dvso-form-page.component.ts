import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { API_BASE } from './api.config';
import { AuthService } from './auth.service';

type DvsoFieldType = 'text' | 'email' | 'tel' | 'textarea' | 'date' | 'number' | 'select';

type DvsoField = {
  key: string;
  label: string;
  type?: DvsoFieldType;
  required?: boolean;
  full?: boolean;
  rows?: number;
  placeholder?: string;
  hint?: string;
  options?: Array<{ value: string; label: string }>;
};

type DvsoSection = {
  title: string;
  description?: string;
  fields: DvsoField[];
};

type DvsoPayloadMap = {
  nameField: string;
  secondaryNameField?: string;
  documentField?: string;
  addressField?: string;
  phoneField: string;
  emailField: string;
  registrationField?: string;
  serialField?: string;
  notesField?: string;
};

type DvsoFormConfig = {
  slug: string;
  code: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  pdfAsset: string;
  sections: DvsoSection[];
  payloadMap: DvsoPayloadMap;
};

const DVSO_FORMS: DvsoFormConfig[] = [
  {
    slug: 'dvso-623',
    code: 'DVSO-623',
    shortLabel: 'Certificado exportación ala fija',
    title: 'FORMA DGAC DVSO-623 CERTIFICADO DE AERONAVEGABILIDAD PARA EXPORTACI?N ALA FIJA',
    subtitle: 'Certificado de aeronavegabilidad para exportación de aeronaves de ala fija.',
    pdfAsset: 'assets/dvso/FORMA-DGAC-DVSO-623-CERTIFICADO-DE-AERONAVEGABILIDAD-PARA-EXPORTACION-ALA-FIJA.pdf',
    payloadMap: {
      nameField: 'producto_tipo',
      secondaryNameField: 'pais_destino',
      addressField: 'excepciones',
      phoneField: 'numero_certificado',
      emailField: 'contacto_correo',
      registrationField: 'matricula_aeronave',
      serialField: 'serie_aeronave',
      notesField: 'excepciones'
    },
    sections: [
      {
        title: 'Datos del certificado',
        fields: [
          { key: 'numero_certificado', label: 'Número de certificado', required: true },
          { key: 'certificado_tipo_numero', label: 'Número de certificado tipo', required: true },
          { key: 'producto_tipo', label: 'Producto', required: true },
          { key: 'fabricante_aeronave', label: 'Fabricante', required: true },
          { key: 'modelo_aeronave', label: 'Modelo', required: true },
          { key: 'serie_aeronave', label: 'Número de serie', required: true },
          {
            key: 'condicion_aeronave',
            label: 'Condición',
            type: 'select',
            required: true,
            options: [
              { value: 'nuevo', label: 'Nuevo' },
              { value: 'usado', label: 'Usado' }
            ]
          },
          { key: 'pais_destino', label: 'País al que se exporta', required: true },
          { key: 'matricula_aeronave', label: 'Aeronave', required: true },
          { key: 'tiempo_total_aeronave', label: 'Tiempo total de la aeronave', required: true },
          { key: 'motor_marca', label: 'Motor - Marca', required: true },
          { key: 'motor_modelo', label: 'Motor - Modelo', required: true },
          { key: 'motor_serie', label: 'Motor - Serie(s)', required: true },
          { key: 'motor_tiempo_total', label: 'Motor - Tiempo total', required: true },
          { key: 'motor_tiempo_tdr', label: 'Motor - Tiempo TDR', required: true },
          { key: 'helice_marca', label: 'Hélice - Marca', required: true },
          { key: 'helice_modelo', label: 'Hélice - Modelo', required: true },
          { key: 'helice_serie', label: 'Hélice - Serie(s)', required: true },
          { key: 'helice_tiempo_total', label: 'Hélice - Tiempo total', required: true },
          { key: 'helice_tiempo_tdr', label: 'Hélice - Tiempo TDR', required: true },
          { key: 'excepciones', label: 'Excepciones', type: 'textarea', rows: 3, full: true },
          { key: 'fecha_emision', label: 'Fecha', type: 'date', required: true },
          { key: 'contacto_correo', label: 'Correo electrónico de contacto', type: 'email', required: true }
        ]
      }
    ]
  },
  {
    slug: 'dvso-623a',
    code: 'DVSO-623A',
    shortLabel: 'Certificado exportación helicóptero',
    title: 'FORMA DGAC DVSO-623A CERTIFICADO DE AERONAVEGABILIDAD PARA EXPORTACIÓN (HELICÓPTERO)',
    subtitle: 'Digitalización del certificado de aeronavegabilidad para exportación de helicópteros.',
    pdfAsset: 'assets/dvso/FORMA-DGAC-DVSO-623A-CERTIFICADO-DE-AERONAVEGABILIDAD-PARA-EXPORTACION-HELICOPTERO.pdf',
    payloadMap: {
      nameField: 'exportador_nombre',
      secondaryNameField: 'comprador_nombre',
      addressField: 'exportador_direccion',
      phoneField: 'solicitante_telefono',
      emailField: 'solicitante_correo',
      registrationField: 'matricula_helicoptero',
      serialField: 'serie_helicoptero',
      notesField: 'observaciones'
    },
    sections: [
      {
        title: 'Datos del certificado',
        fields: [
          { key: 'numero_certificado', label: 'Número de certificado', required: true },
          { key: 'pais_destino', label: 'País de destino', required: true },
          { key: 'lugar_emision', label: 'Lugar de emisión', required: true },
          { key: 'fecha_emision', label: 'Fecha de emisión', type: 'date', required: true }
        ]
      },
      {
        title: 'Datos del helicóptero',
        fields: [
          { key: 'fabricante_helicoptero', label: 'Fabricante del helicóptero', required: true },
          { key: 'modelo_helicoptero', label: 'Tipo / modelo del helicóptero', required: true },
          { key: 'serie_helicoptero', label: 'Número de serie del helicóptero', required: true },
          { key: 'matricula_helicoptero', label: 'Matrícula del helicóptero', required: true },
          { key: 'categoria_helicoptero', label: 'Categoría del helicóptero', required: true },
          { key: 'peso_maximo_rodaje', label: 'Peso máximo de rodaje (kg)', type: 'number' },
          { key: 'peso_maximo_despegue', label: 'Peso máximo de despegue (kg)', type: 'number' }
        ]
      },
      {
        title: 'Motores y rotores',
        fields: [
          { key: 'motores_modelo', label: 'Tipo y modelo de motores', required: true, full: true },
          { key: 'motores_serie', label: 'Número(s) de serie de los motores', required: true, full: true },
          { key: 'rotor_principal', label: 'Rotor principal', full: true },
          { key: 'rotor_cola', label: 'Rotor de cola', full: true }
        ]
      },
      {
        title: 'Exportador e importador',
        fields: [
          { key: 'exportador_nombre', label: 'Nombre del exportador', required: true },
          { key: 'exportador_direccion', label: 'Dirección del exportador', required: true, full: true },
          { key: 'comprador_nombre', label: 'Nombre del comprador / importador', required: true },
          { key: 'comprador_direccion', label: 'Dirección del comprador / importador', required: true, full: true },
          { key: 'solicitante_telefono', label: 'Teléfono del solicitante', type: 'tel', required: true },
          { key: 'solicitante_correo', label: 'Correo electrónico del solicitante', type: 'email', required: true }
        ]
      },
      {
        title: 'Observaciones',
        fields: [
          { key: 'cumplimiento_requisitos', label: 'Declaración de cumplimiento y condiciones especiales', type: 'textarea', rows: 4, full: true, required: true },
          { key: 'observaciones', label: 'Observaciones adicionales', type: 'textarea', rows: 4, full: true }
        ]
      }
    ]
  },
  {
    slug: 'dvso-639',
    code: 'DVSO-639',
    shortLabel: 'Solicitud certificado exportación',
    title: 'FORMA DGAC DVSO-639 SOLICITUD PARA CERTIFICADO DE AERONAVEGABILIDAD PARA EXPORTACI?N',
    subtitle: 'Solicitud del certificado de aeronavegabilidad para exportación.',
    pdfAsset: 'assets/dvso/FORMA-DGAC-DVSO-639-SOLICITUD-PARA-CERTIFICADO-DE-AERONAVEGABILIDAD-PARA-EXPORTACION.pdf',
    payloadMap: {
      nameField: 'propietario_nombre_direccion',
      addressField: 'propietario_nombre_direccion',
      phoneField: 'propietario_contacto',
      emailField: 'propietario_contacto',
      registrationField: 'matricula_aeronave',
      serialField: 'serie_aeronave',
      notesField: 'informacion_adicional'
    },
    sections: [
      {
        title: 'Datos de la solicitud',
        fields: [
          { key: 'matricula_aeronave', label: 'Matrícula de la aeronave', required: true },
          { key: 'propietario_nombre_direccion', label: 'Nombre y dirección del propietario', required: true, full: true },
          { key: 'propietario_contacto', label: 'Número de teléfono y correo electrónico del propietario', required: true, full: true },
          { key: 'fabricante_aeronave', label: 'Fabricante de la aeronave', required: true },
          { key: 'tipo_modelo_aeronave', label: 'Tipo y modelo de la aeronave', required: true },
          { key: 'serie_aeronave', label: 'Número de serie de la aeronave', required: true },
          { key: 'categoria_aeronave', label: 'Categoría de la aeronave', required: true },
          { key: 'motores_modelo', label: 'Tipo y modelo de motores', required: true, full: true },
          { key: 'motores_serie', label: 'Número de serie de los motores', required: true, full: true },
          { key: 'helices_modelo', label: 'Tipo y modelo de hélice(s)', full: true },
          { key: 'helices_serie', label: 'Número de serie(s)', full: true },
          { key: 'rotor_principal', label: 'Rotor principal (si aplica)', full: true },
          { key: 'rotor_cola', label: 'Rotor de cola (si aplica)', full: true },
          { key: 'peso_maximo_rodaje', label: 'Peso m?ximo de rodaje (kg)', type: 'text' },
          { key: 'peso_maximo_despegue', label: 'Peso m?ximo de despegue (kg)', type: 'text' },
          { key: 'pais_importacion', label: 'País de importación', required: true },
          { key: 'importador_nombre_direccion', label: 'Nombre y dirección del importador', required: true, full: true },
          { key: 'informacion_adicional', label: 'Información adicional o requisitos especiales del Estado importador', type: 'textarea', rows: 4, full: true },
          { key: 'ubicacion_inspeccion', label: 'Ubicación de la aeronave para efectuar inspección física', required: true, full: true },
          { key: 'solicitante_nombre', label: 'Nombre del solicitante', required: true },
          { key: 'solicitante_cargo', label: 'Cargo del solicitante', required: true },
          { key: 'firma_fecha', label: 'Firma y fecha', required: true }
        ]
      }
    ]
  },
  {
    slug: 'dvso-639a',
    code: 'DVSO-639A',
    shortLabel: 'Anexo certificado exportación',
    title: 'FORMA DGAC DVSO-639A ANEXO A SOLICITUD PARA CERTIFICADO DE EXPORTACIÓN',
    subtitle: 'Anexo para productos de clase I, II o III del certificado de exportación.',
    pdfAsset: 'assets/dvso/FORMA-DGAC-DVSO-639A-ANEXO-A-SOLICITUD-PARA-CERTIFICADO-DE-EXPORTACION.pdf',
    payloadMap: {
      nameField: 'exportador_nombre',
      secondaryNameField: 'comprador_nombre',
      addressField: 'exportador_direccion',
      phoneField: 'telefono_contacto',
      emailField: 'correo_contacto',
      notesField: 'observaciones'
    },
    sections: [
      {
        title: 'Parte I - Datos generales',
        fields: [
          { key: 'clase_producto', label: 'Clase de producto', type: 'select', required: true, options: [
            { value: 'clase_i', label: 'Clase I' },
            { value: 'clase_ii', label: 'Clase II' },
            { value: 'clase_iii', label: 'Clase III' }
          ] },
          { key: 'condicion_producto', label: 'Condición del producto', type: 'select', required: true, options: [
            { value: 'nuevo', label: 'Nuevo' },
            { value: 'usado', label: 'Usado' }
          ] },
          { key: 'pais_destino', label: 'País de destino', required: true },
          { key: 'exportador_nombre', label: 'Nombre del exportador', required: true },
          { key: 'exportador_direccion', label: 'Dirección del exportador', required: true, full: true },
          { key: 'comprador_nombre', label: 'Nombre del comprador extranjero', required: true },
          { key: 'comprador_direccion', label: 'Dirección del comprador extranjero', required: true, full: true },
          { key: 'telefono_contacto', label: 'Teléfono de contacto', type: 'tel', required: true },
          { key: 'correo_contacto', label: 'Correo electrónico de contacto', type: 'email', required: true }
        ]
      },
      {
        title: 'Descripción del producto',
        fields: [
          { key: 'descripcion_productos', label: 'Descripción del(de los) producto(s)', type: 'textarea', rows: 5, full: true, required: true },
          { key: 'horas_desde_revision', label: 'Tiempo de trabajo desde la revisión total (horas)', type: 'number' },
          { key: 'prueba_vuelo_fecha', label: 'Fecha de prueba de vuelo satisfactoria', type: 'date' }
        ]
      },
      {
        title: 'Cumplimiento',
        fields: [
          { key: 'cumple_dgac', label: '¿Cumple el producto con disposiciones aplicables de la DGAC?', type: 'select', required: true, options: [
            { value: 'si', label: 'Sí' },
            { value: 'no', label: 'No' }
          ] },
          { key: 'cumple_pais_importador', label: '¿Se ha cumplido con requisitos especiales del país importador?', type: 'select', required: true, options: [
            { value: 'si', label: 'Sí' },
            { value: 'no', label: 'No' }
          ] },
          { key: 'tratamiento_corrosion', label: '¿Se aplicó tratamiento preventivo contra corrosión?', type: 'select', required: true, options: [
            { value: 'si', label: 'Sí' },
            { value: 'no', label: 'No' }
          ] },
          { key: 'observaciones', label: 'Observaciones', type: 'textarea', rows: 4, full: true }
        ]
      },
      {
        title: 'Certificación del explotador',
        fields: [
          { key: 'solicitante_nombre', label: 'Nombre del solicitante', required: true },
          { key: 'solicitante_cargo', label: 'Cargo del solicitante', required: true },
          { key: 'certificacion_explotador', label: 'Texto de certificación del explotador', type: 'textarea', rows: 3, full: true, required: true }
        ]
      }
    ]
  },
  {
    slug: 'dvso-800',
    code: 'DVSO-800',
    shortLabel: 'Permiso de vuelo especial',
    title: 'FORMA DGAC DVSO-800 SOLICITUD DE APROBACIÓN, AUTORIZACIÓN, PERMISO DE VUELO ESPECIAL',
    subtitle: 'Solicitud de aprobación, autorización o permiso de vuelo especial.',
    pdfAsset: 'assets/dvso/FORMA-DGAC-DVSO-800-SOLICITUD-DE-APROBACION-AUTORIZACION-PERMISO-DE-VUELO-ESPECIAL.pdf',
    payloadMap: {
      nameField: 'propietario_nombre',
      secondaryNameField: 'solicitante_nombre',
      addressField: 'propietario_direccion',
      phoneField: 'propietario_telefono',
      emailField: 'propietario_correo',
      registrationField: 'matricula_aeronave',
      serialField: 'serie_aeronave',
      notesField: 'detalles_incumplimiento'
    },
    sections: [
      {
        title: 'Propietario y solicitante',
        fields: [
          { key: 'propietario_nombre', label: 'Nombre completo del propietario de la aeronave', required: true, full: true },
          { key: 'propietario_direccion', label: 'Dirección del propietario', required: true, full: true },
          { key: 'propietario_telefono', label: 'Teléfono del propietario', type: 'tel', required: true },
          { key: 'propietario_correo', label: 'Correo electrónico del propietario', type: 'email', required: true },
          { key: 'solicitante_nombre', label: 'Nombre del solicitante', required: true },
          { key: 'solicitante_direccion', label: 'Dirección del solicitante', required: true, full: true },
          { key: 'solicitante_telefono', label: 'Teléfono del solicitante', type: 'tel', required: true },
          { key: 'solicitante_correo', label: 'Correo electrónico del solicitante', type: 'email', required: true }
        ]
      },
      {
        title: 'Aeronave y vuelo',
        fields: [
          { key: 'fabricante_aeronave', label: 'Fabricante de la aeronave', required: true },
          { key: 'tipo_modelo_aeronave', label: 'Tipo / modelo de aeronave', required: true },
          { key: 'matricula_aeronave', label: 'Matrícula de la aeronave', required: true },
          { key: 'serie_aeronave', label: 'Número de serie de la aeronave', required: true },
          { key: 'anio_fabricacion', label: 'Año de fabricación', type: 'number' },
          { key: 'origen_destino_vuelo', label: 'Origen y destino del vuelo', required: true, full: true },
          { key: 'fecha_prevista_vuelo', label: 'Fecha prevista del vuelo', type: 'date', required: true },
          { key: 'ruta_vuelo', label: 'Ruta del vuelo', type: 'textarea', rows: 3, full: true, required: true },
          { key: 'proposito_vuelo', label: 'Propósito del vuelo', type: 'textarea', rows: 3, full: true, required: true },
          { key: 'personas_operan_vuelo', label: 'Personas que operan el vuelo (nombres, cargos y licencias)', type: 'textarea', rows: 4, full: true, required: true }
        ]
      },
      {
        title: 'Restricciones y declaración',
        fields: [
          { key: 'detalles_incumplimiento', label: 'Detalles de incumplimiento de requisitos de aeronavegabilidad', type: 'textarea', rows: 4, full: true, required: true },
          { key: 'restricciones_aplicar', label: 'Detalles de restricciones que se han de aplicar', type: 'textarea', rows: 4, full: true, required: true },
          { key: 'declaracion_veracidad', label: 'Declaración de veracidad', type: 'textarea', rows: 3, full: true, required: true }
        ]
      }
    ]
  },
  {
    slug: 'dvso-801',
    code: 'DVSO-801',
    shortLabel: 'Dictamen técnico RPA',
    title: 'FORMA DGAC DVSO-801 SOLICITUD DE DICTAMEN TÉCNICO AERONAVE PILOTADA A DISTANCIA (RPA)',
    subtitle: 'Solicitud de dictamen técnico para aeronaves pilotadas a distancia.',
    pdfAsset: 'assets/dvso/FORMA-DGAC-DVSO-801-SOLICITUD-DICTAMEN-TECNICO-AERONAVE-PILOTADAS-A-DISTANCIA-RPA.pdf',
    payloadMap: {
      nameField: 'entidad_nombre',
      phoneField: 'telefono_contacto',
      emailField: 'correo_contacto',
      registrationField: 'marca_rpa',
      serialField: 'serie_rpa',
      notesField: 'uso_previsto'
    },
    sections: [
      {
        title: 'Datos de identificación',
        fields: [
          { key: 'lugar_fecha_presentacion', label: 'Lugar y fecha de presentación', required: true, full: true },
          { key: 'entidad_nombre', label: 'Nombre de entidad, empresa o nombre propio', required: true, full: true },
          { key: 'correo_contacto', label: 'Correo electrónico', type: 'email', required: true },
          { key: 'telefono_contacto', label: 'Número telefónico', type: 'tel', required: true }
        ]
      },
      {
        title: 'Datos de la RPA',
        fields: [
          { key: 'marca_rpa', label: 'Marca', required: true },
          { key: 'modelo_rpa', label: 'Modelo', required: true },
          { key: 'serie_rpa', label: 'Número de serie (si corresponde)', required: true },
          { key: 'peso_rpa', label: 'Peso de la RPA', type: 'number', required: true },
          { key: 'cantidad_rpa', label: 'Cantidad', type: 'number', required: true },
          { key: 'uso_previsto', label: 'Uso previsto / comentarios', type: 'textarea', rows: 4, full: true },
          { key: 'firma_solicitante', label: 'Firma', full: true }
        ]
      }
    ]
  },
  {
    slug: 'dvso-ops-805',
    code: 'DVSO-OPS-805',
    shortLabel: 'Autorización vuelo RPA turistas',
    title: 'FORMA DVSO-OPS-805 AUTORIZACIÓN DE VUELO AERONAVES PILOTADAS A DISTANCIA (RPA/DRON) PARA TURISTAS',
    subtitle: 'Autorización de vuelo RPAS para turistas.',
    pdfAsset: 'assets/dvso/FORMA-DVSO-OPS-805.pdf',
    payloadMap: {
      nameField: 'propietario_nombre',
      documentField: 'pasaporte_numero',
      phoneField: 'telefono_contacto',
      emailField: 'correo_contacto',
      registrationField: 'matricula_rpa',
      serialField: 'serie_rpa',
      notesField: 'comentarios_operacion'
    },
    sections: [
      {
        title: 'A. Operador de la RPA / Dron',
        fields: [
          { key: 'propietario_nombre', label: 'Propietario', required: true, full: true },
          { key: 'pasaporte_numero', label: 'Número de pasaporte', required: true },
          { key: 'telefono_contacto', label: 'Número telefónico', type: 'tel', required: true },
          { key: 'correo_contacto', label: 'Correo electrónico', type: 'email', required: true },
          { key: 'pais_residencia', label: 'País de residencia', required: true },
          { key: 'aduana_ingreso', label: 'Aduana de ingreso', required: true },
          { key: 'aerolinea', label: 'Aerolínea (si aplica)' },
          { key: 'numero_vuelo', label: 'Número de vuelo (si aplica)' },
          { key: 'fecha_entrada', label: 'Fecha de entrada', type: 'date', required: true },
          { key: 'fecha_salida', label: 'Fecha de salida', type: 'date', required: true }
        ]
      },
      {
        title: 'B. Ubicación de la operación',
        fields: [
          { key: 'lugar_operacion', label: 'Lugar de la operación', required: true, full: true },
          { key: 'coordenadas_operacion', label: 'Coordenadas', required: true, full: true }
        ]
      },
      {
        title: 'C. Identificación de la RPA',
        fields: [
          { key: 'marca_rpa', label: 'Marca', required: true },
          { key: 'modelo_rpa', label: 'Modelo', required: true },
          { key: 'serie_rpa', label: 'Número de serie', required: true },
          { key: 'matricula_rpa', label: 'Matrícula (si aplica)' },
          { key: 'comentarios_operacion', label: 'Comentarios / observaciones de la operación', type: 'textarea', rows: 4, full: true }
        ]
      }
    ]
  }
];

@Component({
  selector: 'app-dvso-form-page',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './dvso-form-page.component.html',
  styleUrls: ['./dvso-form-page.component.css']
})
export class DvsoFormPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly apiBase = API_BASE;
  readonly forms = DVSO_FORMS;
  readonly currentConfig = signal<DvsoFormConfig | null>(null);
  readonly todayDate = new Date().toISOString().slice(0, 10);
  readonly todayDisplayDate = this.formatDisplayDate(this.todayDate);
  readonly dvso801PresentationPlace = `Guatemala, ${this.formatDisplayDate(this.todayDate)}`;
  readonly pageTitle = computed(() => this.currentConfig()?.title || 'Formulario DVSO');

  status: { type: 'success' | 'error'; message: string } | null = null;
  isSubmitting = false;

  form = this.fb.group({});

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const slug = String(params.get('slug') || '').trim().toLowerCase();
      const config = this.forms.find((entry) => entry.slug === slug) || this.forms[0];
      this.currentConfig.set(config);
      this.buildForm(config);
    });
  }

  isDvso623() {
    return this.currentConfig()?.slug === 'dvso-623';
  }

  isDvso639() {
    return this.currentConfig()?.slug === 'dvso-639';
  }

  isDvso801() {
    return this.currentConfig()?.slug === 'dvso-801';
  }

  buildForm(config: DvsoFormConfig) {
    const controls: Record<string, unknown[]> = {};
    for (const section of config.sections) {
      for (const field of section.fields) {
        const validators = [];
        if (field.required) validators.push(Validators.required);
        if (field.type === 'email') validators.push(Validators.email);
        controls[field.key] = ['', validators];
      }
    }
    this.form = this.fb.group(controls);
    if (config.slug === 'dvso-623') {
      this.form.patchValue({
        fecha_emision: this.todayDate
      }, { emitEvent: false });
    }
    if (config.slug === 'dvso-639') {
      this.form.patchValue({
        firma_fecha: this.todayDate
      }, { emitEvent: false });
    }
    if (config.slug === 'dvso-801') {
      this.form.patchValue({
        lugar_fecha_presentacion: this.dvso801PresentationPlace
      }, { emitEvent: false });
    }
    this.status = null;
  }

  private formatDisplayDate(value: string) {
    const [year, month, day] = String(value || '').split('-');
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  }

  fieldType(field: DvsoField) {
    return field.type || 'text';
  }

  fieldRows(field: DvsoField) {
    return field.rows || 3;
  }

  isReadonlyField(field: DvsoField) {
    const slug = this.currentConfig()?.slug;
    if (!slug) return false;
    if (slug === 'dvso-623') return field.key === 'fecha_emision';
    if (slug === 'dvso-639') return field.key === 'firma_fecha';
    return false;
  }

  getFieldError(field: DvsoField): string | null {
    const control = this.form.get(field.key);
    if (!control || !control.touched || !control.invalid) return null;
    if (control.errors?.['required']) return 'Campo obligatorio';
    if (control.errors?.['email']) return 'Correo no válido';
    return 'Valor no válido';
  }

  onSubmit() {
    const config = this.currentConfig();
    if (!config) return;
    this.status = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const values = this.form.getRawValue() as Record<string, string>;
    this.isSubmitting = true;
    this.buildPayload(config, values)
      .then((payload) => {
        this.http.post(`${this.apiBase}/submissions`, payload).subscribe({
          next: (saved: any) => {
            const registro = saved?.registro_codigo ? ` Correlativo: ${saved.registro_codigo}.` : '';
            this.status = { type: 'success', message: `Formulario DVSO enviado correctamente.${registro}` };
            this.form.reset();
            this.buildForm(config);
            this.isSubmitting = false;
          },
          error: (err) => {
            this.status = { type: 'error', message: err?.error?.error || 'No se pudo enviar el formulario DVSO.' };
            this.isSubmitting = false;
          }
        });
      })
      .catch(() => {
        this.status = { type: 'error', message: 'No se pudo preparar el PDF original del formulario 801.' };
        this.isSubmitting = false;
      });
  }

  private async buildPayload(config: DvsoFormConfig, values: Record<string, string>) {
    if (config.slug === 'dvso-639') {
      return this.buildDvso639Payload(config, values);
    }
    const payload = this.buildBasePayload(config, values);
    if (config.slug === 'dvso-801') {
      const originalForm = await this.buildDvso801OriginalPdf(values);
      return {
        ...payload,
        original_form_pdf_base64: originalForm.base64,
        original_form_filename: originalForm.filename,
        original_form_mime: 'application/pdf'
      };
    }
    return payload;
  }

  private buildBasePayload(config: DvsoFormConfig, values: Record<string, string>) {
    const map = config.payloadMap;
    const detail = {
      tipo: 'dvso',
      codigo: config.code,
      slug: config.slug,
      titulo: config.title,
      ...values
    };
    return {
      unidad_clave: 'DVSO',
      gestion_nombre: config.title,
      nombre_propietario: String(values[map.nameField] || '').trim(),
      representante_legal: map.secondaryNameField ? String(values[map.secondaryNameField] || '').trim() : null,
      documento_propietario: map.documentField ? String(values[map.documentField] || '').trim() : null,
      direccion: map.addressField ? String(values[map.addressField] || '').trim() : 'N/D',
      telefono: String(values[map.phoneField] || '').trim(),
      correo: String(values[map.emailField] || this.auth.currentUser?.email || '').trim(),
      uso: config.code,
      matricula_tg: map.registrationField ? String(values[map.registrationField] || '').trim() : null,
      numero_serie: map.serialField ? String(values[map.serialField] || '').trim() : null,
      especificaciones: map.notesField ? String(values[map.notesField] || '').trim() : null,
      detalle_formulario: detail
    };
  }

  private async buildDvso801OriginalPdf(values: Record<string, string>) {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const bytes = await fetch('assets/dvso/FORMA-DGAC-DVSO-801-SOLICITUD-DICTAMEN-TECNICO-AERONAVE-PILOTADAS-A-DISTANCIA-RPA.pdf')
      .then((response) => response.arrayBuffer());
    const pdfDoc = await PDFDocument.load(bytes);
    const page = pdfDoc.getPage(0);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0.1, 0.17, 0.28);

    const writeField = (
      value: string,
      left: number,
      top: number,
      fieldWidth: number,
      opts: { size?: number; align?: 'left' | 'center' } = {}
    ) => {
      const text = String(value || '').trim();
      if (!text) return;
      const size = opts.size || 10;
      const y = height - (top * height) - size;
      const x = left * width;
      const maxWidth = fieldWidth * width;
      const activeFont = opts.align === 'center' ? boldFont : font;
      const textWidth = activeFont.widthOfTextAtSize(text, size);
      const drawX = opts.align === 'center'
        ? x + Math.max(0, (maxWidth - textWidth) / 2)
        : x + 2;
      page.drawText(text, {
        x: drawX,
        y,
        size,
        font: activeFont,
        color: ink,
        maxWidth
      });
    };

    writeField(values['lugar_fecha_presentacion'], 0.37, 0.228, 0.395);
    writeField(values['entidad_nombre'], 0.196, 0.358, 0.607);
    writeField(values['correo_contacto'], 0.338, 0.407, 0.437);
    writeField(values['telefono_contacto'], 0.338, 0.454, 0.448);
    writeField(values['marca_rpa'], 0.252, 0.541, 0.54);
    writeField(values['modelo_rpa'], 0.259, 0.577, 0.532);
    writeField(values['serie_rpa'], 0.411, 0.613, 0.428);
    writeField(values['peso_rpa'], 0.566, 0.65, 0.227);
    writeField(values['cantidad_rpa'], 0.272, 0.686, 0.519);
    writeField(values['firma_solicitante'], 0.244, 0.839, 0.468, { size: 11, align: 'center' });

    return {
      base64: this.bytesToBase64(await pdfDoc.save()),
      filename: `dvso-801-${this.todayDate}.pdf`
    };
  }

  private bytesToBase64(bytes: Uint8Array) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  private buildDvso639Payload(config: DvsoFormConfig, values: Record<string, string>) {
    const ownerLine = String(values['propietario_nombre_direccion'] || '').trim();
    const ownerContactLine = String(values['propietario_contacto'] || '').trim();
    const emailMatch = ownerContactLine.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const phoneMatch = ownerContactLine.match(/[\d+\-()\s]{8,}/);
    const importerLine = String(values['importador_nombre_direccion'] || '').trim();

    const detail = {
      tipo: 'dvso',
      codigo: config.code,
      slug: config.slug,
      titulo: config.title,
      ...values
    };

    return {
      unidad_clave: 'DVSO',
      gestion_nombre: config.title,
      nombre_propietario: ownerLine,
      representante_legal: String(values['solicitante_nombre'] || '').trim() || null,
      documento_propietario: null,
      direccion: ownerLine || 'N/D',
      telefono: phoneMatch ? phoneMatch[0].trim() : 'N/D',
      correo: emailMatch ? emailMatch[0].trim() : String(this.auth.currentUser?.email || '').trim(),
      uso: config.code,
      matricula_tg: String(values['matricula_aeronave'] || '').trim() || null,
      numero_serie: String(values['serie_aeronave'] || '').trim() || null,
      especificaciones: [
        values['informacion_adicional'],
        importerLine ? `Importador: ${importerLine}` : '',
        values['ubicacion_inspeccion'] ? `Ubicación inspección: ${values['ubicacion_inspeccion']}` : '',
        values['firma_fecha'] ? `Firma y fecha: ${values['firma_fecha']}` : ''
      ].filter(Boolean).join('\n'),
      detalle_formulario: detail
    };
  }

}



