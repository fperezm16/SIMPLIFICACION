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
  standalone: true,
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
  existingHasDpi = false;
  existingHasActa = false;
  existingHasRegistroMercantil = false;
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
    this.dpiFile = file || null;
    this.dpiError = '';
    if (file && file.type !== 'application/pdf') {
      this.dpiError = 'El archivo debe ser PDF.';
      this.dpiFile = null;
    }
  }

  onActaSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    this.actaFile = file || null;
    this.actaError = '';
    if (file && file.type !== 'application/pdf') {
      this.actaError = 'El acta notarial debe ser PDF.';
      this.actaFile = null;
    }
  }

  onRegistroMercantilSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    this.registroMercantilFile = file || null;
    this.registroMercantilError = '';
    if (file && file.type !== 'application/pdf') {
      this.registroMercantilError = 'El registro mercantil debe ser PDF.';
      this.registroMercantilFile = null;
    }
  }

  isJuridica() {
    return (this.form.value.persona_tipo || 'individual') === 'juridica';
  }

  setPersonaTipo(tipo: 'individual' | 'juridica') {
    this.form.patchValue({ persona_tipo: tipo }, { emitEvent: false });
    this.applyPersonaValidators();
    this.actaError = '';
    this.registroMercantilError = '';
    if (tipo === 'individual') {
      this.actaFile = null;
      this.registroMercantilFile = null;
    }
  }

  onSubmit(): void {
    this.status = null;
    this.dpiError = '';
    this.actaError = '';
    this.registroMercantilError = '';
    this.syncFechaHoy();
    const isResubmit = this.isEditingReturned();
    const hasDpiReady = Boolean(this.dpiFile) || (isResubmit && this.existingHasDpi);
    const hasActaReady = Boolean(this.actaFile) || (isResubmit && this.existingHasActa);
    const hasRegistroMercantilReady = Boolean(this.registroMercantilFile) || (isResubmit && this.existingHasRegistroMercantil);

    if (!hasDpiReady) {
      this.dpiError = 'Adjunta el DPI en PDF antes de guardar.';
      this.form.markAllAsTouched();
      return;
    }
    if (this.dpiFile && this.dpiFile.type !== 'application/pdf') {
      this.dpiError = 'El archivo debe ser PDF.';
      return;
    }
    if (this.isJuridica() && !hasActaReady) {
      this.actaError = 'Adjunta el acta notarial en PDF para persona jurídica.';
      this.form.markAllAsTouched();
      return;
    }
    if (this.actaFile && this.actaFile.type !== 'application/pdf') {
      this.actaError = 'El acta notarial debe ser PDF.';
      return;
    }
    if (this.isJuridica() && !hasRegistroMercantilReady) {
      this.registroMercantilError = 'Adjunta el registro mercantil en PDF para persona jurídica.';
      this.form.markAllAsTouched();
      return;
    }
    if (this.registroMercantilFile && this.registroMercantilFile.type !== 'application/pdf') {
      this.registroMercantilError = 'El registro mercantil debe ser PDF.';
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSubmitting = true;

    this.readAsBase64(this.dpiFile).then((dpiBase64) => {
      if (!dpiBase64) {
        throw new Error('No se pudo leer el DPI.');
      }
      return this.readAsBase64(this.actaFile).then((actaBase64) => ({ dpiBase64, actaBase64 }));
    }).then(({ dpiBase64, actaBase64 }) => {
      return this.readAsBase64(this.registroMercantilFile).then((registroMercantilBase64) => ({ dpiBase64, actaBase64, registroMercantilBase64 }));
    }).then(({ dpiBase64, actaBase64, registroMercantilBase64 }) => {
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
      if (this.isJuridica() && actaBase64 && this.actaFile) {
        payload['acta_pdf_base64'] = actaBase64;
        payload['acta_filename'] = this.actaFile.name;
        payload['acta_mime'] = this.actaFile.type;
      }
      if (this.isJuridica() && registroMercantilBase64 && this.registroMercantilFile) {
        payload['registro_mercantil_pdf_base64'] = registroMercantilBase64;
        payload['registro_mercantil_filename'] = this.registroMercantilFile.name;
        payload['registro_mercantil_mime'] = this.registroMercantilFile.type;
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
          this.form.reset({ uso: 'privado', persona_tipo: 'individual', representante_legal: '' });
          this.applyPersonaValidators();
          this.applySolicitudMode();
          this.resetReturnedEditState();
          this.clearEditReturnedQueryParam();
          this.dpiFile = null;
          this.actaFile = null;
          this.registroMercantilFile = null;
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
        this.existingDpiName = detail.dpi_filename || '';
        this.existingActaName = detail.acta_filename || '';
        this.existingRegistroMercantilName = detail.registro_mercantil_filename || '';
        this.form.patchValue({
          fecha: this.todayDate,
          persona_tipo: detail.persona_tipo || 'individual',
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
    this.form.reset({ uso: 'privado', persona_tipo: 'individual', representante_legal: '' });
    this.applyPersonaValidators();
    this.applySolicitudMode();
    this.dpiFile = null;
    this.actaFile = null;
    this.registroMercantilFile = null;
    this.resetReturnedEditState();
    this.clearEditReturnedQueryParam();
    this.status = null;
  }

  processStep(row: Submission): number {
    if (row.process_step) return row.process_step;
    if (row.returned_at) return 2;
    if (row.approved_at) return 4;
    if (row.assigned_analista_id) return 3;
    if (row.receptor_opened_at) return 2;
    return 1;
  }

  processLabel(row: Submission): string {
    if (row.process_label) return row.process_label;
    if (row.returned_at) return 'Devuelto para corrección';
    if (row.approved_at) return 'Aprobado';
    if (row.assigned_analista_id) return 'Asignado a analista';
    if (row.receptor_opened_at) return 'Recibido por receptor';
    return 'Enviado';
  }

  processPercent(row: Submission): number {
    if (row.process_percent) return row.process_percent;
    if (row.returned_at) return 45;
    return this.processStep(row) * 25;
  }

  isStepDone(row: Submission, step: number): boolean {
    return this.processStep(row) >= step;
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
      return 'No. de Documento Personal de Identificación (Persona Individual o Representante Legal):';
    }
    if (this.isJuridica()) {
      return 'No. de Documento Personal de Identificación o Pasaporte:';
    }
    return 'No. de Documento Personal de Identificación o Pasaporte del Propietario:';
  }

  addressLabel() {
    return this.isRanUav
      ? 'Dirección a consignar en el Certificado de Distintivo:'
      : 'Dirección a consignar en el Certificado de matrícula:';
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

    const direccionControl = this.form.get('direccion');
    if (direccionControl) {
      direccionControl.setValidators(this.isRanForm8 ? [] : [Validators.required, Validators.minLength(5)]);
      direccionControl.updateValueAndValidity({ emitEvent: false });
    }

    this.applySolicitudMode();
    if (this.isRanUav) {
      this.form.patchValue({
        matricula_tg_nueva: '',
        anio_fabricacion: '',
        colores: '',
        ubicacion_inspeccion: ''
      }, { emitEvent: false });
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
    if (this.isRanForm2) return 'Unidad RAN - Reserva, Prórroga o Cesión de Matrícula';
    if (this.isRanForm8) return 'Unidad RAN - Certificación';
    if (this.isRanUav) return 'Unidad RAN - UAV / RPA Distintivo';
    return '';
  }

  isEditingReturned() {
    return this.editingReturnedId !== null;
  }

  private resetReturnedEditState() {
    this.editingReturnedId = null;
    this.loadingReturnedEdit = false;
    this.existingDpiName = '';
    this.existingActaName = '';
    this.existingRegistroMercantilName = '';
    this.existingHasDpi = false;
    this.existingHasActa = false;
    this.existingHasRegistroMercantil = false;
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



