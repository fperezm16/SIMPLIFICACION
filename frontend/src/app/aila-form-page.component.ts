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
    return raw.length === length ? null : { digitsLength: { requiredLength: length, actualLength: raw.length } };
  };
}

type AilaFileKey =
  | 'cartaSolicitud'
  | 'facturaSolvencia'
  | 'personasDocumentos'
  | 'tiaEscoltas'
  | 'contrasenaEscoltas'
  | 'herramientasFotos'
  | 'vehiculosTarjeta';

type AilaDetail = {
  tipo?: 'aila_permiso_trabajo';
  tipo_permiso?: string;
  empresa_arrendatario?: string;
  area_destino?: string;
  motivo_visita?: string;
  fecha_ingreso?: string;
  dias_solicitados?: string;
  telefono_notificaciones?: string;
  hora_ingreso?: string;
  correo_notificaciones?: string;
  personas?: Array<{ nombre: string; documento: string; nacionalidad: string }>;
  escoltas?: Array<{ nombre: string; telefono: string; tia: string; vencimiento_tia: string; contrasena: string }>;
  herramientas?: Array<{ cantidad: string; descripcion: string }>;
  vehiculos?: Array<{ placa: string; tipo: string }>;
  documentos?: Partial<Record<AilaFileKey, string>>;
};

