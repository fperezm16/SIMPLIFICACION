import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { API_BASE } from './api.config';
import { AuthService } from './auth.service';
import { Submission } from './submission.model';

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
  downloadLabel?: string;
  additionalPdfAssets?: Array<{ label: string; asset: string; filename: string }>;
  sections: DvsoSection[];
  payloadMap: DvsoPayloadMap;
};

const DVSO_FORMS: DvsoFormConfig[] = [
  {
    slug: 'dvso-623',
    code: 'DVSO-623',
    shortLabel: 'Certificado exportación ala fija',
    title: 'FORMA DGAC DVSO-623 CERTIFICADO DE AERONAVEGABILIDAD PARA EXPORTACIÓN ALA FIJA',
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
    shortLabel: 'Solicitud y anexo de exportación',
    title: 'DVSO-639 SOLICITUD Y DVSO-639A ANEXO PARA CERTIFICADO DE EXPORTACIÓN',
    subtitle: 'Solicitud y anexo para tramitar el certificado de aeronavegabilidad para exportación.',
    pdfAsset: 'assets/dvso/FORMA-DGAC-DVSO-639-SOLICITUD-PARA-CERTIFICADO-DE-AERONAVEGABILIDAD-PARA-EXPORTACION.pdf',
    downloadLabel: 'Descargar DVSO-639 Solicitud para Certificado de Aeronavegabilidad para Exportación',
    additionalPdfAssets: [
      {
        label: 'Descargar DVSO-639A Anexo a Solicitud para Certificado de Exportación',
        asset: 'assets/dvso/FORMA-DGAC-DVSO-639A-ANEXO-A-SOLICITUD-PARA-CERTIFICADO-DE-EXPORTACION.pdf',
        filename: 'DVSO-639A.pdf'
      }
    ],
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
  imports: [CommonModule],
  templateUrl: './dvso-form-page.component.html',
  styleUrls: ['./dvso-form-page.component.css']
})
export class DvsoFormPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly apiBase = API_BASE;
  readonly forms = DVSO_FORMS.filter((form) => !['dvso-623', 'dvso-623a', 'dvso-639a'].includes(form.slug));
  readonly currentConfig = signal<DvsoFormConfig | null>(null);
  readonly pageTitle = computed(() => this.currentConfig()?.title || 'Formulario DVSO');
  readonly maxFileSize = 10 * 1024 * 1024;

  status: { type: 'success' | 'error'; message: string } | null = null;
  isSubmitting = false;
  selectedFile: File | null = null;
  editingReturnedId: number | null = null;
  returnedReason = '';
  loadingReturnedEdit = false;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const slug = String(params.get('slug') || '').trim().toLowerCase();
      const config = this.forms.find((entry) => entry.slug === slug) || this.forms[0];
      this.currentConfig.set(config);
      this.selectedFile = null;
      this.status = null;
    });
    this.route.queryParamMap.subscribe((params) => {
      const returnedId = Number(params.get('editReturned'));
      if (Number.isInteger(returnedId) && returnedId > 0) {
        this.startReturnedEdit(returnedId);
      }
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.status = null;
    this.selectedFile = null;
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.status = { type: 'error', message: 'El formulario debe cargarse en formato PDF.' };
      input.value = '';
      return;
    }
    if (file.size > this.maxFileSize) {
      this.status = { type: 'error', message: 'El archivo supera el tamaño máximo de 10 MB.' };
      input.value = '';
      return;
    }
    this.selectedFile = file;
  }

  async onSubmit() {
    const config = this.currentConfig();
    if (!config) return;
    this.status = null;
    if (!this.selectedFile) {
      this.status = { type: 'error', message: 'Debes seleccionar el formulario completado en PDF.' };
      return;
    }

    this.isSubmitting = true;
    try {
      const base64 = await this.readFileAsBase64(this.selectedFile);
      const currentUser = this.auth.currentUser;
      const payload = {
        unidad_clave: 'DVSO',
        gestion_nombre: config.title,
        nombre_propietario: String(currentUser?.name || currentUser?.email || 'Usuario DVSO').trim(),
        correo: String(currentUser?.email || '').trim(),
        telefono: null,
        direccion: 'N/D',
        uso: config.code,
        detalle_formulario: {
          tipo: 'dvso',
          codigo: config.code,
          slug: config.slug,
          titulo: config.title,
          formularios_incluidos: config.additionalPdfAssets?.length ? [config.code, 'DVSO-639A'] : [config.code],
          modalidad: 'formulario_pdf_cargado'
        },
        original_form_pdf_base64: base64,
        original_form_filename: this.selectedFile.name,
        original_form_mime: 'application/pdf'
      };
      const request = this.editingReturnedId
        ? this.http.put(`${this.apiBase}/my-submissions/${this.editingReturnedId}/resubmit`, payload)
        : this.http.post(`${this.apiBase}/submissions`, payload);
      request.subscribe({
        next: (saved: any) => {
          const registro = saved?.registro_codigo ? ` Correlativo: ${saved.registro_codigo}.` : '';
          const message = this.editingReturnedId
            ? 'El nuevo formulario DVSO fue enviado nuevamente para revisión.'
            : `Solicitud DVSO enviada correctamente.${registro}`;
          this.status = { type: 'success', message };
          this.selectedFile = null;
          this.editingReturnedId = null;
          this.returnedReason = '';
          this.isSubmitting = false;
        },
        error: (err) => {
          this.status = { type: 'error', message: err?.error?.error || 'No se pudo enviar la solicitud DVSO.' };
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

  private startReturnedEdit(returnedId: number) {
    this.loadingReturnedEdit = true;
    this.status = null;
    this.selectedFile = null;
    this.http.get<Submission>(`${this.apiBase}/my-submissions/${returnedId}`).subscribe({
      next: (submission) => {
        if (String(submission.unidad_clave || '').toUpperCase() !== 'DVSO' || !submission.returned_at) {
          this.status = { type: 'error', message: 'La solicitud indicada no está disponible para corrección.' };
          this.loadingReturnedEdit = false;
          return;
        }
        const detail = submission.detalle_formulario && typeof submission.detalle_formulario === 'object'
          ? submission.detalle_formulario as Record<string, unknown>
          : {};
        const rawSlug = String(detail['slug'] || '').trim().toLowerCase();
        const slug = rawSlug === 'dvso-639a' || !rawSlug ? 'dvso-639' : rawSlug;
        const config = this.forms.find((entry) => entry.slug === slug);
        if (config) this.currentConfig.set(config);
        this.editingReturnedId = submission.id;
        this.returnedReason = String(submission.returned_reason || submission.comentarios_revision || '').trim();
        this.loadingReturnedEdit = false;
      },
      error: () => {
        this.loadingReturnedEdit = false;
        this.status = { type: 'error', message: 'No se pudo abrir la solicitud DVSO devuelta.' };
      }
    });
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



