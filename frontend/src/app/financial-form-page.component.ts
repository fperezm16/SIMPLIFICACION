import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { API_BASE } from './api.config';
import { Submission } from './submission.model';

function digitsExact(length: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = String(control.value ?? '').trim();
    if (!raw) return null;
    if (!/^\d+$/.test(raw)) return { digitsOnly: true };
    if (raw.length !== length) {
      return { digitsLength: { requiredLength: length, actualLength: raw.length } };
    }
    return null;
  };
}

type GestionFieldKey =
  | 'area'
  | 'nomenclatura_area'
  | 'anio'
  | 'matricula'
  | 'peso_kg'
  | 'numero_placa'
  | 'nombre_taller'
  | 'otros_detalle'
  | 'monto_referencia'
  | 'certificado_operativo_subtipo';

type GestionOption = {
  value: string;
  label: string;
  amountOptions?: string[];
  requiredFields?: GestionFieldKey[];
};

type GestionGroupOption = {
  value: string;
  label: string;
  processes: GestionOption[];
};

type FinancialDetail = {
  tipo?: 'financiero_solvencia_pago';
  gestion_grupo_codigo?: string;
  gestion_grupo_label?: string;
  proceso_codigo?: string;
  proceso_label?: string;
  nombre_empresa?: string;
  nombre_solicitante?: string;
  dpi_solicitante?: string;
  carta_representacion?: string;
  gestion_codigo?: string;
  gestion_label?: string;
  certificado_operativo_subtipo?: string;
  monto_referencia?: string;
  area?: string;
  nomenclatura_area?: string;
  anio?: string;
  matricula?: string;
  peso_kg?: string;
  numero_placa?: string;
  tipo_vehiculo?: string;
  color_vehiculo?: string;
  marca_vehiculo?: string;
  fecha_pago_mora?: string;
  documento_peso_aeronave?: string;
  nombre_taller?: string;
  otros_detalle?: string;
  idioma_ingles?: boolean;
  idioma_espanol?: boolean;
  documentos_financieros?: Partial<Record<FinancialExtraFileKey, string | string[]>>;
};

type FinancialExtraFileKey =
  | 'declaraguateCirculacion'
  | 'facturaInspeccion'
  | 'facturaAproximacion'
  | 'cambioDuenoMatricula'
  | 'certificadoAeronavegabilidad'
  | 'solvenciaAnterior';

type FinancialExtraFileDefinition = {
  key: FinancialExtraFileKey;
  title: string;
  hint: string;
  requirement: 'always' | 'change' | 'renewal' | 'optional';
  fallback: string;
};

type FinancialExtraPayloadKey =
  | FinancialExtraFileKey
  | 'declaraguateCirculacion2'
  | 'declaraguateCirculacion3'
  | 'declaraguateCirculacion4'
  | 'declaraguateCirculacion5';

