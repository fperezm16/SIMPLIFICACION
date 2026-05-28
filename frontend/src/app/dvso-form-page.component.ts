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
    shortLabel: 'Certificado exportaci?n ala fija',
    title: 'FORMA DGAC DVSO-623 CERTIFICADO DE AERONAVEGABILIDAD PARA EXPORTACI?N ALA FIJA',
    subtitle: 'Certificado de aeronavegabilidad para exportaci?n de aeronaves de ala fija.',
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
          { key: 'numero_certificado', label: 'N?mero de certificado', required: true },
          { key: 'certificado_tipo_numero', label: 'N?mero de certificado tipo', required: true },
          { key: 'producto_tipo', label: 'Producto', required: true },
          { key: 'fabricante_aeronave', label: 'Fabricante', required: true },
          { key: 'modelo_aeronave', label: 'Modelo', required: true },
          { key: 'serie_aeronave', label: 'N?mero de serie', required: true },
          {
            key: 'condicion_aeronave',
            label: 'Condici?n',
            type: 'select',
            required: true,
            options: [
              { value: 'nuevo', label: 'Nuevo' },
              { value: 'usado', label: 'Usado' }
            ]
          },
          { key: 'pais_destino', label: 'Pa?s al que se exporta', required: true },
          { key: 'matricula_aeronave', label: 'Aeronave', required: true },
          { key: 'tiempo_total_aeronave', label: 'Tiempo total de la aeronave', required: true },
          { key: 'motor_marca', label: 'Motor - Marca', required: true },
          { key: 'motor_modelo', label: 'Motor - Modelo', required: true },
          { key: 'motor_serie', label: 'Motor - Serie(s)', required: true },
          { key: 'motor_tiempo_total', label: 'Motor - Tiempo total', required: true },
          { key: 'motor_tiempo_tdr', label: 'Motor - Tiempo TDR', required: true },
          { key: 'helice_marca', label: 'H?lice - Marca', required: true },
          { key: 'helice_modelo', label: 'H?lice - Modelo', required: true },
          { key: 'helice_serie', label: 'H?lice - Serie(s)', required: true },
          { key: 'helice_tiempo_total', label: 'H?lice - Tiempo total', required: true },
          { key: 'helice_tiempo_tdr', label: 'H?lice - Tiempo TDR', required: true },
          { key: 'excepciones', label: 'Excepciones', type: 'textarea', rows: 3, full: true },
          { key: 'fecha_emision', label: 'Fecha', type: 'date', required: true },
          { key: 'contacto_correo', label: 'Correo electr?nico de contacto', type: 'email', required: true }
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
    title: 'FORMA DGAC DVSO-639 SOLICITUD PARA CERTIFICADO DE AERONAVEGABILIDAD PARA EXPORTACIÓN',
    subtitle: 'Solicitud del certificado de aeronavegabilidad para exportación.',
    pdfAsset: 'assets/dvso/FORMA-DGAC-DVSO-639-SOLICITUD-PARA-CERTIFICADO-DE-AERONAVEGABILIDAD-PARA-EXPORTACION.pdf',
    payloadMap: {
      nameField: 'propietario_nombre',
      addressField: 'propietario_direccion',
      phoneField: 'propietario_telefono',
      emailField: 'propietario_correo',
      registrationField: 'matricula_aeronave',
      serialField: 'serie_aeronave',
      notesField: 'informacion_adicional'
    },
    sections: [
      {
        title: 'Datos del propietario',
        fields: [
          { key: 'matricula_aeronave', label: 'Matrícula de la aeronave', required: true },
          { key: 'propietario_nombre', label: 'Nombre del propietario', required: true },
          { key: 'propietario_direccion', label: 'Dirección del propietario', required: true, full: true },
          { key: 'propietario_telefono', label: 'Número de teléfono del propietario', type: 'tel', required: true },
          { key: 'propietario_correo', label: 'Correo electrónico del propietario', type: 'email', required: true }
        ]
      },
      {
        title: 'Detalles de la aeronave',
        fields: [
          { key: 'fabricante_aeronave', label: 'Fabricante de la aeronave', required: true },
          { key: 'tipo_modelo_aeronave', label: 'Tipo y modelo de la aeronave', required: true },
          { key: 'serie_aeronave', label: 'Número de serie de la aeronave', required: true },
          { key: 'categoria_aeronave', label: 'Categoría de la aeronave', required: true },
          { key: 'motores_detalle', label: 'Detalle de motor(es)', type: 'textarea', rows: 3, full: true, required: true },
          { key: 'helices_detalle', label: 'Detalle de hélice(s)', type: 'textarea', rows: 3, full: true },
          { key: 'rotor_principal', label: 'Rotor principal (si aplica)', full: true },
          { key: 'rotor_cola', label: 'Rotor de cola (si aplica)', full: true },
          { key: 'peso_maximo_rodaje', label: 'Peso máximo de rodaje (kg)', type: 'number' },
          { key: 'peso_maximo_despegue', label: 'Peso máximo de despegue (kg)', type: 'number' }
        ]
      },
      {
        title: 'Datos de exportación',
        fields: [
          { key: 'pais_importacion', label: 'País de importación', required: true },
          { key: 'importador_nombre', label: 'Nombre del importador', required: true },
          { key: 'importador_direccion', label: 'Dirección del importador', required: true, full: true },
          { key: 'ubicacion_inspeccion', label: 'Ubicación de la aeronave para inspección física', required: true, full: true },
          { key: 'informacion_adicional', label: 'Información adicional o requisitos especiales del Estado importador', type: 'textarea', rows: 4, full: true }
        ]
      },
      {
        title: 'Declaración',
        fields: [
          { key: 'solicitante_nombre', label: 'Nombre del solicitante', required: true },
          { key: 'solicitante_cargo', label: 'Cargo del solicitante', required: true },
          { key: 'declaracion_veracidad', label: 'Declaración de veracidad de la información', type: 'textarea', rows: 3, full: true, required: true }
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
          { key: 'uso_previsto', label: 'Uso previsto / comentarios', type: 'textarea', rows: 4, full: true }
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
        fecha_emision: this.todayDate,
        contacto_correo: this.auth.currentUser?.email || ''
      }, { emitEvent: false });
    }
    this.status = null;
  }

  fieldType(field: DvsoField) {
    return field.type || 'text';
  }

  fieldRows(field: DvsoField) {
    return field.rows || 3;
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
    const payload = this.buildPayload(config, values);

    this.isSubmitting = true;
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
  }

  private buildPayload(config: DvsoFormConfig, values: Record<string, string>) {
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

}
