import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { API_BASE } from './api.config';
import { AuthService } from './auth.service';
import { Submission } from './submission.model';

function digitsExactOrEmpty(length: number): ValidatorFn {
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

@Component({
    selector: 'app-form-page',
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './form-page.component.html',
    styleUrls: ['./form-page.component.css']
})
export class FormPageComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private readonly maxPdfSizeBytes = 10 * 1024 * 1024;

  readonly apiBase = API_BASE;
  readonly usoOptionsGeneral = [
    { value: 'privado', label: 'Privado' },
    { value: 'comercial', label: 'Comercial' },
    { value: 'fumigacion', label: 'Fumigación' }
  ];
  readonly usoOptionsDrone = [
    { value: 'privado', label: 'Privado' },
    { value: 'comercial', label: 'Comercial' },
    { value: 'estado', label: 'Entidades de Estado' },
    { value: 'otros', label: 'Otros' }
  ];

  form = this.fb.group({
    fecha: [''],
    persona_tipo: ['individual', Validators.required],
    origen_compra: [''],
    nombre_propietario: ['', [Validators.required, Validators.minLength(3)]],
    representante_legal: [''],
    documento_propietario: ['', [digitsExactOrEmpty(13)]],
    direccion: ['', [Validators.required, Validators.minLength(5)]],
    telefono: ['', [Validators.required, digitsExactOrEmpty(8)]],
    correo: ['', [Validators.required, Validators.email]],
    nit: [''],
    nombre_orden_pago: [''],
    autorizado_nombre: [''],
    autorizado_documento: ['', [digitsExactOrEmpty(13)]],
    autorizado_telefono: ['', [digitsExactOrEmpty(8)]],
    ubicacion_inspeccion: [''],
    matricula_tg: [''],
    matricula_tg_nueva: [''],
    uso: ['privado', Validators.required],
    fabricante: [''],
    numero_serie: [''],
    modelo: [''],
    anio_fabricacion: [''],
    colores: [''],
    tipo_internacion: [false],
    tipo_reservacion: [false],
    tipo_inscripcion: [false],
    tipo_certificado_prov: [false],
    tipo_reposicion: [false],
    tipo_cambio_prop: [false],
    tipo_cambio_datos: [false],
    tipo_certificacion: [false],
    especificaciones: ['']
  });

  isSubmitting = false;
  status: { type: 'success' | 'error'; message: string } | null = null;
  dpiFile: File | null = null;
  dpiError = '';
  actaFile: File | null = null;
  actaError = '';
  registroMercantilFile: File | null = null;
  registroMercantilError = '';
  rpaActaNombramientoFile: File | null = null;
  rpaActaNombramientoError = '';
  rpaRegistroRepresentanteFile: File | null = null;
  rpaRegistroRepresentanteError = '';
  rpaRegistroEntidadFile: File | null = null;
  rpaRegistroEntidadError = '';
  rpaDocumentoEstadoFile: File | null = null;
  rpaDocumentoEstadoError = '';
  trackingLoading = false;
  mySubmissions: Submission[] = [];
  role = this.auth.currentUser?.role || 'user';
  showTracking = this.role === 'user';
  todayDate = '';
  editingReturnedId: number | null = null;
  loadingReturnedEdit = false;
  existingDpiName = '';
  existingActaName = '';
  existingRegistroMercantilName = '';
  existingRpaActaNombramientoName = '';
  existingRpaRegistroRepresentanteName = '';
  existingRpaRegistroEntidadName = '';
  existingRpaDocumentoEstadoName = '';
  existingHasDpi = false;
  existingHasActa = false;
  existingHasRegistroMercantil = false;
  existingHasRpaActaNombramiento = false;
  existingHasRpaRegistroRepresentante = false;
  existingHasRpaRegistroEntidad = false;
  existingHasRpaDocumentoEstado = false;
  formMode: 'general' | 'ran2' | 'ran8' | 'ranUav' = 'general';
  isRanMode = false;
  isRanForm2 = false;
  isRanForm8 = false;
  isRanUav = false;

  ngOnInit(): void {
    this.syncFechaHoy();
    this.applyPersonaValidators();
    this.form.get('persona_tipo')?.valueChanges.subscribe(() => {
      this.applyPersonaValidators();
    });
    this.configureFormMode(this.route.snapshot.data || {});
    this.route.data.subscribe((data) => {
      this.configureFormMode(data || {});
    });
    this.route.queryParamMap.subscribe((params) => {
      const rawId = params.get('editReturned');
      if (!rawId) return;
      const returnedId = Number(rawId);
      if (!Number.isInteger(returnedId) || returnedId <= 0) return;
      this.startReturnedEditById(returnedId);
    });
    if (this.showTracking) {
      this.fetchMySubmissions();
    }
  }

  getFieldError(field: string): string | null {
    const control = this.form.get(field);
    if (!control || !control.touched || !control.invalid) {
      return null;
    }
    if (control.errors?.['required']) return 'Campo obligatorio';
    if (control.errors?.['email']) return 'Correo no válido';
    if (control.errors?.['digitsOnly']) return 'Solo se permiten dígitos';
    if (control.errors?.['digitsLength']) {
      return `Debe tener ${control.errors['digitsLength'].requiredLength} dígitos`;
    }
    if (control.errors?.['minlength']) return `Mínimo ${control.errors['minlength'].requiredLength} caracteres`;
    return 'Valor no válido';
  }

  isFieldRequired(field: string): boolean {
    const control = this.form.get(field);
    return Boolean(control?.hasValidator(Validators.required));
  }

  onDigitsInput(event: Event, field: string, maxLength: number) {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    const normalized = String(input.value || '').replace(/\D+/g, '').slice(0, maxLength);
    if (input.value !== normalized) {
      input.value = normalized;
    }
    const control = this.form.get(field);
    if (control) {
      control.setValue(normalized, { emitEvent: false });
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    const normalized = this.normalizePdfFile(file || null, 'El archivo debe ser PDF.');
    this.dpiFile = normalized.file;
    this.dpiError = normalized.error;
  }

  onActaSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    const normalized = this.normalizePdfFile(
      file || null,
      this.isRanUav ? 'El dictamen técnico debe ser PDF.' : 'El acta notarial debe ser PDF.'
    );
    this.actaFile = normalized.file;
    this.actaError = normalized.error;
  }

  onRegistroMercantilSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    const normalized = this.normalizePdfFile(
      file || null,
      this.isRanUav
        ? 'La copia auténtica de factura o acta notarial debe ser PDF.'
        : 'El registro mercantil debe ser PDF.'
    );
    this.registroMercantilFile = normalized.file;
    this.registroMercantilError = normalized.error;
  }

  onRpaActaNombramientoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    const normalized = this.normalizePdfFile(file || null, 'El acta notarial debe estar en PDF.');
    this.rpaActaNombramientoFile = normalized.file;
    this.rpaActaNombramientoError = normalized.error;
  }

  onRpaRegistroRepresentanteSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    const normalized = this.normalizePdfFile(file || null, 'La certificación del representante legal debe estar en PDF.');
    this.rpaRegistroRepresentanteFile = normalized.file;
    this.rpaRegistroRepresentanteError = normalized.error;
  }

  onRpaRegistroEntidadSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    const normalized = this.normalizePdfFile(file || null, 'La certificación de la entidad debe estar en PDF.');
    this.rpaRegistroEntidadFile = normalized.file;
    this.rpaRegistroEntidadError = normalized.error;
  }

  onRpaDocumentoEstadoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    const normalized = this.normalizePdfFile(file || null, 'El documento de entidad del Estado/ONG debe estar en PDF.');
    this.rpaDocumentoEstadoFile = normalized.file;
    this.rpaDocumentoEstadoError = normalized.error;
  }

  isJuridica() {
    return (this.form.value.persona_tipo || 'individual') === 'juridica';
  }

  setPersonaTipo(tipo: 'individual' | 'juridica') {
    this.form.patchValue({ persona_tipo: tipo }, { emitEvent: false });
    this.applyPersonaValidators();
    this.actaError = '';
    this.registroMercantilError = '';
    if (!this.requiresRpaJuridicaGuatemalaDocs()) {
      this.clearRpaJuridicaGuatemalaDocs();
    }
    if (tipo === 'individual' && !this.isRanUav) {
      this.actaFile = null;
      this.registroMercantilFile = null;
    }
  }

  setOrigenCompra(origen: 'guatemala' | 'extranjero') {
    this.form.patchValue({ origen_compra: origen }, { emitEvent: false });
    if (!this.requiresRpaJuridicaGuatemalaDocs()) {
      this.clearRpaJuridicaGuatemalaDocs();
    }
  }

  hasOrigenCompraSeleccionado() {
    return Boolean(String(this.form.value.origen_compra || '').trim());
  }

  onSubmit(): void {
    this.status = null;
    this.dpiError = '';
    this.actaError = '';
    this.registroMercantilError = '';
    this.rpaActaNombramientoError = '';
    this.rpaRegistroRepresentanteError = '';
    this.rpaRegistroEntidadError = '';
    this.rpaDocumentoEstadoError = '';
    this.syncFechaHoy();
    const isResubmit = this.isEditingReturned();
    const requiresExtraDocs = this.requiresExtraUploadDocs();
    const requiresRpaJuridicaGuatemalaDocs = this.requiresRpaJuridicaGuatemalaDocs();
    const hasDpiReady = Boolean(this.dpiFile) || (isResubmit && this.existingHasDpi);
    const hasActaReady = Boolean(this.actaFile) || (isResubmit && this.existingHasActa);
    const hasRegistroMercantilReady = Boolean(this.registroMercantilFile) || (isResubmit && this.existingHasRegistroMercantil);
    const hasRpaActaNombramientoReady = Boolean(this.rpaActaNombramientoFile) || (isResubmit && this.existingHasRpaActaNombramiento);
    const hasRpaRegistroRepresentanteReady = Boolean(this.rpaRegistroRepresentanteFile) || (isResubmit && this.existingHasRpaRegistroRepresentante);
    const hasRpaRegistroEntidadReady = Boolean(this.rpaRegistroEntidadFile) || (isResubmit && this.existingHasRpaRegistroEntidad);

    if (!hasDpiReady) {
      this.dpiError = 'Adjunta el DPI en PDF antes de guardar.';
      this.form.markAllAsTouched();
      return;
    }
    if (this.dpiFile && this.dpiFile.type !== 'application/pdf') {
      this.dpiError = 'El archivo debe ser PDF.';
      return;
    }
    if (requiresExtraDocs && !hasActaReady) {
      this.actaError = this.isRanUav
        ? 'Adjunta el Dictamen Técnico en PDF.'
        : 'Adjunta el acta notarial en PDF para persona jurídica.';
      this.form.markAllAsTouched();
      return;
    }
    if (this.actaFile && this.actaFile.type !== 'application/pdf') {
      this.actaError = 'El acta notarial debe ser PDF.';
      return;
    }
    if (requiresExtraDocs && !hasRegistroMercantilReady) {
      this.registroMercantilError = this.isRanUav
        ? 'Adjunta la Copia auténtica de Factura o Acta Notarial de Declaración Jurada en PDF.'
        : 'Adjunta el registro mercantil en PDF para persona jurídica.';
      this.form.markAllAsTouched();
      return;
    }
    if (this.registroMercantilFile && this.registroMercantilFile.type !== 'application/pdf') {
      this.registroMercantilError = 'El registro mercantil debe ser PDF.';
      return;
    }
    if (requiresRpaJuridicaGuatemalaDocs && !hasRpaActaNombramientoReady) {
      this.rpaActaNombramientoError = 'Adjunta la copia simple del Acta Notarial de Nombramiento en PDF.';
      this.form.markAllAsTouched();
      return;
    }
    if (this.rpaActaNombramientoFile && this.rpaActaNombramientoFile.type !== 'application/pdf') {
      this.rpaActaNombramientoError = 'El acta notarial debe estar en PDF.';
      return;
    }
    if (requiresRpaJuridicaGuatemalaDocs && !hasRpaRegistroRepresentanteReady) {
      this.rpaRegistroRepresentanteError = 'Adjunta la certificación del representante legal en PDF.';
      this.form.markAllAsTouched();
      return;
    }
    if (this.rpaRegistroRepresentanteFile && this.rpaRegistroRepresentanteFile.type !== 'application/pdf') {
      this.rpaRegistroRepresentanteError = 'La certificación del representante legal debe estar en PDF.';
      return;
    }
    if (requiresRpaJuridicaGuatemalaDocs && !hasRpaRegistroEntidadReady) {
      this.rpaRegistroEntidadError = 'Adjunta la certificación de inscripción de la entidad en PDF.';
      this.form.markAllAsTouched();
      return;
    }
    if (this.rpaRegistroEntidadFile && this.rpaRegistroEntidadFile.type !== 'application/pdf') {
      this.rpaRegistroEntidadError = 'La certificación de la entidad debe estar en PDF.';
      return;
    }
    if (this.rpaDocumentoEstadoFile && this.rpaDocumentoEstadoFile.type !== 'application/pdf') {
      this.rpaDocumentoEstadoError = 'El documento de entidad del Estado/ONG debe estar en PDF.';
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSubmitting = true;

    Promise.all([
      this.readAsBase64(this.dpiFile),
      this.readAsBase64(this.actaFile),
      this.readAsBase64(this.registroMercantilFile),
      this.readAsBase64(this.rpaActaNombramientoFile),
      this.readAsBase64(this.rpaRegistroRepresentanteFile),
      this.readAsBase64(this.rpaRegistroEntidadFile),
      this.readAsBase64(this.rpaDocumentoEstadoFile)
    ]).then(([
      dpiBase64,
      actaBase64,
      registroMercantilBase64,
      rpaActaNombramientoBase64,
      rpaRegistroRepresentanteBase64,
      rpaRegistroEntidadBase64,
      rpaDocumentoEstadoBase64
    ]) => {
      if (!dpiBase64 && !isResubmit) {
        throw new Error('No se pudo leer el DPI.');
      }
      const formPayload = this.buildFormPayload();
      const payload: Record<string, unknown> = {
        ...formPayload,
        fecha: this.todayDate,
        unidad_clave: this.currentUnidadClave(),
        gestion_nombre: this.currentGestionNombre(),
      };

      if (dpiBase64 && this.dpiFile) {
        payload['dpi_pdf_base64'] = dpiBase64;
        payload['dpi_filename'] = this.dpiFile.name;
        payload['dpi_mime'] = this.dpiFile.type;
      }
      if (requiresExtraDocs && actaBase64 && this.actaFile) {
        payload['acta_pdf_base64'] = actaBase64;
        payload['acta_filename'] = this.actaFile.name;
        payload['acta_mime'] = this.actaFile.type;
      }
      if (requiresExtraDocs && registroMercantilBase64 && this.registroMercantilFile) {
        payload['registro_mercantil_pdf_base64'] = registroMercantilBase64;
        payload['registro_mercantil_filename'] = this.registroMercantilFile.name;
        payload['registro_mercantil_mime'] = this.registroMercantilFile.type;
      }
      if (requiresRpaJuridicaGuatemalaDocs && rpaActaNombramientoBase64 && this.rpaActaNombramientoFile) {
        payload['rpa_acta_nombramiento_pdf_base64'] = rpaActaNombramientoBase64;
        payload['rpa_acta_nombramiento_filename'] = this.rpaActaNombramientoFile.name;
        payload['rpa_acta_nombramiento_mime'] = this.rpaActaNombramientoFile.type;
      }
      if (requiresRpaJuridicaGuatemalaDocs && rpaRegistroRepresentanteBase64 && this.rpaRegistroRepresentanteFile) {
        payload['rpa_registro_representante_pdf_base64'] = rpaRegistroRepresentanteBase64;
        payload['rpa_registro_representante_filename'] = this.rpaRegistroRepresentanteFile.name;
        payload['rpa_registro_representante_mime'] = this.rpaRegistroRepresentanteFile.type;
      }
      if (requiresRpaJuridicaGuatemalaDocs && rpaRegistroEntidadBase64 && this.rpaRegistroEntidadFile) {
        payload['rpa_registro_entidad_pdf_base64'] = rpaRegistroEntidadBase64;
        payload['rpa_registro_entidad_filename'] = this.rpaRegistroEntidadFile.name;
        payload['rpa_registro_entidad_mime'] = this.rpaRegistroEntidadFile.type;
      }
      if (requiresRpaJuridicaGuatemalaDocs && rpaDocumentoEstadoBase64 && this.rpaDocumentoEstadoFile) {
        payload['rpa_documento_estado_pdf_base64'] = rpaDocumentoEstadoBase64;
        payload['rpa_documento_estado_filename'] = this.rpaDocumentoEstadoFile.name;
        payload['rpa_documento_estado_mime'] = this.rpaDocumentoEstadoFile.type;
      }

      const request$ = this.editingReturnedId
        ? this.http.put<Submission>(`${this.apiBase}/my-submissions/${this.editingReturnedId}/resubmit`, payload)
        : this.http.post<Submission>(`${this.apiBase}/submissions`, payload);

      request$.subscribe({
        next: (saved) => {
          const registro = saved?.registro_codigo ? ` Correlativo: ${saved.registro_codigo}.` : '';
          this.status = {
            type: 'success',
            message: this.editingReturnedId
              ? `Formulario corregido y reenviado al analista.${registro}`
              : `Formulario enviado correctamente.${registro}`
          };
          this.form.markAsPristine();
          this.form.markAsUntouched();
          this.form.reset({ uso: 'privado', persona_tipo: 'individual', representante_legal: '', origen_compra: '' });
          this.applyPersonaValidators();
          this.applySolicitudMode();
          this.resetReturnedEditState();
          this.clearEditReturnedQueryParam();
          this.dpiFile = null;
          this.actaFile = null;
          this.registroMercantilFile = null;
          this.clearRpaJuridicaGuatemalaDocs();
          this.isSubmitting = false;
          if (this.showTracking) {
            this.fetchMySubmissions();
          }
        },
        error: (err) => {
          console.error(err);
          this.status = { type: 'error', message: 'No se pudo guardar. Verifica la API y la base de datos.' };
          this.isSubmitting = false;
        }
      });
    }).catch(() => {
      this.isSubmitting = false;
      this.status = { type: 'error', message: 'No se pudo leer uno de los PDF.' };
    });
  }

  fetchMySubmissions() {
    this.trackingLoading = true;
    this.http.get<Submission[]>(`${this.apiBase}/my-submissions`).subscribe({
      next: (rows) => {
        this.mySubmissions = rows;
        this.trackingLoading = false;
      },
      error: () => {
        this.mySubmissions = [];
        this.trackingLoading = false;
      }
    });
  }

  startReturnedEdit(row: Submission) {
    if (!row.id) return;
    this.startReturnedEditById(row.id);
  }

  private startReturnedEditById(returnedId: number) {
    this.loadingReturnedEdit = true;
    this.status = null;
    this.http.get<Submission>(`${this.apiBase}/my-submissions/${returnedId}`).subscribe({
      next: (detail) => {
        this.editingReturnedId = detail.id;
        this.existingHasDpi = Boolean(detail.has_dpi || detail.dpi_filename);
        this.existingHasActa = Boolean(detail.has_acta || detail.acta_filename);
        this.existingHasRegistroMercantil = Boolean(detail.has_registro_mercantil || detail.registro_mercantil_filename);
        this.existingHasRpaActaNombramiento = Boolean(detail.has_rpa_acta_nombramiento || detail.rpa_acta_nombramiento_filename);
        this.existingHasRpaRegistroRepresentante = Boolean(detail.has_rpa_registro_representante || detail.rpa_registro_representante_filename);
        this.existingHasRpaRegistroEntidad = Boolean(detail.has_rpa_registro_entidad || detail.rpa_registro_entidad_filename);
        this.existingHasRpaDocumentoEstado = Boolean(detail.has_rpa_documento_estado || detail.rpa_documento_estado_filename);
        this.existingDpiName = detail.dpi_filename || '';
        this.existingActaName = detail.acta_filename || '';
        this.existingRegistroMercantilName = detail.registro_mercantil_filename || '';
        this.existingRpaActaNombramientoName = detail.rpa_acta_nombramiento_filename || '';
        this.existingRpaRegistroRepresentanteName = detail.rpa_registro_representante_filename || '';
        this.existingRpaRegistroEntidadName = detail.rpa_registro_entidad_filename || '';
        this.existingRpaDocumentoEstadoName = detail.rpa_documento_estado_filename || '';
        this.form.patchValue({
          fecha: this.todayDate,
          persona_tipo: detail.persona_tipo || 'individual',
          origen_compra: detail.origen_compra || '',
          nombre_propietario: detail.nombre_propietario || '',
          representante_legal: detail.representante_legal || '',
          documento_propietario: detail.documento_propietario || '',
          direccion: detail.direccion || '',
          telefono: detail.telefono || '',
          correo: detail.correo || '',
          nit: detail.nit || '',
          nombre_orden_pago: detail.nombre_orden_pago || '',
          autorizado_nombre: detail.autorizado_nombre || '',
          autorizado_documento: detail.autorizado_documento || '',
          autorizado_telefono: detail.autorizado_telefono || '',
          ubicacion_inspeccion: detail.ubicacion_inspeccion || '',
          matricula_tg: detail.matricula_tg || '',
          matricula_tg_nueva: detail.matricula_tg_nueva || '',
          uso: detail.uso || 'privado',
          fabricante: detail.fabricante || '',
          numero_serie: detail.numero_serie || '',
          modelo: detail.modelo || '',
          anio_fabricacion: detail.anio_fabricacion || '',
          colores: detail.colores || '',
          tipo_internacion: Boolean(detail.tipo_internacion),
          tipo_reservacion: Boolean(detail.tipo_reservacion),
          tipo_inscripcion: Boolean(detail.tipo_inscripcion),
          tipo_certificado_prov: Boolean(detail.tipo_certificado_prov),
          tipo_reposicion: Boolean(detail.tipo_reposicion),
          tipo_cambio_prop: Boolean(detail.tipo_cambio_prop),
          tipo_cambio_datos: Boolean(detail.tipo_cambio_datos),
          tipo_certificacion: Boolean(detail.tipo_certificacion),
          especificaciones: detail.especificaciones || ''
        }, { emitEvent: false });
        this.applySolicitudMode();
        this.applyPersonaValidators();
        this.dpiFile = null;
        this.actaFile = null;
        this.registroMercantilFile = null;
        this.clearRpaJuridicaGuatemalaDocs();
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

  cancelReturnedEdit() {
    if (!this.isEditingReturned()) return;
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.form.reset({ uso: 'privado', persona_tipo: 'individual', representante_legal: '', origen_compra: '' });
    this.applyPersonaValidators();
    this.applySolicitudMode();
    this.dpiFile = null;
    this.actaFile = null;
    this.registroMercantilFile = null;
    this.clearRpaJuridicaGuatemalaDocs();
    this.resetReturnedEditState();
    this.clearEditReturnedQueryParam();
    this.status = null;
  }

  processStep(row: Submission): number {
    if (row.process_step) return row.process_step;
    if (row.returned_at) return 2;
    if (row.delivered_at) return 5;
    if (this.isRanSubmission(row) && row.approved_at) return 4;
    if (row.approved_at) return 4;
    if (row.assigned_aprobador_id || row.sent_to_aprobador_at) return 4;
    if (row.assigned_emisor_id || row.sent_to_emisor_at) return 3;
    if (row.assigned_analista_id) return 3;
    if (row.receptor_opened_at) return 2;
    return 1;
  }

  processLabel(row: Submission): string {
    if (row.process_label) return row.process_label;
    if (row.returned_at) return 'Devuelto para corrección';
    if (row.delivered_at) return 'Entregado al usuario';
    if (this.isRanSubmission(row) && row.approved_at) return 'Aprobado - pendiente de entrega';
    if (row.approved_at) return 'Aprobado';
    if (row.assigned_aprobador_id || row.sent_to_aprobador_at) return 'En aprobación de unidad';
    if (row.assigned_emisor_id || row.sent_to_emisor_at) return 'En revisión por emisor';
    if (row.assigned_analista_id) return 'Asignado a analista';
    if (row.receptor_opened_at) return 'Recibido por receptor';
    return 'Enviado';
  }

  processPercent(row: Submission): number {
    if (row.process_percent) return row.process_percent;
    if (row.returned_at) return 45;
    if (row.delivered_at) return 100;
    if (this.isRanSubmission(row) && row.approved_at) return 95;
    if (row.approved_at) return 100;
    if (row.assigned_aprobador_id || row.sent_to_aprobador_at) return 90;
    if (row.assigned_emisor_id || row.sent_to_emisor_at) return 82;
    if (row.assigned_analista_id) return 68;
    if (row.receptor_opened_at) return 50;
    return 25;
  }

  isStepDone(row: Submission, step: number): boolean {
    return this.processStep(row) >= step;
  }

  private isRanSubmission(row: Submission): boolean {
    return String(row.unidad_clave || '').toUpperCase() === 'RAN';
  }

  private syncFechaHoy() {
    this.todayDate = this.getTodayLocalDate();
    this.form.patchValue({ fecha: this.todayDate }, { emitEvent: false });
  }

  private getTodayLocalDate() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private readAsBase64(file: File | null): Promise<string | null> {
    if (!file) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1] || null);
      reader.onerror = () => reject(new Error('No se pudo leer archivo'));
      reader.readAsDataURL(file);
    });
  }

  private normalizePdfFile(file: File | null, typeError: string) {
    if (!file) {
      return { file: null, error: '' };
    }
    if (file.type !== 'application/pdf') {
      return { file: null, error: typeError };
    }
    if (file.size > this.maxPdfSizeBytes) {
      return { file: null, error: 'El PDF no puede superar los 10 MB.' };
    }
    return { file, error: '' };
  }

  currentUsoOptions() {
    return this.isRanUav ? this.usoOptionsDrone : this.usoOptionsGeneral;
  }

  formMainTitle() {
    if (this.isRanUav) {
      return 'Formulario único para trámites de aeronaves no tripuladas - UAV - RPA\'s';
    }
    if (this.isRanForm8) {
      return 'FORMULARIO DE SOLICITUD DE CERTIFICACION';
    }
    return 'Formulario único para trámites de aeronaves "TG"';
  }

  sectionATitle() {
    if (this.isRanUav) {
      return 'A. Datos de identificación (individual o jurídico).';
    }
    return 'A. Inscripción de aeronaves a nombre de persona individual o jurídica';
  }

  sectionBTitle() {
    if (this.isRanUav) {
      return 'B. Datos de la aeronave pilotada a distancia (RPA).';
    }
    return 'B. Datos de la aeronave';
  }

  showSolicitudSection() {
    return !this.isRanForm2 && !this.isRanForm8;
  }

  shouldShowAddressBlock() {
    return !this.isRanForm8;
  }

  shouldShowAuthorizedBlock() {
    return this.isRanForm2 || this.isRanForm8 || this.isRanUav || this.isJuridica();
  }

  authorizedBlockNumber() {
    if (this.isRanForm8) return '4';
    return this.isRanUav ? '6' : '5';
  }

  addressNumber() {
    return this.isRanUav ? '5' : '3';
  }

  nitBlockNumber() {
    if (this.isRanForm8) return '3';
    return '4';
  }

  ownerDocumentLabel() {
    if (this.isRanUav) {
      return 'No. de Documento Personal de Identificación o Pasaporte:';
    }
    if (this.isJuridica()) {
      return 'No. de Documento Personal de Identificación o Pasaporte:';
    }
    return 'No. de Documento Personal de Identificación o Pasaporte del Propietario:';
  }

  addressLabel() {
    return this.isRanUav
      ? 'Dirección:'
      : 'Dirección:';
  }

  matriculaLabel() {
    return this.isRanForm8 ? 'Matrícula o distintivo TG/UAV-TG:' : 'Matrícula TG:';
  }

  matriculaPlaceholder() {
    return this.isRanForm8 ? '' : 'TG-';
  }

  requiresExtraUploadDocs() {
    return this.isJuridica() || this.isRanUav;
  }

  isOrigenGuatemala() {
    return String(this.form.value.origen_compra || '').trim().toLowerCase() === 'guatemala';
  }

  requiresRpaJuridicaGuatemalaDocs() {
    return this.isRanUav && this.isJuridica() && this.isOrigenGuatemala();
  }

  dpiUploadTitle() {
    if (this.requiresRpaJuridicaGuatemalaDocs()) {
      return '2. Adjuntar copia simple del DPI del Representante Legal de la entidad propietaria/arrendataria';
    }
    return this.isRanUav ? '2. Adjuntar copia simple del DPI' : 'Adjuntar copia simple del DPI';
  }

  actaUploadTitle() {
    return this.isRanUav
      ? '1. Dictamen Técnico emitido por el Departamento de Vigilancia de la Seguridad Operacional -DVSO-'
      : 'Copia simple del Acta de nombramiento del representante legal de la entidad propietaria/arrendataria, debidamente inscrita en el Registro Mercantil.';
  }

  actaUploadDescription() {
    return this.isRanUav
      ? 'Carga el Dictamen Técnico en formato PDF.'
      : 'Carga el acta notarial de la persona jurídica en formato PDF.';
  }

  actaUploadPlaceholder() {
    return this.isRanUav ? 'Seleccionar PDF del Dictamen Técnico...' : 'Seleccionar PDF del Acta de Nombramiento...';
  }

  registroUploadTitle() {
    return this.isRanUav ? '3. Copia auténtica de Factura o Acta Notarial de Declaración Jurada' : '';
  }

  registroUploadDescription() {
    return this.isRanUav
      ? 'Carga la copia auténtica de Factura o Acta Notarial de Declaración Jurada en formato PDF.'
      : 'Carga el registro mercantil de la entidad en formato PDF.';
  }

  registroUploadPlaceholder() {
    return this.isRanUav
      ? 'Seleccionar PDF de Factura o Acta Notarial...'
      : 'Seleccionar PDF del Registro Mercantil...';
  }

  droneSolicitudRows() {
    return [
      { key: 'tipo_reservacion', label: '1. Reserva de Distintivo / DESADUANAJE (Q 105.00)' },
      { key: 'tipo_inscripcion', label: '2. Inscripción en el D.R.A.N (Q 1,000.00)' },
      { key: 'tipo_cambio_prop', label: '3. Cambio de Propietario (Q 400.00)' },
      { key: 'tipo_reposicion', label: '4. Reposición de Certificado de Distintivo (Q 200.00)' },
      { key: 'tipo_certificacion', label: '5. Certificación (Q 50.00)' }
    ] as const;
  }

  private applySolicitudMode() {
    if (!this.isRanMode) return;

    if (this.isRanForm2) {
      this.form.patchValue({
        tipo_internacion: false,
        tipo_reservacion: true,
        tipo_inscripcion: false,
        tipo_certificado_prov: false,
        tipo_reposicion: false,
        tipo_cambio_prop: false,
        tipo_cambio_datos: false,
        tipo_certificacion: false
      }, { emitEvent: false });
      return;
    }

    if (this.isRanForm8) {
      this.form.patchValue({
        tipo_internacion: false,
        tipo_reservacion: false,
        tipo_inscripcion: false,
        tipo_certificado_prov: false,
        tipo_reposicion: false,
        tipo_cambio_prop: false,
        tipo_cambio_datos: false,
        tipo_certificacion: true
      }, { emitEvent: false });
      return;
    }

    if (this.isRanUav) {
      this.form.patchValue({
        tipo_internacion: false,
        tipo_certificado_prov: false,
        tipo_cambio_datos: false
      }, { emitEvent: false });
    }
  }

  private configureFormMode(data: Record<string, unknown>) {
    const routeMode = String(data['formMode'] || 'general');
    this.formMode = routeMode === 'ran2' || routeMode === 'ran8' || routeMode === 'ranUav' ? routeMode : 'general';
    this.isRanMode = this.formMode === 'ran2' || this.formMode === 'ran8' || this.formMode === 'ranUav';
    this.isRanForm2 = this.formMode === 'ran2';
    this.isRanForm8 = this.formMode === 'ran8';
    this.isRanUav = this.formMode === 'ranUav';

    const matriculaControl = this.form.get('matricula_tg');
    if (matriculaControl) {
      matriculaControl.setValidators(this.isRanUav ? [] : [Validators.required]);
      matriculaControl.updateValueAndValidity({ emitEvent: false });
    }

    const numeroSerieControl = this.form.get('numero_serie');
    if (numeroSerieControl) {
      numeroSerieControl.setValidators(this.isRanUav ? [] : [Validators.required]);
      numeroSerieControl.updateValueAndValidity({ emitEvent: false });
    }

    const documentoPropietarioControl = this.form.get('documento_propietario');
    if (documentoPropietarioControl) {
      const validators = (this.isRanForm2 || this.isRanForm8 || this.isRanUav)
        ? [Validators.required, digitsExactOrEmpty(13)]
        : [digitsExactOrEmpty(13)];
      documentoPropietarioControl.setValidators(validators);
      documentoPropietarioControl.updateValueAndValidity({ emitEvent: false });
    }

    const direccionControl = this.form.get('direccion');
    if (direccionControl) {
      direccionControl.setValidators(this.isRanForm8 ? [] : [Validators.required, Validators.minLength(5)]);
      direccionControl.updateValueAndValidity({ emitEvent: false });
    }

    const origenCompraControl = this.form.get('origen_compra');
    if (origenCompraControl) {
      origenCompraControl.setValidators(this.isRanUav ? [Validators.required] : []);
      if (!this.isRanUav) {
        origenCompraControl.setValue('', { emitEvent: false });
      }
      origenCompraControl.updateValueAndValidity({ emitEvent: false });
    }

    const nitControl = this.form.get('nit');
    if (nitControl) {
      nitControl.setValidators((this.isRanForm2 || this.isRanForm8 || this.isRanUav) ? [Validators.required] : []);
      nitControl.updateValueAndValidity({ emitEvent: false });
    }

    const nombreOrdenPagoControl = this.form.get('nombre_orden_pago');
    if (nombreOrdenPagoControl) {
      nombreOrdenPagoControl.setValidators(this.isRanForm2 ? [Validators.required] : []);
      nombreOrdenPagoControl.updateValueAndValidity({ emitEvent: false });
    }

    this.applySolicitudMode();
    if (this.isRanUav) {
      this.form.patchValue({
        matricula_tg_nueva: '',
        anio_fabricacion: '',
        colores: '',
        ubicacion_inspeccion: ''
      }, { emitEvent: false });
    } else {
      this.clearRpaJuridicaGuatemalaDocs();
    }
    if (this.isRanForm8) {
      this.form.patchValue({
        matricula_tg_nueva: ''
      }, { emitEvent: false });
    }

    const allowedValues = new Set(this.currentUsoOptions().map((opt) => opt.value));
    const currentUso = String(this.form.value.uso || '');
    if (!allowedValues.has(currentUso)) {
      this.form.patchValue({ uso: this.currentUsoOptions()[0]?.value || 'privado' }, { emitEvent: false });
    }
  }

  private applyPersonaValidators() {
    const representante = this.form.get('representante_legal');
    if (!representante) return;

    if (this.isJuridica()) {
      representante.setValidators([Validators.required, Validators.minLength(3)]);
    } else {
      representante.clearValidators();
    }
    representante.updateValueAndValidity({ emitEvent: false });
  }

  private buildFormPayload() {
    const payload = { ...this.form.value };
    if (!this.isRanMode) return payload;

    if (this.isRanUav) {
      return {
        ...payload,
        tipo_internacion: false,
        tipo_certificado_prov: false,
        tipo_cambio_datos: false
      };
    }

    return {
      ...payload,
      matricula_tg_nueva: this.isRanForm8 ? '' : payload.matricula_tg_nueva,
      tipo_internacion: false,
      tipo_reservacion: this.isRanForm2,
      tipo_inscripcion: false,
      tipo_certificado_prov: false,
      tipo_reposicion: false,
      tipo_cambio_prop: false,
      tipo_cambio_datos: false,
      tipo_certificacion: this.isRanForm8
    };
  }

  ranModeLabel() {
    if (this.isRanForm2) return 'Reserva, Prórroga o Cesión de Matrícula';
    if (this.isRanForm8) return 'Certificación';
    if (this.isRanUav) return 'UAV / RPA Distintivo';
    return '';
  }

  isEditingReturned() {
    return this.editingReturnedId !== null;
  }

  private clearRpaJuridicaGuatemalaDocs() {
    this.rpaActaNombramientoFile = null;
    this.rpaActaNombramientoError = '';
    this.rpaRegistroRepresentanteFile = null;
    this.rpaRegistroRepresentanteError = '';
    this.rpaRegistroEntidadFile = null;
    this.rpaRegistroEntidadError = '';
    this.rpaDocumentoEstadoFile = null;
    this.rpaDocumentoEstadoError = '';
  }

  private resetReturnedEditState() {
    this.editingReturnedId = null;
    this.loadingReturnedEdit = false;
    this.existingDpiName = '';
    this.existingActaName = '';
    this.existingRegistroMercantilName = '';
    this.existingRpaActaNombramientoName = '';
    this.existingRpaRegistroRepresentanteName = '';
    this.existingRpaRegistroEntidadName = '';
    this.existingRpaDocumentoEstadoName = '';
    this.existingHasDpi = false;
    this.existingHasActa = false;
    this.existingHasRegistroMercantil = false;
    this.existingHasRpaActaNombramiento = false;
    this.existingHasRpaRegistroRepresentante = false;
    this.existingHasRpaRegistroEntidad = false;
    this.existingHasRpaDocumentoEstado = false;
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

  private currentUnidadClave() {
    if (this.isRanMode) return 'RAN';
    return 'GENERAL';
  }

  private currentGestionNombre() {
    if (this.isRanForm2) return 'Reserva, Prórroga o Cesión de Matrícula';
    if (this.isRanForm8) return 'Certificación';
    if (this.isRanUav) return 'UAV / RPA - Distintivo';
    return 'Formulario General TG';
  }

}