@Component({
    selector: 'app-financial-form-page',
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './financial-form-page.component.html',
    styleUrls: ['./financial-form-page.component.css']
})
export class FinancialFormPageComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly apiBase = API_BASE;
  readonly processOptions: GestionOption[] = [
    {
      value: 'renovacion_arrendamiento',
      label: 'Solvencia por renovaci\u00f3n de Contrato por Arrendamiento',
      requiredFields: ['area', 'nomenclatura_area']
    },
    {
      value: 'gestion_tia',
      label: 'Solvencia por gesti\u00f3n de Tarjeta de Identificaci\u00f3n Aeroportuaria',
      requiredFields: ['area', 'nomenclatura_area', 'anio']
    },
    {
      value: 'derecho_inspeccion',
      label: 'Derecho De Inspecci\u00f3n y Aproximaci\u00f3n Matr\u00edcula Guatemalteca',
      amountOptions: ['Q1,000.00', 'Q300.00'],
      requiredFields: ['matricula', 'peso_kg', 'monto_referencia']
    },
    {
      value: 'cancelacion_matricula',
      label: 'Solvencia aeronave por cancelaci\u00f3n de matr\u00edcula',
      requiredFields: ['matricula']
    },
    {
      value: 'certificado_operativo',
      label: 'Certificado Operativo',
      requiredFields: ['certificado_operativo_subtipo']
    },
    {
      value: 'certificado_operador_aereo',
      label: 'Certificado Operador A\u00e9reo',
      amountOptions: ['Q1,000.00'],
      requiredFields: ['matricula', 'monto_referencia']
    },
    {
      value: 'cambio_datos_certificados',
      label: 'Cambio De Datos En Los Certificados',
      requiredFields: ['matricula']
    },
    {
      value: 'autorizacion_vuelo_ferry',
      label: 'Autorizaci\u00f3n para Vuelo Ferry',
      amountOptions: ['Q225.00'],
      requiredFields: ['matricula', 'monto_referencia']
    },
    {
      value: 'inspeccion_taller',
      label: 'Inspecci\u00f3n de Taller',
      amountOptions: ['Q200.00'],
      requiredFields: ['nombre_taller', 'monto_referencia']
    },
    {
      value: 'permiso_especial_vuelo',
      label: 'Emisi\u00f3n y/o Renovaci\u00f3n de Permiso Especial de Vuelo para Aeronaves (GNA 03)',
      amountOptions: ['Q1,000.00'],
      requiredFields: ['matricula', 'monto_referencia']
    },
    {
      value: 'solvencia_aeronavegabilidad',
      label: 'Solvencia Aeronave Primer/Renovaci\u00f3n Certificado de Aeronavegabilidad',
      requiredFields: ['matricula']
    },
    {
      value: 'solvencia_financiera_aeronave',
      label: 'Solvencia financiera de Aeronave',
      requiredFields: ['matricula']
    }
  ];
  readonly groupOptions: GestionGroupOption[] = [
    {
      value: 'solvencias',
      label: 'Solicitud para emisión de solvencia financiera',
      processes: this.processOptions.filter((option) => [
        'renovacion_arrendamiento',
        'gestion_tia',
        'cancelacion_matricula',
        'solvencia_aeronavegabilidad',
        'solvencia_financiera_aeronave'
      ].includes(option.value))
    },
    {
      value: 'otros_tramites',
      label: 'Solicitud para emisión de contraseña de pago de otros rubros',
      processes: this.processOptions.filter((option) => ![
        'renovacion_arrendamiento',
        'gestion_tia',
        'cancelacion_matricula',
        'solvencia_aeronavegabilidad',
        'solvencia_financiera_aeronave'
      ].includes(option.value))
    }
  ];
  private readonly solvenciaRequirementProcessCodes = new Set([
    'cancelacion_matricula',
    'solvencia_aeronavegabilidad',
    'solvencia_financiera_aeronave'
  ]);
  readonly financialExtraFileDefinitions: FinancialExtraFileDefinition[] = [
    {
      key: 'declaraguateCirculacion',
      title: 'Últimos 5 formularios de Declaraguate',
      hint: 'Impuesto de circulación de aeronave en estado 4 de 4 presentado. Adjunta 5 PDF individuales. Máximo 10 MB por PDF.',
      requirement: 'always',
      fallback: 'Seleccionar PDF de Declaraguate...'
    },
    {
      key: 'facturaInspeccion',
      title: 'Factura de inspección del año en curso',
      hint: 'Adjunta la factura de inspección correspondiente al año actual. Máximo 10 MB.',
      requirement: 'always',
      fallback: 'Seleccionar PDF de factura de inspección...'
    },
    {
      key: 'facturaAproximacion',
      title: 'Factura de aproximación del año en curso',
      hint: 'Adjunta la factura de aproximación correspondiente al año actual. Máximo 10 MB.',
      requirement: 'always',
      fallback: 'Seleccionar PDF de factura de aproximación...'
    },
    {
      key: 'cambioDuenoMatricula',
      title: 'Documentos del antiguo dueño y certificado de aeronavegabilidad',
      hint: 'Obligatorio únicamente cuando aplique cambio de dueño o matrícula. Máximo 10 MB.',
      requirement: 'change',
      fallback: 'Seleccionar PDF de cambio de dueño o matrícula...'
    },
    {
      key: 'certificadoAeronavegabilidad',
      title: 'Certificado de aeronavegabilidad actual',
      hint: 'Adjunta el certificado de aeronavegabilidad vigente. Máximo 10 MB.',
      requirement: 'optional',
      fallback: 'Seleccionar PDF de certificado de aeronavegabilidad...'
    },
    {
      key: 'solvenciaAnterior',
      title: 'Solvencia del año anterior',
      hint: 'Obligatorio en caso de renovación. Máximo 10 MB.',
      requirement: 'renewal',
      fallback: 'Seleccionar PDF de solvencia anterior...'
    }
  ];

  form = this.fb.group({
    fecha: [''],
    nit: ['', Validators.required],
    nombre_empresa: ['', [Validators.required, Validators.minLength(3)]],
    correo: ['', [Validators.required, Validators.email]],
    telefono: ['', [Validators.required, digitsExact(8)]],
    nombre_solicitante: ['', [Validators.required, Validators.minLength(3)]],
    dpi_solicitante: ['', [Validators.required, digitsExact(13)]],
    carta_representacion: [''],
    gestion_codigo: ['', Validators.required],
    proceso_codigo: ['', Validators.required],
    certificado_operativo_subtipo: [''],
    monto_referencia: [''],
    area: [''],
    nomenclatura_area: [''],
    anio: [''],
    matricula: [''],
    peso_kg: [''],
    numero_placa: [''],
    tipo_vehiculo: [''],
    color_vehiculo: [''],
    marca_vehiculo: [''],
    fecha_pago_mora: [''],
    nombre_taller: [''],
    otros_detalle: [''],
    idioma_ingles: [false],
    idioma_espanol: [false]
  });

  todayDate = '';
  isSubmitting = false;
  status: { type: 'success' | 'error'; message: string } | null = null;
  editingReturnedId: number | null = null;
  loadingReturnedEdit = false;
  readonly maxPdfSizeBytes = 10 * 1024 * 1024;
  readonly declaraguateSlots = [0, 1, 2, 3, 4];
  cartaRepresentacionFile: File | null = null;
  cartaRepresentacionError = '';
  existingCartaRepresentacionFilename = '';
  financialDeclaraguateFiles: Array<File | null> = [null, null, null, null, null];
  financialDeclaraguateFileErrors = ['', '', '', '', ''];
  existingFinancialDeclaraguateFilenames = ['', '', '', '', ''];
  pesoAeronaveFile: File | null = null;
  pesoAeronaveError = '';
  existingPesoAeronaveFilename = '';
  financialExtraFiles: Record<FinancialExtraFileKey, File | null> = {
    declaraguateCirculacion: null,
    facturaInspeccion: null,
    facturaAproximacion: null,
    cambioDuenoMatricula: null,
    certificadoAeronavegabilidad: null,
    solvenciaAnterior: null
  };
  financialExtraFileErrors: Record<FinancialExtraFileKey, string> = {
    declaraguateCirculacion: '',
    facturaInspeccion: '',
    facturaAproximacion: '',
    cambioDuenoMatricula: '',
    certificadoAeronavegabilidad: '',
    solvenciaAnterior: ''
  };
  existingFinancialExtraFilenames: Record<FinancialExtraFileKey, string> = {
    declaraguateCirculacion: '',
    facturaInspeccion: '',
    facturaAproximacion: '',
    cambioDuenoMatricula: '',
    certificadoAeronavegabilidad: '',
    solvenciaAnterior: ''
  };
  lockedGestionCode = '';

  ngOnInit(): void {
    this.syncFechaHoy();
    this.form.get('certificado_operativo_subtipo')?.valueChanges.subscribe(() => this.applyGestionValidators());
    this.route.queryParamMap.subscribe((params) => {
      const requestedGestion = String(params.get('gestion') || '').trim();
      if (requestedGestion === 'solvencias' || requestedGestion === 'otros_tramites') {
        this.lockedGestionCode = requestedGestion;
        this.setGestionGroup(requestedGestion);
      } else {
        this.lockedGestionCode = '';
      }
      const rawId = params.get('editReturned');
      if (!rawId) return;
      const returnedId = Number(rawId);
      if (!Number.isInteger(returnedId) || returnedId <= 0) return;
      this.startReturnedEditById(returnedId);
    });
    this.applyGestionValidators();
  }

  getFieldError(field: string): string | null {
    const control = this.form.get(field);
    if (!control || !control.touched || !control.invalid) return null;
    if (control.errors?.['required']) return 'Campo obligatorio';
    if (control.errors?.['email']) return 'Correo no valido';
    if (control.errors?.['digitsOnly']) return 'Solo se permiten digitos';
    if (control.errors?.['digitsLength']) {
      return `Debe tener ${control.errors['digitsLength'].requiredLength} digitos`;
    }
    if (control.errors?.['minlength']) {
      return `Minimo ${control.errors['minlength'].requiredLength} caracteres`;
    }
    return 'Valor no valido';
  }

  onDigitsInput(event: Event, field: string, maxLength: number) {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    const normalized = String(input.value || '').replace(/\D+/g, '').slice(0, maxLength);
    if (input.value !== normalized) input.value = normalized;
    this.form.get(field)?.setValue(normalized, { emitEvent: false });
  }

  onCartaRepresentacionSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] || null;
    this.cartaRepresentacionFile = null;
    this.cartaRepresentacionError = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      this.cartaRepresentacionError = 'El archivo debe ser PDF.';
      if (input) input.value = '';
      return;
    }
    if (file.size > this.maxPdfSizeBytes) {
      this.cartaRepresentacionError = 'El PDF no puede superar los 10 MB.';
      if (input) input.value = '';
      return;
    }
    this.cartaRepresentacionFile = file;
    this.existingCartaRepresentacionFilename = file.name;
    if (input) input.value = '';
  }

  onFinancialExtraPdfSelected(event: Event, key: FinancialExtraFileKey) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] || null;
    this.financialExtraFiles[key] = null;
    this.financialExtraFileErrors[key] = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      this.financialExtraFileErrors[key] = 'El archivo debe ser PDF.';
      if (input) input.value = '';
      return;
    }
    if (file.size > this.maxPdfSizeBytes) {
      this.financialExtraFileErrors[key] = 'El PDF no puede superar los 10 MB.';
      if (input) input.value = '';
      return;
    }
    this.financialExtraFiles[key] = file;
    this.existingFinancialExtraFilenames[key] = file.name;
    if (input) input.value = '';
  }

  onDeclaraguatePdfSelected(event: Event, index: number) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] || null;
    this.financialDeclaraguateFiles[index] = null;
    this.financialDeclaraguateFileErrors[index] = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      this.financialDeclaraguateFileErrors[index] = 'El archivo debe ser PDF.';
      if (input) input.value = '';
      return;
    }
    if (file.size > this.maxPdfSizeBytes) {
      this.financialDeclaraguateFileErrors[index] = 'El PDF no puede superar los 10 MB.';
      if (input) input.value = '';
      return;
    }
    this.financialDeclaraguateFiles[index] = file;
    this.existingFinancialDeclaraguateFilenames[index] = file.name;
    if (input) input.value = '';
  }

  declaraguateFileLabel(index: number) {
    return this.financialDeclaraguateFiles[index]?.name ||
      this.existingFinancialDeclaraguateFilenames[index] ||
      `Seleccionar Declaraguate ${index + 1}...`;
  }

  onPesoAeronavePdfSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] || null;
    this.pesoAeronaveFile = null;
    this.pesoAeronaveError = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      this.pesoAeronaveError = 'El archivo debe ser PDF.';
      if (input) input.value = '';
      return;
    }
    if (file.size > this.maxPdfSizeBytes) {
      this.pesoAeronaveError = 'El PDF no puede superar los 10 MB.';
      if (input) input.value = '';
      return;
    }
    this.pesoAeronaveFile = file;
    this.existingPesoAeronaveFilename = file.name;
    if (input) input.value = '';
  }

  pesoAeronaveFileLabel() {
    return this.pesoAeronaveFile?.name || this.existingPesoAeronaveFilename || 'Seleccionar documento de peso...';
  }

  financialExtraFileLabel(definition: FinancialExtraFileDefinition) {
    return this.financialExtraFiles[definition.key]?.name || this.existingFinancialExtraFilenames[definition.key] || definition.fallback;
  }

  shouldShowFinancialExtraFile(definition: FinancialExtraFileDefinition) {
    return this.shouldShowSolvenciaRequirements();
  }

  isFinancialExtraFileRequired(definition: FinancialExtraFileDefinition) {
    if (!this.shouldShowFinancialExtraFile(definition)) return false;
    if (definition.requirement === 'optional') return false;
    if (definition.requirement === 'change') return this.requiresCambioDuenoMatriculaDocs();
    if (definition.requirement === 'renewal') return this.requiresRenovacionDocs();
    return true;
  }

  shouldShowSolvenciaRequirements() {
    const groupCode = String(this.form.value.gestion_codigo || '').trim();
    const processCode = String(this.form.value.proceso_codigo || '').trim();
    return groupCode === 'solvencias' && this.solvenciaRequirementProcessCodes.has(processCode);
  }

  isGestionSelected(code: string) {
    return String(this.form.value.proceso_codigo || '') === code;
  }

  onGestionSelectionChange(event: Event) {
    const select = event.target as HTMLSelectElement | null;
    const next = String(select?.value || '').trim();
    this.setGestionGroup(next);
  }

  currentGroup() {
    const current = String(this.form.value.gestion_codigo || '');
    return this.groupOptions.find((option) => option.value === current) || null;
  }

  dynamicFormTitle() {
    const current = String(this.form.value.gestion_codigo || '').trim();
    if (current === 'solvencias') return 'SOLICITUD DE SOLVENCIA FINANCIERA';
    if (current === 'otros_tramites') return 'SOLICITUD DE CONTRASEÑA DE PAGO';
    return 'SOLICITUD SOLVENCIA DE PAGO';
  }

  isGestionLocked() {
    return this.lockedGestionCode === 'solvencias' || this.lockedGestionCode === 'otros_tramites';
  }

  private setGestionGroup(next: string) {
    this.form.patchValue({
      gestion_codigo: next,
      proceso_codigo: '',
      certificado_operativo_subtipo: '',
      monto_referencia: '',
      area: '',
      nomenclatura_area: '',
      anio: '',
      matricula: '',
      peso_kg: '',
      numero_placa: '',
      tipo_vehiculo: '',
      color_vehiculo: '',
      marca_vehiculo: '',
      fecha_pago_mora: '',
      nombre_taller: '',
      otros_detalle: '',
      idioma_ingles: false,
      idioma_espanol: false
    }, { emitEvent: false });
    this.clearPesoAeronaveFile();
    this.applyGestionValidators();
    this.clearHiddenFinancialExtraFiles();
  }
  currentProcesses() {
    return this.currentGroup()?.processes || [];
  }

  toggleProcesoSelection(code: string) {
    const current = String(this.form.value.proceso_codigo || '');
    const next = current === code ? '' : code;
    this.form.patchValue({
      proceso_codigo: next,
      certificado_operativo_subtipo: '',
      monto_referencia: '',
      area: '',
      nomenclatura_area: '',
      anio: '',
      matricula: '',
      peso_kg: '',
      numero_placa: '',
      tipo_vehiculo: '',
      color_vehiculo: '',
      marca_vehiculo: '',
      fecha_pago_mora: '',
      nombre_taller: '',
      otros_detalle: '',
      idioma_ingles: false,
      idioma_espanol: false
    }, { emitEvent: false });
    this.clearPesoAeronaveFile();
    this.form.get('proceso_codigo')?.markAsTouched();
    this.applyGestionValidators();
    this.clearHiddenFinancialExtraFiles();
  }

  isProcesoSelected(code: string) {
    return String(this.form.value.proceso_codigo || '') === code;
  }

  toggleMonto(amount: string) {
    const current = String(this.form.value.monto_referencia || '');
    this.form.patchValue({ monto_referencia: current === amount ? '' : amount }, { emitEvent: false });
    this.form.get('monto_referencia')?.markAsTouched();
  }

  isMontoSelected(amount: string) {
    return String(this.form.value.monto_referencia || '') === amount;
  }

  toggleCertificadoOperativoSubtipo(value: string) {
    const current = String(this.form.value.certificado_operativo_subtipo || '');
    const next = current === value ? '' : value;
    this.form.patchValue({
      certificado_operativo_subtipo: next,
      monto_referencia: '',
      numero_placa: '',
      tipo_vehiculo: '',
      color_vehiculo: '',
      marca_vehiculo: '',
      otros_detalle: '',
      idioma_ingles: false,
      idioma_espanol: false
    }, { emitEvent: false });
    this.applyGestionValidators();
  }

  certificadoOperativoSubtipo() {
    return String(this.form.value.certificado_operativo_subtipo || '');
  }

  isCertificadoOperativoSubtipo(value: string) {
    return this.certificadoOperativoSubtipo() === value;
  }

  toggleIdioma(field: 'idioma_ingles' | 'idioma_espanol') {
    const current = Boolean(this.form.value[field]);
    this.form.patchValue({ [field]: !current }, { emitEvent: false });
  }

  currentOption() {
    const current = String(this.form.value.proceso_codigo || '');
    return this.processOptions.find((option) => option.value === current) || null;
  }

  currentAmountOptions() {
    return this.currentOption()?.amountOptions || [];
  }

  getAmountOptions(option: GestionOption) {
    if (option.value === 'certificado_operativo' && this.isCertificadoOperativoSubtipo('calcomania')) {
      return ['Q100.00'];
    }
    return option.amountOptions || [];
  }

  requiresCambioDuenoMatriculaDocs() {
    return this.isGestionSelected('cambio_datos_certificados');
  }

  requiresRenovacionDocs() {
    return [
      'renovacion_arrendamiento',
      'permiso_especial_vuelo',
      'solvencia_aeronavegabilidad'
    ].includes(String(this.form.value.proceso_codigo || ''));
  }

  onSubmit() {
    this.status = null;
    this.syncFechaHoy();
    this.applyGestionValidators();
    if (this.requiresCertificadoOperativoIdioma() && !this.hasIdiomaSeleccionado()) {
      this.status = { type: 'error', message: 'Debes seleccionar Ingl\u00e9s o Espa\u00f1ol para Certificaciones.' };
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.cartaRepresentacionFile && !this.existingCartaRepresentacionFilename) {
      this.cartaRepresentacionError = 'La carta de representación en PDF es obligatoria.';
      return;
    }

    const extraFileError = this.validateFinancialExtraFiles();
    if (extraFileError) {
      this.status = { type: 'error', message: extraFileError };
      return;
    }

    this.isSubmitting = true;
    Promise.all([
      this.readAsBase64(this.cartaRepresentacionFile),
      this.readFinancialExtraFiles(),
      this.readAsBase64(this.pesoAeronaveFile)
    ]).then(([cartaBase64, extraFilePayload, pesoAeronaveBase64]) => {
      const payload = this.buildPayload(cartaBase64, extraFilePayload, pesoAeronaveBase64);
      const request$ = this.editingReturnedId
        ? this.http.put<Submission>(`${this.apiBase}/my-submissions/${this.editingReturnedId}/resubmit`, payload)
        : this.http.post<Submission>(`${this.apiBase}/submissions`, payload);

      request$.subscribe({
        next: (saved) => {
          const registro = saved?.registro_codigo ? ` Correlativo: ${saved.registro_codigo}.` : '';
          this.status = {
            type: 'success',
            message: this.editingReturnedId
              ? `Formulario corregido y reenviado.${registro}`
              : `Formulario enviado correctamente.${registro}`
          };
          this.resetForm();
          this.resetReturnedEditState();
          this.clearEditReturnedQueryParam();
          this.isSubmitting = false;
        },
        error: (err) => {
          const message = String(err?.error?.error || '').trim();
          this.status = {
            type: 'error',
            message: message || 'No se pudo guardar el formulario financiero.'
          };
          this.isSubmitting = false;
        }
      });
    }).catch(() => {
      this.status = { type: 'error', message: 'No se pudo leer uno de los documentos PDF.' };
      this.isSubmitting = false;
    });
  }

  isEditingReturned() {
    return this.editingReturnedId !== null;
  }

  cancelReturnedEdit() {
    this.resetForm();
    this.resetReturnedEditState();
    this.clearEditReturnedQueryParam();
    this.status = null;
  }

  private requiresCertificadoOperativoIdioma() {
    return this.isGestionSelected('certificado_operativo') && this.isCertificadoOperativoSubtipo('certificaciones');
  }

  private hasIdiomaSeleccionado() {
    return Boolean(this.form.value.idioma_ingles) || Boolean(this.form.value.idioma_espanol);
  }

  private requiresPesoAeronavePdf() {
    return this.isGestionSelected('derecho_inspeccion');
  }

  private validateFinancialExtraFiles() {
    if (this.requiresPesoAeronavePdf() && !this.pesoAeronaveFile && !this.existingPesoAeronaveFilename) {
      this.pesoAeronaveError = 'El documento que indica el peso de la aeronave es obligatorio.';
      return this.pesoAeronaveError;
    }
    for (const definition of this.financialExtraFileDefinitions) {
      if (!this.isFinancialExtraFileRequired(definition)) continue;
      if (definition.key === 'declaraguateCirculacion') {
        const missingIndex = this.declaraguateSlots.find((index) =>
          !this.financialDeclaraguateFiles[index] && !this.existingFinancialDeclaraguateFilenames[index]
        );
        if (missingIndex !== undefined) {
          const message = `Debes adjuntar los 5 formularios de Declaraguate. Falta el PDF ${missingIndex + 1}.`;
          this.financialDeclaraguateFileErrors[missingIndex] = message;
          return message;
        }
        continue;
      }
      const hasFile = Boolean(this.financialExtraFiles[definition.key] || this.existingFinancialExtraFilenames[definition.key]);
      if (!hasFile) {
        const message = `${definition.title} es obligatorio.`;
        this.financialExtraFileErrors[definition.key] = message;
        return message;
      }
    }
    return null;
  }

  private clearHiddenFinancialExtraFiles() {
    for (const definition of this.financialExtraFileDefinitions) {
      if (this.shouldShowFinancialExtraFile(definition)) continue;
      this.financialExtraFiles[definition.key] = null;
      this.financialExtraFileErrors[definition.key] = '';
      this.existingFinancialExtraFilenames[definition.key] = '';
    }
  }

  private clearPesoAeronaveFile() {
    this.pesoAeronaveFile = null;
    this.pesoAeronaveError = '';
    this.existingPesoAeronaveFilename = '';
  }

  private applyGestionValidators() {
    const option = this.currentOption();
    const requiredFields = new Set(option?.requiredFields || []);
    this.form.get('gestion_codigo')?.setValidators([Validators.required]);
    this.form.get('gestion_codigo')?.updateValueAndValidity({ emitEvent: false });
    this.form.get('proceso_codigo')?.setValidators([Validators.required]);
    this.form.get('proceso_codigo')?.updateValueAndValidity({ emitEvent: false });
    const fields: GestionFieldKey[] = [
      'area',
      'nomenclatura_area',
      'anio',
      'matricula',
      'peso_kg',
      'numero_placa',
      'nombre_taller',
      'otros_detalle',
      'monto_referencia',
      'certificado_operativo_subtipo'
    ];

    for (const field of fields) {
      const control = this.form.get(field);
      if (!control) continue;
      control.setValidators(requiredFields.has(field) ? [Validators.required] : []);
      control.updateValueAndValidity({ emitEvent: false });
    }

    const subtipo = this.certificadoOperativoSubtipo();
    if (!this.isGestionSelected('certificado_operativo')) {
      this.form.patchValue({
        certificado_operativo_subtipo: '',
        numero_placa: '',
        tipo_vehiculo: '',
        color_vehiculo: '',
        marca_vehiculo: '',
        otros_detalle: '',
        idioma_ingles: false,
        idioma_espanol: false
      }, { emitEvent: false });
    } else {
      if (subtipo !== 'calcomania') {
        this.form.patchValue({
          numero_placa: '',
          tipo_vehiculo: '',
          color_vehiculo: '',
          marca_vehiculo: ''
        }, { emitEvent: false });
      }
      const numeroPlaca = this.form.get('numero_placa');
      const otrosDetalle = this.form.get('otros_detalle');
      if (numeroPlaca) {
        numeroPlaca.setValidators(subtipo === 'calcomania' ? [Validators.required] : []);
        numeroPlaca.updateValueAndValidity({ emitEvent: false });
      }
      const montoReferencia = this.form.get('monto_referencia');
      if (montoReferencia) {
        montoReferencia.setValidators(subtipo === 'calcomania' ? [Validators.required] : []);
        montoReferencia.updateValueAndValidity({ emitEvent: false });
      }
      if (otrosDetalle) {
        otrosDetalle.setValidators(subtipo === 'otros' ? [Validators.required] : []);
        otrosDetalle.updateValueAndValidity({ emitEvent: false });
      }
    }
  }

  private buildPayload(
    cartaRepresentacionBase64: string | null,
    extraFilePayload: Partial<Record<FinancialExtraPayloadKey, string>>,
    pesoAeronaveBase64: string | null
  ) {
    const detail = this.buildDetail();
    return {
      fecha: this.todayDate,
      persona_tipo: 'individual',
      unidad_clave: 'FINANCIERO',
      gestion_nombre: detail.proceso_label || detail.gestion_label || 'Solicitud de solvencia de pago',
      nombre_propietario: detail.nombre_empresa,
      representante_legal: detail.nombre_solicitante,
      documento_propietario: detail.dpi_solicitante,
      telefono: String(this.form.value.telefono || '').trim(),
      correo: String(this.form.value.correo || '').trim(),
      nit: String(this.form.value.nit || '').trim(),
      autorizado_nombre: null,
      uso: 'financiero',
      matricula_tg: detail.matricula || detail.numero_placa || null,
      especificaciones: this.buildSummary(detail),
      detalle_formulario: detail,
      carta_representacion_pdf_base64: cartaRepresentacionBase64 || undefined,
      carta_representacion_filename: this.cartaRepresentacionFile?.name || undefined,
      carta_representacion_mime: this.cartaRepresentacionFile?.type || undefined,
      dpi_pdf_base64: extraFilePayload.declaraguateCirculacion || undefined,
      dpi_filename: this.financialDeclaraguateFiles[0]?.name || undefined,
      dpi_mime: this.financialDeclaraguateFiles[0]?.type || undefined,
      financial_declaraguate_2_pdf_base64: extraFilePayload.declaraguateCirculacion2 || undefined,
      financial_declaraguate_2_filename: this.financialDeclaraguateFiles[1]?.name || undefined,
      financial_declaraguate_2_mime: this.financialDeclaraguateFiles[1]?.type || undefined,
      financial_declaraguate_3_pdf_base64: extraFilePayload.declaraguateCirculacion3 || undefined,
      financial_declaraguate_3_filename: this.financialDeclaraguateFiles[2]?.name || undefined,
      financial_declaraguate_3_mime: this.financialDeclaraguateFiles[2]?.type || undefined,
      financial_declaraguate_4_pdf_base64: extraFilePayload.declaraguateCirculacion4 || undefined,
      financial_declaraguate_4_filename: this.financialDeclaraguateFiles[3]?.name || undefined,
      financial_declaraguate_4_mime: this.financialDeclaraguateFiles[3]?.type || undefined,
      financial_declaraguate_5_pdf_base64: extraFilePayload.declaraguateCirculacion5 || undefined,
      financial_declaraguate_5_filename: this.financialDeclaraguateFiles[4]?.name || undefined,
      financial_declaraguate_5_mime: this.financialDeclaraguateFiles[4]?.type || undefined,
      acta_pdf_base64: extraFilePayload.facturaInspeccion || undefined,
      acta_filename: this.financialExtraFiles.facturaInspeccion?.name || undefined,
      acta_mime: this.financialExtraFiles.facturaInspeccion?.type || undefined,
      registro_mercantil_pdf_base64: extraFilePayload.facturaAproximacion || undefined,
      registro_mercantil_filename: this.financialExtraFiles.facturaAproximacion?.name || undefined,
      registro_mercantil_mime: this.financialExtraFiles.facturaAproximacion?.type || undefined,
      rpa_acta_nombramiento_pdf_base64: extraFilePayload.cambioDuenoMatricula || undefined,
      rpa_acta_nombramiento_filename: this.financialExtraFiles.cambioDuenoMatricula?.name || undefined,
      rpa_acta_nombramiento_mime: this.financialExtraFiles.cambioDuenoMatricula?.type || undefined,
      rpa_registro_representante_pdf_base64: extraFilePayload.certificadoAeronavegabilidad || undefined,
      rpa_registro_representante_filename: this.financialExtraFiles.certificadoAeronavegabilidad?.name || undefined,
      rpa_registro_representante_mime: this.financialExtraFiles.certificadoAeronavegabilidad?.type || undefined,
      rpa_registro_entidad_pdf_base64: extraFilePayload.solvenciaAnterior || undefined,
      rpa_registro_entidad_filename: this.financialExtraFiles.solvenciaAnterior?.name || undefined,
      rpa_registro_entidad_mime: this.financialExtraFiles.solvenciaAnterior?.type || undefined,
      rpa_documento_estado_pdf_base64: pesoAeronaveBase64 || undefined,
      rpa_documento_estado_filename: this.pesoAeronaveFile?.name || undefined,
      rpa_documento_estado_mime: this.pesoAeronaveFile?.type || undefined
    };
  }

  private declaraguateFilenameList() {
    return this.declaraguateSlots.map((index) =>
      this.financialDeclaraguateFiles[index]?.name || this.existingFinancialDeclaraguateFilenames[index] || ''
    );
  }

  private financialDocValue(value: string | string[] | undefined) {
    if (Array.isArray(value)) return value.filter(Boolean).join(', ');
    return String(value || '');
  }

  private buildDetail(): FinancialDetail {
    const group = this.currentGroup();
    const option = this.currentOption();
    return {
      tipo: 'financiero_solvencia_pago',
      gestion_grupo_codigo: String(this.form.value.gestion_codigo || '').trim(),
      gestion_grupo_label: group?.label || '',
      proceso_codigo: String(this.form.value.proceso_codigo || '').trim(),
      proceso_label: this.currentProcesoLabel(),
      nombre_empresa: String(this.form.value.nombre_empresa || '').trim(),
      nombre_solicitante: String(this.form.value.nombre_solicitante || '').trim(),
      dpi_solicitante: String(this.form.value.dpi_solicitante || '').trim(),
      carta_representacion: this.cartaRepresentacionFile?.name || this.existingCartaRepresentacionFilename || '',
      gestion_codigo: String(this.form.value.proceso_codigo || '').trim(),
      gestion_label: option?.label || '',
      certificado_operativo_subtipo: this.currentCertificadoOperativoSubtipoLabel(),
      monto_referencia: String(this.form.value.monto_referencia || '').trim(),
      area: String(this.form.value.area || '').trim(),
      nomenclatura_area: String(this.form.value.nomenclatura_area || '').trim(),
      anio: String(this.form.value.anio || '').trim(),
      matricula: String(this.form.value.matricula || '').trim(),
      peso_kg: String(this.form.value.peso_kg || '').trim(),
      numero_placa: String(this.form.value.numero_placa || '').trim(),
      tipo_vehiculo: String(this.form.value.tipo_vehiculo || '').trim(),
      color_vehiculo: String(this.form.value.color_vehiculo || '').trim(),
      marca_vehiculo: String(this.form.value.marca_vehiculo || '').trim(),
      fecha_pago_mora: String(this.form.value.fecha_pago_mora || '').trim(),
      documento_peso_aeronave: this.pesoAeronaveFile?.name || this.existingPesoAeronaveFilename || '',
      nombre_taller: String(this.form.value.nombre_taller || '').trim(),
      otros_detalle: String(this.form.value.otros_detalle || '').trim(),
      idioma_ingles: Boolean(this.form.value.idioma_ingles),
      idioma_espanol: Boolean(this.form.value.idioma_espanol),
      documentos_financieros: {
        declaraguateCirculacion: this.declaraguateFilenameList(),
        facturaInspeccion: this.financialExtraFiles.facturaInspeccion?.name || this.existingFinancialExtraFilenames.facturaInspeccion || '',
        facturaAproximacion: this.financialExtraFiles.facturaAproximacion?.name || this.existingFinancialExtraFilenames.facturaAproximacion || '',
        cambioDuenoMatricula: this.financialExtraFiles.cambioDuenoMatricula?.name || this.existingFinancialExtraFilenames.cambioDuenoMatricula || '',
        certificadoAeronavegabilidad: this.financialExtraFiles.certificadoAeronavegabilidad?.name || this.existingFinancialExtraFilenames.certificadoAeronavegabilidad || '',
        solvenciaAnterior: this.financialExtraFiles.solvenciaAnterior?.name || this.existingFinancialExtraFilenames.solvenciaAnterior || ''
      }
    };
  }

  private currentProcesoLabel() {
    const option = this.currentOption();
    if (!option) return '';
    if (option.value !== 'certificado_operativo') return option.label;
    const subtipo = this.certificadoOperativoSubtipo();
    if (subtipo === 'certificaciones') return 'Certificado Operativo - Certificaciones';
    if (subtipo === 'calcomania') return 'Certificado Operativo - Calcoman\u00eda De Circulaci\u00f3n';
    if (subtipo === 'otros') return 'Certificado Operativo - Otros';
    return 'Certificado Operativo';
  }

  private currentCertificadoOperativoSubtipoLabel() {
    const subtipo = this.certificadoOperativoSubtipo();
    if (subtipo === 'certificaciones') return 'Certificaciones';
    if (subtipo === 'calcomania') return 'Calcoman\u00eda De Circulaci\u00f3n';
    if (subtipo === 'otros') return 'Otros';
    return '';
  }

  private buildSummary(detail: FinancialDetail) {
    const parts = [
      detail.gestion_label ? `Gesti\u00f3n: ${detail.gestion_label}` : '',
      detail.monto_referencia ? `Monto: ${detail.monto_referencia}` : '',
      detail.area ? `\u00c1rea: ${detail.area}` : '',
      detail.nomenclatura_area ? `Nomenclatura del \u00c1rea: ${detail.nomenclatura_area}` : '',
      detail.anio ? `A\u00f1o: ${detail.anio}` : '',
      detail.matricula ? `Matrícula: ${detail.matricula}` : '',
      detail.peso_kg ? `Peso máximo de despegue en KGS de la aeronave: ${detail.peso_kg}` : '',
      detail.documento_peso_aeronave ? `Documento de peso de la aeronave: ${detail.documento_peso_aeronave}` : '',
      detail.fecha_pago_mora ? `Fecha de pago para cálculo de mora: ${detail.fecha_pago_mora}` : '',
      detail.numero_placa ? `N\u00famero de Placa: ${detail.numero_placa}` : '',
      detail.tipo_vehiculo ? `Tipo de vehículo: ${detail.tipo_vehiculo}` : '',
      detail.color_vehiculo ? `Color de vehículo: ${detail.color_vehiculo}` : '',
      detail.marca_vehiculo ? `Marca de vehículo: ${detail.marca_vehiculo}` : '',
      detail.nombre_taller ? `Nombre de Taller: ${detail.nombre_taller}` : '',
      detail.otros_detalle
        ? `${[
          'cambio_datos_certificados',
          'certificado_operador_aereo',
          'inspeccion_taller'
        ].includes(detail.proceso_codigo || '') ? 'Observaciones' : 'Otros'}: ${detail.otros_detalle}`
        : '',
      detail.idioma_ingles ? 'Ingl\u00e9s Q50.00' : '',
      detail.idioma_espanol ? 'Espa\u00f1ol Q50.00' : ''
    ].filter(Boolean);
    return parts.join(' | ');
  }

  private resetForm() {
    this.form.reset({
      fecha: this.todayDate,
      nit: '',
      nombre_empresa: '',
      correo: '',
      telefono: '',
      nombre_solicitante: '',
      dpi_solicitante: '',
      gestion_codigo: '',
      proceso_codigo: '',
      certificado_operativo_subtipo: '',
      monto_referencia: '',
      area: '',
      nomenclatura_area: '',
      anio: '',
      matricula: '',
      peso_kg: '',
      numero_placa: '',
      tipo_vehiculo: '',
      color_vehiculo: '',
      marca_vehiculo: '',
      fecha_pago_mora: '',
      nombre_taller: '',
      otros_detalle: '',
      idioma_ingles: false,
      idioma_espanol: false
    }, { emitEvent: false });
    this.cartaRepresentacionFile = null;
    this.cartaRepresentacionError = '';
    this.existingCartaRepresentacionFilename = '';
    this.financialDeclaraguateFiles = [null, null, null, null, null];
    this.financialDeclaraguateFileErrors = ['', '', '', '', ''];
    this.existingFinancialDeclaraguateFilenames = ['', '', '', '', ''];
    this.clearPesoAeronaveFile();
    for (const definition of this.financialExtraFileDefinitions) {
      this.financialExtraFiles[definition.key] = null;
      this.financialExtraFileErrors[definition.key] = '';
      this.existingFinancialExtraFilenames[definition.key] = '';
    }
    this.applyGestionValidators();
  }

  private readFinancialExtraFiles() {
    const declaraguateKeys: FinancialExtraPayloadKey[] = [
      'declaraguateCirculacion',
      'declaraguateCirculacion2',
      'declaraguateCirculacion3',
      'declaraguateCirculacion4',
      'declaraguateCirculacion5'
    ];
    const declaraguateReads = Promise.all(this.declaraguateSlots.map(async (index) => [
      declaraguateKeys[index],
      await this.readAsBase64(this.financialDeclaraguateFiles[index])
    ] as const));
    const extraReads = Promise.all(this.financialExtraFileDefinitions
      .filter((definition) => definition.key !== 'declaraguateCirculacion')
      .map(async (definition) => [
      definition.key,
      await this.readAsBase64(this.financialExtraFiles[definition.key])
    ] as const));
    return Promise.all([declaraguateReads, extraReads]).then(([declaraguatePairs, extraPairs]) =>
      [...declaraguatePairs, ...extraPairs].reduce((acc, [key, value]) => {
      if (value) acc[key] = value;
      return acc;
    }, {} as Partial<Record<FinancialExtraPayloadKey, string>>));
  }

  private readAsBase64(file: File | null): Promise<string | null> {
    if (!file) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = String(reader.result || '');
        const base64 = data.split(',')[1] || '';
        if (!base64) return reject(new Error('base64-empty'));
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('read-error'));
      reader.readAsDataURL(file);
    });
  }

  private syncFechaHoy() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    this.todayDate = `${y}-${m}-${d}`;
    this.form.patchValue({ fecha: this.todayDate }, { emitEvent: false });
  }

  private startReturnedEditById(returnedId: number) {
    this.loadingReturnedEdit = true;
    this.status = null;
    this.http.get<Submission>(`${this.apiBase}/my-submissions/${returnedId}`).subscribe({
      next: (detail) => {
        const data = (detail.detalle_formulario && typeof detail.detalle_formulario === 'object'
          ? detail.detalle_formulario
          : {}) as FinancialDetail;
        this.editingReturnedId = detail.id;
        const storedProcessCode = String(data.proceso_codigo || data.gestion_codigo || '').trim();
        this.form.patchValue({
          fecha: this.todayDate,
          nit: detail.nit || '',
          nombre_empresa: data.nombre_empresa || detail.nombre_propietario || '',
          correo: detail.correo || '',
          telefono: detail.telefono || '',
          nombre_solicitante: data.nombre_solicitante || detail.representante_legal || '',
          dpi_solicitante: data.dpi_solicitante || detail.documento_propietario || '',
          gestion_codigo: String(data.gestion_grupo_codigo || this.resolveGroupForProcess(storedProcessCode)),
          proceso_codigo: storedProcessCode,
          certificado_operativo_subtipo: this.normalizeCertificadoOperativoSubtipo(data.certificado_operativo_subtipo),
          monto_referencia: data.monto_referencia || '',
          area: data.area || '',
          nomenclatura_area: data.nomenclatura_area || '',
          anio: data.anio || '',
          matricula: data.matricula || detail.matricula_tg || '',
          peso_kg: data.peso_kg || '',
          numero_placa: data.numero_placa || '',
          tipo_vehiculo: data.tipo_vehiculo || '',
          color_vehiculo: data.color_vehiculo || '',
          marca_vehiculo: data.marca_vehiculo || '',
          fecha_pago_mora: data.fecha_pago_mora || '',
          nombre_taller: data.nombre_taller || '',
          otros_detalle: data.otros_detalle || '',
          idioma_ingles: Boolean(data.idioma_ingles),
          idioma_espanol: Boolean(data.idioma_espanol)
        }, { emitEvent: false });
        this.applyGestionValidators();
        this.cartaRepresentacionFile = null;
        this.cartaRepresentacionError = '';
        this.existingCartaRepresentacionFilename = data.carta_representacion || detail.carta_representacion_filename || '';
        this.pesoAeronaveFile = null;
        this.pesoAeronaveError = '';
        this.existingPesoAeronaveFilename = data.documento_peso_aeronave || detail.rpa_documento_estado_filename || '';
        const financialDocs = data.documentos_financieros && typeof data.documentos_financieros === 'object'
          ? data.documentos_financieros as Partial<Record<FinancialExtraFileKey, string | string[]>>
          : {};
        const declaraguateDocs = Array.isArray(financialDocs.declaraguateCirculacion)
          ? financialDocs.declaraguateCirculacion
          : [financialDocs.declaraguateCirculacion || ''];
        this.existingFinancialDeclaraguateFilenames = [
          String(declaraguateDocs[0] || detail.dpi_filename || ''),
          String(declaraguateDocs[1] || detail.financial_declaraguate_2_filename || ''),
          String(declaraguateDocs[2] || detail.financial_declaraguate_3_filename || ''),
          String(declaraguateDocs[3] || detail.financial_declaraguate_4_filename || ''),
          String(declaraguateDocs[4] || detail.financial_declaraguate_5_filename || '')
        ];
        this.existingFinancialExtraFilenames = {
          declaraguateCirculacion: this.existingFinancialDeclaraguateFilenames.filter(Boolean).join(', '),
          facturaInspeccion: this.financialDocValue(financialDocs.facturaInspeccion) || detail.acta_filename || '',
          facturaAproximacion: this.financialDocValue(financialDocs.facturaAproximacion) || detail.registro_mercantil_filename || '',
          cambioDuenoMatricula: this.financialDocValue(financialDocs.cambioDuenoMatricula) || detail.rpa_acta_nombramiento_filename || '',
          certificadoAeronavegabilidad: this.financialDocValue(financialDocs.certificadoAeronavegabilidad) || detail.rpa_registro_representante_filename || '',
          solvenciaAnterior: this.financialDocValue(financialDocs.solvenciaAnterior) || detail.rpa_registro_entidad_filename || ''
        };
        this.financialDeclaraguateFiles = [null, null, null, null, null];
        this.financialDeclaraguateFileErrors = ['', '', '', '', ''];
        for (const definition of this.financialExtraFileDefinitions) {
          this.financialExtraFiles[definition.key] = null;
          this.financialExtraFileErrors[definition.key] = '';
        }
        this.loadingReturnedEdit = false;
        this.clearEditReturnedQueryParam();
        this.status = { type: 'success', message: 'Edita los datos requeridos y vuelve a enviar.' };
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: () => {
        this.loadingReturnedEdit = false;
        this.status = { type: 'error', message: 'No se pudo abrir el formulario devuelto.' };
      }
    });
  }

  private resetReturnedEditState() {
    this.editingReturnedId = null;
    this.loadingReturnedEdit = false;
  }

  private clearEditReturnedQueryParam() {
    if (!this.route.snapshot.queryParamMap.has('editReturned')) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { editReturned: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private normalizeCertificadoOperativoSubtipo(value: unknown) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'certificaciones') return 'certificaciones';
    if (raw.includes('calcom')) return 'calcomania';
    if (raw === 'otros') return 'otros';
    return '';
  }

  private resolveGroupForProcess(processCode: string) {
    const normalized = String(processCode || '').trim();
    if (!normalized) return '';
    const solvencias = new Set([
      'renovacion_arrendamiento',
      'gestion_tia',
      'cancelacion_matricula',
      'solvencia_aeronavegabilidad',
      'solvencia_financiera_aeronave'
    ]);
    return solvencias.has(normalized) ? 'solvencias' : 'otros_tramites';
  }
}