@Component({
    selector: 'app-aila-form-page',
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './aila-form-page.component.html',
    styleUrls: ['./aila-form-page.component.css']
})
export class AilaFormPageComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly apiBase = API_BASE;
  readonly minPeopleRows = 8;
  readonly minEscortRows = 3;
  readonly minItemRows = 5;
  peopleRows = Array.from({ length: this.minPeopleRows }, (_, i) => i + 1);
  escortRows = Array.from({ length: this.minEscortRows }, (_, i) => i + 1);
  itemRows = Array.from({ length: this.minItemRows }, (_, i) => i + 1);
  readonly vehicleRows = Array.from({ length: 3 }, (_, i) => i + 1);
  readonly maxPdfSizeBytes = 10 * 1024 * 1024;

  form = this.fb.group({
    fecha: [''],
    tipo_permiso: ['generico', Validators.required],
    empresa_arrendatario: ['', [Validators.required, Validators.minLength(3)]],
    area_destino: ['', Validators.required],
    motivo_visita: ['', Validators.required],
    fecha_ingreso: ['', Validators.required],
    dias_solicitados: ['', Validators.required],
    telefono_notificaciones: ['', [Validators.required, digitsExact(8)]],
    hora_ingreso: ['', Validators.required],
    correo_notificaciones: ['', [Validators.required, Validators.email]],
    persona1_nombre: ['', Validators.required],
    persona1_documento: ['', Validators.required],
    persona1_nacionalidad: ['', Validators.required],
    persona2_nombre: [''], persona2_documento: [''], persona2_nacionalidad: [''],
    persona3_nombre: [''], persona3_documento: [''], persona3_nacionalidad: [''],
    persona4_nombre: [''], persona4_documento: [''], persona4_nacionalidad: [''],
    persona5_nombre: [''], persona5_documento: [''], persona5_nacionalidad: [''],
    persona6_nombre: [''], persona6_documento: [''], persona6_nacionalidad: [''],
    persona7_nombre: [''], persona7_documento: [''], persona7_nacionalidad: [''],
    persona8_nombre: [''], persona8_documento: [''], persona8_nacionalidad: [''],
    escolta1_nombre: ['', Validators.required],
    escolta1_telefono: ['', [Validators.required, digitsExact(8)]],
    escolta1_tia: ['', Validators.required],
    escolta1_vencimiento_tia: ['', Validators.required],
    escolta1_contrasena: [''],
    escolta2_nombre: [''], escolta2_telefono: [''], escolta2_tia: [''], escolta2_vencimiento_tia: [''], escolta2_contrasena: [''],
    escolta3_nombre: [''], escolta3_telefono: [''], escolta3_tia: [''], escolta3_vencimiento_tia: [''], escolta3_contrasena: [''],
    herramienta1_cantidad: [''], herramienta1_descripcion: [''],
    herramienta2_cantidad: [''], herramienta2_descripcion: [''],
    herramienta3_cantidad: [''], herramienta3_descripcion: [''],
    herramienta4_cantidad: [''], herramienta4_descripcion: [''],
    herramienta5_cantidad: [''], herramienta5_descripcion: [''],
    vehiculo1_placa: [''], vehiculo1_tipo: [''],
    vehiculo2_placa: [''], vehiculo2_tipo: [''],
    vehiculo3_placa: [''], vehiculo3_tipo: ['']
  });

  todayDate = '';
  status: { type: 'success' | 'error'; message: string } | null = null;
  isSubmitting = false;
  editingReturnedId: number | null = null;
  loadingReturnedEdit = false;

  files: Record<AilaFileKey, File | null> = {
    cartaSolicitud: null,
    facturaSolvencia: null,
    personasDocumentos: null,
    tiaEscoltas: null,
    contrasenaEscoltas: null,
    herramientasFotos: null,
    vehiculosTarjeta: null
  };

  existingFiles: Record<AilaFileKey, string> = {
    cartaSolicitud: '',
    facturaSolvencia: '',
    personasDocumentos: '',
    tiaEscoltas: '',
    contrasenaEscoltas: '',
    herramientasFotos: '',
    vehiculosTarjeta: ''
  };

  fileErrors: Record<AilaFileKey, string> = {
    cartaSolicitud: '',
    facturaSolvencia: '',
    personasDocumentos: '',
    tiaEscoltas: '',
    contrasenaEscoltas: '',
    herramientasFotos: '',
    vehiculosTarjeta: ''
  };

  ngOnInit(): void {
    this.syncFechaHoy();
    this.syncDynamicValidators();
    this.form.valueChanges.subscribe(() => this.syncDynamicValidators());
    this.route.queryParamMap.subscribe((params) => {
      const rawId = params.get('editReturned');
      if (!rawId) return;
      const returnedId = Number(rawId);
      if (Number.isInteger(returnedId) && returnedId > 0) this.startReturnedEditById(returnedId);
    });
  }

  getFieldError(field: string): string | null {
    const control = this.form.get(field);
    if (!control || !control.touched || !control.invalid) return null;
    if (control.errors?.['required']) return 'Campo obligatorio';
    if (control.errors?.['email']) return 'Correo no válido';
    if (control.errors?.['digitsOnly']) return 'Solo se permiten dígitos';
    if (control.errors?.['digitsLength']) return `Debe tener ${control.errors['digitsLength'].requiredLength} dígitos`;
    if (control.errors?.['minlength']) return `Mínimo ${control.errors['minlength'].requiredLength} caracteres`;
    return 'Valor no válido';
  }

  onDigitsInput(event: Event, field: string, maxLength: number) {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    const normalized = String(input.value || '').replace(/\D+/g, '').slice(0, maxLength);
    if (input.value !== normalized) input.value = normalized;
    this.form.get(field)?.setValue(normalized, { emitEvent: false });
  }

  onPdfSelected(event: Event, key: AilaFileKey) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] || null;
    this.files[key] = null;
    this.fileErrors[key] = '';
    if (!file) return;
    if (file.type !== 'application/pdf') {
      this.fileErrors[key] = 'El archivo debe ser PDF.';
      if (input) input.value = '';
      return;
    }
    if (file.size > this.maxPdfSizeBytes) {
      this.fileErrors[key] = 'El PDF no puede superar 10 MB.';
      if (input) input.value = '';
      return;
    }
    this.files[key] = file;
  }

  fileLabel(key: AilaFileKey, fallback: string) {
    return this.files[key]?.name || this.existingFiles[key] || fallback;
  }

  addPersonRow() {
    const nextIndex = (this.peopleRows[this.peopleRows.length - 1] || 0) + 1;
    this.ensurePersonControls(nextIndex);
    this.peopleRows = [...this.peopleRows, nextIndex];
    this.syncDynamicValidators();
  }

  removeLastPersonRow() {
    if (this.peopleRows.length <= this.minPeopleRows) return;
    const removedIndex = this.peopleRows[this.peopleRows.length - 1];
    for (const field of ['nombre', 'documento', 'nacionalidad']) {
      (this.form as any).removeControl(`persona${removedIndex}_${field}`);
    }
    this.peopleRows = this.peopleRows.slice(0, -1);
    this.syncDynamicValidators();
  }

  addItemRow() {
    const nextIndex = (this.itemRows[this.itemRows.length - 1] || 0) + 1;
    this.ensureItemControls(nextIndex);
    this.itemRows = [...this.itemRows, nextIndex];
  }

  removeLastItemRow() {
    if (this.itemRows.length <= this.minItemRows) return;
    const removedIndex = this.itemRows[this.itemRows.length - 1];
    for (const field of ['cantidad', 'descripcion']) {
      (this.form as any).removeControl(`herramienta${removedIndex}_${field}`);
    }
    this.itemRows = this.itemRows.slice(0, -1);
  }

  filledPeopleCount() {
    return this.peopleRows.filter((idx) => this.personRowHasValue(idx)).length;
  }

  requiredEscortCount() {
    const peopleCount = Math.max(1, this.filledPeopleCount());
    return Math.max(1, Math.ceil(peopleCount / 8));
  }

  isEscortRequired(idx: number) {
    return idx <= this.requiredEscortCount();
  }

  hasPeopleRowErrors() {
    return this.peopleRows.some((idx) =>
      ['nombre', 'documento', 'nacionalidad'].some((field) => this.form.get(`persona${idx}_${field}`)?.invalid && this.form.get(`persona${idx}_${field}`)?.touched)
    );
  }

  hasEscortRowErrors() {
    return this.escortRows.some((idx) =>
      ['nombre', 'telefono', 'tia', 'vencimiento_tia'].some((field) => this.form.get(`escolta${idx}_${field}`)?.invalid && this.form.get(`escolta${idx}_${field}`)?.touched)
    );
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

  onSubmit() {
    this.status = null;
    this.syncFechaHoy();
    this.syncDynamicValidators();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const missingFileError = this.validateRequiredFiles();
    if (missingFileError) {
      this.status = { type: 'error', message: missingFileError };
      return;
    }

    this.isSubmitting = true;
    this.readPayloadFiles().then((filePayload) => {
      const payload = this.buildPayload(filePayload);
      const request$ = this.editingReturnedId
        ? this.http.put<Submission>(`${this.apiBase}/my-submissions/${this.editingReturnedId}/resubmit`, payload)
        : this.http.post<Submission>(`${this.apiBase}/submissions`, payload);

      request$.subscribe({
        next: (saved) => {
          const registro = saved?.registro_codigo ? ` Correlativo: ${saved.registro_codigo}.` : '';
          this.status = {
            type: 'success',
            message: this.editingReturnedId ? `Formulario corregido y reenviado.${registro}` : `Formulario AILA enviado correctamente.${registro}`
          };
          this.resetForm();
          this.resetReturnedEditState();
          this.clearEditReturnedQueryParam();
          this.isSubmitting = false;
        },
        error: (err) => {
          this.status = { type: 'error', message: err?.error?.error || 'No se pudo guardar el formulario AILA.' };
          this.isSubmitting = false;
        }
      });
    }).catch(() => {
      this.status = { type: 'error', message: 'No se pudo leer uno de los archivos PDF.' };
      this.isSubmitting = false;
    });
  }

  private validateRequiredFiles() {
    const required: Array<[AilaFileKey, string]> = [
      ['cartaSolicitud', 'La carta de solicitud en PDF es obligatoria.'],
      ['facturaSolvencia', 'La factura reciente de arrendamiento/solvencia en PDF es obligatoria.'],
      ['personasDocumentos', 'El PDF de DPI/fe de edad/pasaporte de las personas es obligatorio.'],
      ['tiaEscoltas', 'El PDF de Tarjeta de Identificación Aeroportuaria del escolta es obligatorio.']
    ];
    if (this.hasToolRows()) required.push(['herramientasFotos', 'Debes adjuntar fotografías de herramienta, mercadería y/o mobiliario.']);
    if (this.hasVehicleRows()) required.push(['vehiculosTarjeta', 'Debes adjuntar la tarjeta de circulación de cada vehículo.']);

    for (const [key, message] of required) {
      if (!this.files[key] && !this.existingFiles[key]) {
        this.fileErrors[key] = message;
        return message;
      }
    }
    return null;
  }

  private hasToolRows() {
    return this.itemRows.some((idx) =>
      String(this.form.get(`herramienta${idx}_cantidad`)?.value || '').trim() ||
      String(this.form.get(`herramienta${idx}_descripcion`)?.value || '').trim()
    );
  }

  private hasVehicleRows() {
    return this.vehicleRows.some((idx) =>
      String(this.form.get(`vehiculo${idx}_placa`)?.value || '').trim() ||
      String(this.form.get(`vehiculo${idx}_tipo`)?.value || '').trim()
    );
  }

  private buildPayload(filePayload: Partial<Record<AilaFileKey, string>>) {
    const detail = this.buildDetail();
    return {
      fecha: this.todayDate,
      persona_tipo: 'individual',
      unidad_clave: 'AILA',
      gestion_nombre: 'Solicitud AILA para trabajos de infraestructura e ingreso/egreso',
      nombre_propietario: detail.empresa_arrendatario,
      representante_legal: detail.empresa_arrendatario,
      direccion: detail.area_destino,
      telefono: detail.telefono_notificaciones,
      correo: detail.correo_notificaciones,
      uso: detail.tipo_permiso,
      especificaciones: this.buildSummary(detail),
      detalle_formulario: detail,
      carta_representacion_pdf_base64: filePayload.cartaSolicitud || undefined,
      carta_representacion_filename: this.files.cartaSolicitud?.name || undefined,
      carta_representacion_mime: this.files.cartaSolicitud?.type || undefined,
      registro_mercantil_pdf_base64: filePayload.facturaSolvencia || undefined,
      registro_mercantil_filename: this.files.facturaSolvencia?.name || undefined,
      registro_mercantil_mime: this.files.facturaSolvencia?.type || undefined,
      dpi_pdf_base64: filePayload.personasDocumentos || undefined,
      dpi_filename: this.files.personasDocumentos?.name || undefined,
      dpi_mime: this.files.personasDocumentos?.type || undefined,
      acta_pdf_base64: filePayload.tiaEscoltas || undefined,
      acta_filename: this.files.tiaEscoltas?.name || undefined,
      acta_mime: this.files.tiaEscoltas?.type || undefined,
      rpa_documento_estado_pdf_base64: filePayload.contrasenaEscoltas || undefined,
      rpa_documento_estado_filename: this.files.contrasenaEscoltas?.name || undefined,
      rpa_documento_estado_mime: this.files.contrasenaEscoltas?.type || undefined,
      rpa_registro_entidad_pdf_base64: filePayload.herramientasFotos || undefined,
      rpa_registro_entidad_filename: this.files.herramientasFotos?.name || undefined,
      rpa_registro_entidad_mime: this.files.herramientasFotos?.type || undefined,
      rpa_registro_representante_pdf_base64: filePayload.vehiculosTarjeta || undefined,
      rpa_registro_representante_filename: this.files.vehiculosTarjeta?.name || undefined,
      rpa_registro_representante_mime: this.files.vehiculosTarjeta?.type || undefined
    };
  }

  private buildDetail(): AilaDetail {
    return {
      tipo: 'aila_permiso_trabajo',
      tipo_permiso: String(this.form.value.tipo_permiso || '').trim(),
      empresa_arrendatario: String(this.form.value.empresa_arrendatario || '').trim(),
      area_destino: String(this.form.value.area_destino || '').trim(),
      motivo_visita: String(this.form.value.motivo_visita || '').trim(),
      fecha_ingreso: String(this.form.value.fecha_ingreso || '').trim(),
      dias_solicitados: String(this.form.value.dias_solicitados || '').trim(),
      telefono_notificaciones: String(this.form.value.telefono_notificaciones || '').trim(),
      hora_ingreso: String(this.form.value.hora_ingreso || '').trim(),
      correo_notificaciones: String(this.form.value.correo_notificaciones || '').trim(),
      personas: this.peopleRows.map((idx) => ({
        nombre: String(this.form.get(`persona${idx}_nombre`)?.value || '').trim(),
        documento: String(this.form.get(`persona${idx}_documento`)?.value || '').trim(),
        nacionalidad: String(this.form.get(`persona${idx}_nacionalidad`)?.value || '').trim()
      })).filter((row) => row.nombre || row.documento || row.nacionalidad),
      escoltas: this.escortRows.map((idx) => ({
        nombre: String(this.form.get(`escolta${idx}_nombre`)?.value || '').trim(),
        telefono: String(this.form.get(`escolta${idx}_telefono`)?.value || '').trim(),
        tia: String(this.form.get(`escolta${idx}_tia`)?.value || '').trim(),
        vencimiento_tia: String(this.form.get(`escolta${idx}_vencimiento_tia`)?.value || '').trim(),
        contrasena: String(this.form.get(`escolta${idx}_contrasena`)?.value || '').trim()
      })).filter((row) => row.nombre || row.telefono || row.tia || row.vencimiento_tia || row.contrasena),
      herramientas: this.itemRows.map((idx) => ({
        cantidad: String(this.form.get(`herramienta${idx}_cantidad`)?.value || '').trim(),
        descripcion: String(this.form.get(`herramienta${idx}_descripcion`)?.value || '').trim()
      })).filter((row) => row.cantidad || row.descripcion),
      vehiculos: this.vehicleRows.map((idx) => ({
        placa: String(this.form.get(`vehiculo${idx}_placa`)?.value || '').trim(),
        tipo: String(this.form.get(`vehiculo${idx}_tipo`)?.value || '').trim()
      })).filter((row) => row.placa || row.tipo),
      documentos: {
        cartaSolicitud: this.files.cartaSolicitud?.name || this.existingFiles.cartaSolicitud || '',
        facturaSolvencia: this.files.facturaSolvencia?.name || this.existingFiles.facturaSolvencia || '',
        personasDocumentos: this.files.personasDocumentos?.name || this.existingFiles.personasDocumentos || '',
        tiaEscoltas: this.files.tiaEscoltas?.name || this.existingFiles.tiaEscoltas || '',
        contrasenaEscoltas: this.files.contrasenaEscoltas?.name || this.existingFiles.contrasenaEscoltas || '',
        herramientasFotos: this.files.herramientasFotos?.name || this.existingFiles.herramientasFotos || '',
        vehiculosTarjeta: this.files.vehiculosTarjeta?.name || this.existingFiles.vehiculosTarjeta || ''
      }
    };
  }

  private buildSummary(detail: AilaDetail) {
    return [
      `Permiso: ${detail.tipo_permiso}`,
      `Área destino: ${detail.area_destino}`,
      `Motivo: ${detail.motivo_visita}`,
      `Ingreso: ${detail.fecha_ingreso}`,
      `Días: ${detail.dias_solicitados}`,
      `Personas: ${detail.personas?.length || 0}`,
      `Escoltas: ${detail.escoltas?.length || 0}`,
      detail.herramientas?.length ? `Herramientas/mercadería/mobiliario: ${detail.herramientas.length}` : '',
      detail.vehiculos?.length ? `Vehículos: ${detail.vehiculos.length}` : ''
    ].filter(Boolean).join(' | ');
  }

  private readPayloadFiles() {
    const entries = Object.keys(this.files) as AilaFileKey[];
    return Promise.all(entries.map(async (key) => [key, await this.readAsBase64(this.files[key])] as const))
      .then((pairs) => pairs.reduce((acc, [key, value]) => {
        if (value) acc[key] = value;
        return acc;
      }, {} as Partial<Record<AilaFileKey, string>>));
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
      next: (submission) => {
        const detail = (submission.detalle_formulario && typeof submission.detalle_formulario === 'object'
          ? submission.detalle_formulario
          : {}) as AilaDetail;
        this.editingReturnedId = submission.id;
        this.form.patchValue({
          fecha: this.todayDate,
          tipo_permiso: detail.tipo_permiso || submission.uso || 'generico',
          empresa_arrendatario: detail.empresa_arrendatario || submission.nombre_propietario || '',
          area_destino: detail.area_destino || submission.direccion || '',
          motivo_visita: detail.motivo_visita || '',
          fecha_ingreso: detail.fecha_ingreso || '',
          dias_solicitados: detail.dias_solicitados || '',
          telefono_notificaciones: detail.telefono_notificaciones || submission.telefono || '',
          hora_ingreso: detail.hora_ingreso || '',
          correo_notificaciones: detail.correo_notificaciones || submission.correo || ''
        }, { emitEvent: false });
        this.patchRows('persona', detail.personas || [], ['nombre', 'documento', 'nacionalidad']);
        this.patchRows('escolta', detail.escoltas || [], ['nombre', 'telefono', 'tia', 'vencimiento_tia', 'contrasena']);
        this.patchRows('herramienta', detail.herramientas || [], ['cantidad', 'descripcion']);
        this.patchRows('vehiculo', detail.vehiculos || [], ['placa', 'tipo']);
        const docs = detail.documentos || {};
        this.existingFiles = {
          cartaSolicitud: docs.cartaSolicitud || submission.carta_representacion_filename || '',
          facturaSolvencia: docs.facturaSolvencia || submission.registro_mercantil_filename || '',
          personasDocumentos: docs.personasDocumentos || submission.dpi_filename || '',
          tiaEscoltas: docs.tiaEscoltas || submission.acta_filename || '',
          contrasenaEscoltas: docs.contrasenaEscoltas || submission.rpa_documento_estado_filename || '',
          herramientasFotos: docs.herramientasFotos || submission.rpa_registro_entidad_filename || '',
          vehiculosTarjeta: docs.vehiculosTarjeta || submission.rpa_registro_representante_filename || ''
        };
        this.loadingReturnedEdit = false;
        this.syncDynamicValidators();
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

  private patchRows(prefix: string, rows: Array<Record<string, string>>, fields: string[]) {
    const maxRows = prefix === 'persona'
      ? Math.max(this.minPeopleRows, rows.length)
      : prefix === 'escolta'
        ? Math.max(this.minEscortRows, rows.length)
        : prefix === 'herramienta'
          ? Math.max(this.minItemRows, rows.length)
          : 3;
    if (prefix === 'persona') this.ensurePeopleRows(maxRows);
    if (prefix === 'escolta') this.ensureEscortRows(maxRows);
    if (prefix === 'herramienta') this.ensureItemRows(maxRows);
    for (let i = 1; i <= maxRows; i++) {
      const row = rows[i - 1] || {};
      for (const field of fields) {
        const control = this.form.get(`${prefix}${i}_${field}`) as AbstractControl<string | null> | null;
        control?.setValue(row[field] || '', { emitEvent: false });
      }
    }
  }

  private resetForm() {
    this.form.reset({ fecha: this.todayDate, tipo_permiso: 'generico' }, { emitEvent: false });
    this.resetDynamicRows();
    this.syncFechaHoy();
    this.syncDynamicValidators();
    for (const key of Object.keys(this.files) as AilaFileKey[]) {
      this.files[key] = null;
      this.fileErrors[key] = '';
      this.existingFiles[key] = '';
    }
  }

  private resetReturnedEditState() {
    this.editingReturnedId = null;
    this.loadingReturnedEdit = false;
  }

  private clearEditReturnedQueryParam() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { editReturned: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private resetDynamicRows() {
    for (const idx of this.peopleRows) {
      if (idx <= this.minPeopleRows) continue;
      for (const field of ['nombre', 'documento', 'nacionalidad']) {
        (this.form as any).removeControl(`persona${idx}_${field}`);
      }
    }
    for (const idx of this.escortRows) {
      if (idx <= this.minEscortRows) continue;
      for (const field of ['nombre', 'telefono', 'tia', 'vencimiento_tia', 'contrasena']) {
        (this.form as any).removeControl(`escolta${idx}_${field}`);
      }
    }
    for (const idx of this.itemRows) {
      if (idx <= this.minItemRows) continue;
      for (const field of ['cantidad', 'descripcion']) {
        (this.form as any).removeControl(`herramienta${idx}_${field}`);
      }
    }
    this.peopleRows = Array.from({ length: this.minPeopleRows }, (_, i) => i + 1);
    this.escortRows = Array.from({ length: this.minEscortRows }, (_, i) => i + 1);
    this.itemRows = Array.from({ length: this.minItemRows }, (_, i) => i + 1);
  }

  private syncDynamicValidators() {
    for (const idx of this.peopleRows) {
      this.ensurePersonControls(idx);
      const required = idx === 1 || this.personRowHasValue(idx);
      for (const field of ['nombre', 'documento', 'nacionalidad']) {
        const control = this.form.get(`persona${idx}_${field}`);
        control?.setValidators(required ? [Validators.required] : []);
        control?.updateValueAndValidity({ emitEvent: false });
      }
    }

    const requiredEscorts = this.requiredEscortCount();
    this.ensureEscortRows(Math.max(this.minEscortRows, requiredEscorts));
    for (const idx of this.escortRows) {
      this.ensureEscortControls(idx);
      const required = idx <= requiredEscorts || this.escortRowHasValue(idx);
      for (const field of ['nombre', 'tia', 'vencimiento_tia']) {
        const control = this.form.get(`escolta${idx}_${field}`);
        control?.setValidators(required ? [Validators.required] : []);
        control?.updateValueAndValidity({ emitEvent: false });
      }
      const phoneControl = this.form.get(`escolta${idx}_telefono`);
      phoneControl?.setValidators(required ? [Validators.required, digitsExact(8)] : [digitsExact(8)]);
      phoneControl?.updateValueAndValidity({ emitEvent: false });
    }
  }

  private personRowHasValue(idx: number) {
    return ['nombre', 'documento', 'nacionalidad'].some((field) =>
      String(this.form.get(`persona${idx}_${field}`)?.value || '').trim()
    );
  }

  private escortRowHasValue(idx: number) {
    return ['nombre', 'telefono', 'tia', 'vencimiento_tia', 'contrasena'].some((field) =>
      String(this.form.get(`escolta${idx}_${field}`)?.value || '').trim()
    );
  }

  private ensurePeopleRows(count: number) {
    const target = Math.max(this.minPeopleRows, count);
    for (let idx = 1; idx <= target; idx++) this.ensurePersonControls(idx);
    this.peopleRows = Array.from({ length: target }, (_, i) => i + 1);
  }

  private ensureEscortRows(count: number) {
    const target = Math.max(this.minEscortRows, count);
    for (let idx = 1; idx <= target; idx++) this.ensureEscortControls(idx);
    this.escortRows = Array.from({ length: target }, (_, i) => i + 1);
  }

  private ensureItemRows(count: number) {
    const target = Math.max(this.minItemRows, count);
    for (let idx = 1; idx <= target; idx++) this.ensureItemControls(idx);
    this.itemRows = Array.from({ length: target }, (_, i) => i + 1);
  }

  private ensurePersonControls(idx: number) {
    for (const field of ['nombre', 'documento', 'nacionalidad']) {
      const name = `persona${idx}_${field}`;
      if (!this.form.get(name)) {
        (this.form as any).addControl(name, this.fb.control(''));
      }
    }
  }

  private ensureEscortControls(idx: number) {
    for (const field of ['nombre', 'telefono', 'tia', 'vencimiento_tia', 'contrasena']) {
      const name = `escolta${idx}_${field}`;
      if (!this.form.get(name)) {
        (this.form as any).addControl(name, this.fb.control(''));
      }
    }
  }

  private ensureItemControls(idx: number) {
    for (const field of ['cantidad', 'descripcion']) {
      const name = `herramienta${idx}_${field}`;
      if (!this.form.get(name)) {
        (this.form as any).addControl(name, this.fb.control(''));
      }
    }
  }
}
