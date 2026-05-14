import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { jsPDF } from 'jspdf';
import { API_BASE } from './api.config';
import { AuthService } from './auth.service';
import { Submission } from './submission.model';

function digitsExact(length: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = String(control.value ?? '').trim();
    if (!raw) return null;
    if (!/^\d+$/.test(raw)) return { digitsOnly: true };
    return raw.length === length ? null : { digitsLength: { requiredLength: length, actualLength: raw.length } };
  };
}

function genericPermitLeadTimeValidator(getNow: () => Date): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const parent = control.parent;
    if (!parent) return null;

    const permitType = String(parent.get('tipo_permiso')?.value || '').trim().toLowerCase();
    if (permitType !== 'generico') return null;

    const fecha = String(parent.get('fecha_ingreso')?.value || '').trim();
    const hora = String(parent.get('hora_ingreso')?.value || '').trim();
    if (!fecha || !hora) return null;

    const ingreso = new Date(`${fecha}T${hora}:00`);
    if (Number.isNaN(ingreso.getTime())) return null;

    const minAllowed = new Date(getNow().getTime() + (72 * 60 * 60 * 1000));
    return ingreso.getTime() >= minAllowed.getTime()
      ? null
      : { genericPermit72Hours: true };
  };
}

type AilaFileKey =
  | 'cartaSolicitud'
  | 'facturaSolvencia'
  | `personaDoc${number}`
  | 'escortPwd1'
  | 'escortPwd2'
  | 'escortPwd3'
  | 'herramientasFotos'
  | 'vehiculosTarjeta';

type FixedAilaFileKey =
  | 'cartaSolicitud'
  | 'facturaSolvencia'
  | 'escortPwd1'
  | 'escortPwd2'
  | 'escortPwd3'
  | 'herramientasFotos'
  | 'vehiculosTarjeta'
  | 'personaDoc1'
  | 'personaDoc2'
  | 'personaDoc3'
  | 'personaDoc4'
  | 'personaDoc5';

type AilaFileMap<T> = Record<FixedAilaFileKey, T> & Record<`personaDoc${number}`, T>;

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
  personas?: Array<{ nombre: string; documento: string; documento_pdf?: string }>;
  escoltas?: Array<{ nombre: string; telefono: string; tia: string; vencimiento_tia: string; contrasena?: string; documento_pdf?: string; contrasena_pdf?: string }>;
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
  private auth = inject(AuthService);

  readonly apiBase = API_BASE;
  readonly currentRole = String(this.auth.currentUser?.role || '').trim().toLowerCase();
  readonly canViewAdministrativeAilaSections = this.currentRole === 'jefatura_avsec' || this.currentRole === 'jefatura_aila';
  readonly minPeopleRows = 1;
  readonly minEscortRows = 1;
  readonly minItemRows = 1;
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
    telefono_notificaciones: ['', Validators.required],
    hora_ingreso: ['', Validators.required],
    correo_notificaciones: ['', [Validators.required, Validators.email]],
    persona1_nombre: ['', Validators.required],
    persona1_documento: ['', Validators.required],
    persona2_nombre: [''], persona2_documento: [''],
    persona3_nombre: [''], persona3_documento: [''],
    persona4_nombre: [''], persona4_documento: [''],
    persona5_nombre: [''], persona5_documento: [''],
    escolta1_nombre: ['', Validators.required],
    escolta1_telefono: ['', Validators.required],
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
  genericMinIngresoDate = '';
  status: { type: 'success' | 'error'; message: string } | null = null;
  isSubmitting = false;
  editingReturnedId: number | null = null;
  loadingReturnedEdit = false;

  files: AilaFileMap<File | null> = this.createInitialFileRecord<File | null>(null);

  existingFiles: AilaFileMap<string> = this.createInitialFileRecord<string>('');

  fileErrors: AilaFileMap<string> = this.createInitialFileRecord<string>('');

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
    if (control.errors?.['email']) return 'Correo no vÃ¡lido';
    if (control.errors?.['digitsOnly']) return 'Solo se permiten dÃ­gitos';
    if (control.errors?.['digitsLength']) return `Debe tener ${control.errors['digitsLength'].requiredLength} dÃ­gitos`;
    if (control.errors?.['minlength']) return `MÃ­nimo ${control.errors['minlength'].requiredLength} caracteres`;
    if (control.errors?.['genericPermit72Hours']) return 'Para permiso genérico debes solicitar el ingreso con al menos 72 horas de anticipación';
    return 'Valor no vÃ¡lido';
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

  escortPasswordKey(idx: number): Extract<AilaFileKey, 'escortPwd1' | 'escortPwd2' | 'escortPwd3'> {
    return (`escortPwd${idx}` as Extract<AilaFileKey, 'escortPwd1' | 'escortPwd2' | 'escortPwd3'>);
  }

  isEscortTiaExpired(idx: number) {
    return this.isEscortTiaExpiredByValue(this.form.get(`escolta${idx}_vencimiento_tia`)?.value);
  }

  escortNeedsAttachment(idx: number) {
    return Boolean(String(this.form.get(`escolta${idx}_vencimiento_tia`)?.value || '').trim());
  }

  escortDocumentTitle(idx: number) {
    return this.isEscortTiaExpired(idx) ? 'Copia de contraseña' : 'Copia de DPI';
  }

  escortDocumentPlaceholder(idx: number) {
    return this.isEscortTiaExpired(idx)
      ? 'Seleccionar PDF de contraseña...'
      : 'Seleccionar PDF de DPI...';
  }

  private isEscortTiaExpiredByValue(value: unknown) {
    const raw = String(value || '').trim();
    return Boolean(raw) && raw <= this.todayDate;
  }

  addPersonRow() {
    const nextIndex = (this.peopleRows[this.peopleRows.length - 1] || 0) + 1;
    this.ensurePersonControls(nextIndex);
    this.ensurePersonFileKey(nextIndex);
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

  addEscortRow() {
    const nextIndex = (this.escortRows[this.escortRows.length - 1] || 0) + 1;
    this.ensureEscortControls(nextIndex);
    this.escortRows = [...this.escortRows, nextIndex];
    this.syncDynamicValidators();
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
      ['nombre', 'documento'].some((field) => this.form.get(`persona${idx}_${field}`)?.invalid && this.form.get(`persona${idx}_${field}`)?.touched)
    );
  }

  hasEscortRowErrors() {
    return this.escortRows.some((idx) =>
      ['nombre', 'telefono', 'tia', 'vencimiento_tia', 'contrasena'].some((field) => this.form.get(`escolta${idx}_${field}`)?.invalid && this.form.get(`escolta${idx}_${field}`)?.touched)
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

  async savePdf() {
    const detail = this.buildDetail();
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - (margin * 2);
    let y = margin;

    const [mcivLogo, dgacLogo] = await Promise.all([
      this.loadImageAsDataUrl('assets/mciv-oficial.png'),
      this.loadImageAsDataUrl('assets/dgac-oficial.png')
    ]);

    if (mcivLogo) pdf.addImage(mcivLogo, 'PNG', margin, y, 54, 18);
    if (dgacLogo) pdf.addImage(dgacLogo, 'PNG', pageWidth - margin - 54, y, 54, 18);
    y += 24;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11.5);
    const titleLines = pdf.splitTextToSize(
      'PERMISO DE INGRESO A INSTALACIONES DEL AEROPUERTO INTERNACIONAL LA AURORA',
      contentWidth - 12
    );
    pdf.text(titleLines, pageWidth / 2, y, { align: 'center' });
    y += titleLines.length * 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text('Ingreso y egreso de herramienta, mercadería y mobiliario', pageWidth / 2, y, { align: 'center' });
    y += 5;
    pdf.text('Aeropuerto Internacional "La Aurora"', pageWidth / 2, y, { align: 'center' });
    y += 7;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.roundedRect((pageWidth / 2) - 24, y - 4.5, 48, 8, 4, 4);
    pdf.text('Administración AILA', pageWidth / 2, y + 0.5, { align: 'center' });
    y += 10;

    const ensureSpace = (needed = 10) => {
      if (y + needed <= pageHeight - margin) return;
      pdf.addPage();
      y = margin;
    };

    const addSectionTitle = (title: string) => {
      ensureSpace(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text(title, margin, y);
      y += 6;
    };

    const addField = (label: string, value: string, options?: { full?: boolean }) => {
      const width = options?.full ? contentWidth : (contentWidth / 2) - 2;
      const lines = pdf.splitTextToSize(value || '-', width - 4);
      const height = Math.max(8, (lines.length * 4) + 4);
      ensureSpace(height + 6);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text(label, margin, y);
      pdf.setFont('helvetica', 'normal');
      pdf.rect(margin, y + 1.5, width, height);
      pdf.text(lines, margin + 2, y + 6);
      y += height + 6;
    };

    const addTwoColumnFields = (left: [string, string], right: [string, string]) => {
      const halfWidth = (contentWidth / 2) - 3;
      const leftLines = pdf.splitTextToSize(left[1] || '-', halfWidth - 4);
      const rightLines = pdf.splitTextToSize(right[1] || '-', halfWidth - 4);
      const height = Math.max(8, Math.max(leftLines.length, rightLines.length) * 4 + 4);
      ensureSpace(height + 6);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text(left[0], margin, y);
      pdf.text(right[0], margin + halfWidth + 6, y);
      pdf.setFont('helvetica', 'normal');
      pdf.rect(margin, y + 1.5, halfWidth, height);
      pdf.rect(margin + halfWidth + 6, y + 1.5, halfWidth, height);
      pdf.text(leftLines, margin + 2, y + 6);
      pdf.text(rightLines, margin + halfWidth + 8, y + 6);
      y += height + 6;
    };

    const addSimpleTable = (headers: string[], rows: string[][], widths: number[]) => {
      const rowHeight = 7;
      ensureSpace(12);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      let x = margin;
      headers.forEach((header, index) => {
        pdf.rect(x, y, widths[index], rowHeight);
        pdf.text(header, x + 1.5, y + 4.5);
        x += widths[index];
      });
      y += rowHeight;
      pdf.setFont('helvetica', 'normal');
      rows.forEach((row) => {
        const lineCounts = row.map((cell, index) => pdf.splitTextToSize(cell || '-', widths[index] - 3).length);
        const dynamicHeight = Math.max(rowHeight, (Math.max(...lineCounts) * 4) + 3);
        ensureSpace(dynamicHeight + 2);
        let cellX = margin;
        row.forEach((cell, index) => {
          pdf.rect(cellX, y, widths[index], dynamicHeight);
          pdf.text(pdf.splitTextToSize(cell || '-', widths[index] - 3), cellX + 1.5, y + 4.5);
          cellX += widths[index];
        });
        y += dynamicHeight;
      });
      y += 4;
    };

    addSectionTitle('1. Clasificación del permiso');
    addField('Tipo de permiso', detail.tipo_permiso || '', { full: true });

    addSectionTitle('2. Datos del permiso');
    addTwoColumnFields(['Fecha de solicitud', this.todayDate], ['Empresa / Arrendatario', detail.empresa_arrendatario || '']);
    addTwoColumnFields(['Área de destino a ingresar', detail.area_destino || ''], ['Motivo del ingreso', detail.motivo_visita || '']);
    addTwoColumnFields(['Fecha de ingreso', detail.fecha_ingreso || ''], ['Días solicitados', detail.dias_solicitados || '']);
    addTwoColumnFields(['No. telefónico para notificaciones', detail.telefono_notificaciones || ''], ['Hora de ingreso', detail.hora_ingreso || '']);
    addField('Correo electrónico para notificaciones', detail.correo_notificaciones || '', { full: true });

    addSectionTitle('3. Personas a ingresar');
    const personRows = (detail.personas || [])
      .filter((row) => row.nombre || row.documento || row.documento_pdf)
      .map((row, index) => [
        String(index + 1),
        row.nombre || '',
        row.documento || '',
        row.documento_pdf || ''
      ]);
    if (personRows.length) {
      addSimpleTable(['#', 'Nombres y apellidos completos como DPI', 'No. DPI - CUI', 'PDF'], personRows, [10, 76, 44, 44]);
    } else {
      addField('Registros', 'Sin registros.', { full: true });
    }

    addSectionTitle('4. Datos de escolta');
    const escortRows = (detail.escoltas || [])
      .filter((row) => row.nombre || row.telefono || row.tia || row.vencimiento_tia || row.contrasena || row.documento_pdf)
      .map((row, index) => [
        String(index + 1),
        row.nombre || '',
        row.telefono || '',
        row.tia || '',
        row.vencimiento_tia || '',
        row.contrasena || 'No aplica',
        row.documento_pdf || ''
      ]);
    if (escortRows.length) {
      addSimpleTable(['#', 'Nombre según T.I.A.', 'Teléfono', 'No. T.I.A.', 'Vencimiento', 'Contraseña', 'PDF'], escortRows, [8, 52, 22, 24, 24, 24, 32]);
    } else {
      addField('Registros', 'Sin registros.', { full: true });
    }

    addSectionTitle('5. Herramienta, mercadería y/o mobiliario');
    const toolRows = (detail.herramientas || [])
      .filter((row) => row.cantidad || row.descripcion)
      .map((row, index) => [String(index + 1), row.cantidad || '', row.descripcion || '']);
    if (toolRows.length) {
      addSimpleTable(['#', 'Cantidad', 'Descripción'], toolRows, [10, 30, 136]);
    } else {
      addField('Registros', 'Sin registros.', { full: true });
    }

    addSectionTitle('6. Observaciones');
    addField('Observaciones', String(this.form.get('vehiculo1_tipo')?.value || '').trim(), { full: true });

    addSectionTitle('7. Documentos adjuntos');
    const documentRows = [
      ['Carta de solicitud', detail.documentos?.cartaSolicitud || ''],
      ['Factura o solvencia', detail.documentos?.facturaSolvencia || ''],
      ['PDF adicional', detail.documentos?.vehiculosTarjeta || '']
    ].filter(([, value]) => value);
    if (documentRows.length) {
      addSimpleTable(['Documento', 'Archivo'], documentRows, [55, 125]);
    } else {
      addField('Documentos', 'Sin documentos adjuntos.', { full: true });
    }

    const safeCode = String(this.form.value.empresa_arrendatario || 'formulario-aila')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'formulario-aila';
    pdf.save(`${safeCode}.pdf`);
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
      ['facturaSolvencia', 'La factura reciente de arrendamiento/solvencia en PDF es obligatoria.']
    ];

    for (const [key, message] of required) {
      if (!this.files[key] && !this.existingFiles[key]) {
        this.fileErrors[key] = message;
        return message;
      }
    }

    for (const idx of this.peopleRows) {
      if (!this.personRowHasValue(idx)) continue;
      const key = this.personDocumentKey(idx);
      if (!this.files[key] && !this.existingFiles[key]) {
        this.fileErrors[key] = `Debes adjuntar el PDF de la persona ${idx}.`;
        return this.fileErrors[key];
      }
    }

    for (const idx of this.escortRows) {
      if (!this.escortRowHasValue(idx)) continue;
      if (this.isEscortTiaExpired(idx) && !String(this.form.get(`escolta${idx}_contrasena`)?.value || '').trim()) {
        return `Debes ingresar el número de contraseña del escolta ${idx}.`;
      }
      const key = this.escortPasswordKey(idx);
      if (!this.files[key] && !this.existingFiles[key]) {
        this.fileErrors[key] = this.isEscortTiaExpired(idx)
          ? `Debes adjuntar el PDF de la contraseña del escolta ${idx}.`
          : `Debes adjuntar el PDF de DPI del escolta ${idx}.`;
        return this.fileErrors[key];
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
      dpi_pdf_base64: filePayload['personaDoc1'] || undefined,
      dpi_filename: this.files.personaDoc1?.name || undefined,
      dpi_mime: this.files.personaDoc1?.type || undefined,
      financial_declaraguate_2_pdf_base64: filePayload['personaDoc2'] || undefined,
      financial_declaraguate_2_filename: this.files.personaDoc2?.name || undefined,
      financial_declaraguate_2_mime: this.files.personaDoc2?.type || undefined,
      financial_declaraguate_3_pdf_base64: filePayload['personaDoc3'] || undefined,
      financial_declaraguate_3_filename: this.files.personaDoc3?.name || undefined,
      financial_declaraguate_3_mime: this.files.personaDoc3?.type || undefined,
      financial_declaraguate_4_pdf_base64: filePayload['personaDoc4'] || undefined,
      financial_declaraguate_4_filename: this.files.personaDoc4?.name || undefined,
      financial_declaraguate_4_mime: this.files.personaDoc4?.type || undefined,
      financial_declaraguate_5_pdf_base64: filePayload['personaDoc5'] || undefined,
      financial_declaraguate_5_filename: this.files.personaDoc5?.name || undefined,
      financial_declaraguate_5_mime: this.files.personaDoc5?.type || undefined,
      aila_escort_pwd_1_pdf_base64: filePayload.escortPwd1 || undefined,
      aila_escort_pwd_1_filename: this.files.escortPwd1?.name || undefined,
      aila_escort_pwd_1_mime: this.files.escortPwd1?.type || undefined,
      aila_escort_pwd_2_pdf_base64: filePayload.escortPwd2 || undefined,
      aila_escort_pwd_2_filename: this.files.escortPwd2?.name || undefined,
      aila_escort_pwd_2_mime: this.files.escortPwd2?.type || undefined,
      aila_escort_pwd_3_pdf_base64: filePayload.escortPwd3 || undefined,
      aila_escort_pwd_3_filename: this.files.escortPwd3?.name || undefined,
      aila_escort_pwd_3_mime: this.files.escortPwd3?.type || undefined,
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
        documento_pdf: this.files[this.personDocumentKey(idx)]?.name || this.existingFiles[this.personDocumentKey(idx)] || ''
      })).filter((row) => row.nombre || row.documento || row.documento_pdf),
      escoltas: this.escortRows.map((idx) => ({
        nombre: String(this.form.get(`escolta${idx}_nombre`)?.value || '').trim(),
        telefono: String(this.form.get(`escolta${idx}_telefono`)?.value || '').trim(),
        tia: String(this.form.get(`escolta${idx}_tia`)?.value || '').trim(),
        vencimiento_tia: String(this.form.get(`escolta${idx}_vencimiento_tia`)?.value || '').trim(),
        contrasena: String(this.form.get(`escolta${idx}_contrasena`)?.value || '').trim(),
        documento_pdf: this.files[this.escortPasswordKey(idx)]?.name || this.existingFiles[this.escortPasswordKey(idx)] || ''
      })).filter((row) => row.nombre || row.telefono || row.tia || row.vencimiento_tia || row.contrasena || row.documento_pdf),
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
        escortPwd1: this.files.escortPwd1?.name || this.existingFiles.escortPwd1 || '',
        escortPwd2: this.files.escortPwd2?.name || this.existingFiles.escortPwd2 || '',
        escortPwd3: this.files.escortPwd3?.name || this.existingFiles.escortPwd3 || '',
        herramientasFotos: this.files.herramientasFotos?.name || this.existingFiles.herramientasFotos || '',
        vehiculosTarjeta: this.files.vehiculosTarjeta?.name || this.existingFiles.vehiculosTarjeta || ''
      }
    };
  }

  private buildSummary(detail: AilaDetail) {
    return [
      `Permiso: ${detail.tipo_permiso}`,
      `Ãrea destino: ${detail.area_destino}`,
      `Motivo: ${detail.motivo_visita}`,
      `Ingreso: ${detail.fecha_ingreso}`,
      `DÃ­as: ${detail.dias_solicitados}`,
      `Personas: ${detail.personas?.length || 0}`,
      `Escoltas: ${detail.escoltas?.length || 0}`,
      detail.herramientas?.length ? `Herramientas/mercaderÃ­a/mobiliario: ${detail.herramientas.length}` : '',
      detail.vehiculos?.length ? `VehÃ­culos: ${detail.vehiculos.length}` : ''
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
    const minIngreso = new Date(now.getTime() + (72 * 60 * 60 * 1000));
    const minYear = minIngreso.getFullYear();
    const minMonth = String(minIngreso.getMonth() + 1).padStart(2, '0');
    const minDay = String(minIngreso.getDate()).padStart(2, '0');
    this.genericMinIngresoDate = `${minYear}-${minMonth}-${minDay}`;
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
        this.patchRows('persona', detail.personas || [], ['nombre', 'documento']);
        this.patchRows('escolta', detail.escoltas || [], ['nombre', 'telefono', 'tia', 'vencimiento_tia', 'contrasena']);
        this.patchRows('herramienta', detail.herramientas || [], ['cantidad', 'descripcion']);
        this.patchRows('vehiculo', detail.vehiculos || [], ['placa', 'tipo']);
        const docs = detail.documentos || {};
        this.existingFiles = {
          cartaSolicitud: docs.cartaSolicitud || submission.carta_representacion_filename || '',
          facturaSolvencia: docs.facturaSolvencia || submission.registro_mercantil_filename || '',
          personaDoc1: '',
          personaDoc2: '',
          personaDoc3: '',
          personaDoc4: '',
          personaDoc5: '',
          escortPwd1: detail.escoltas?.[0]?.documento_pdf || detail.escoltas?.[0]?.contrasena_pdf || docs.escortPwd1 || submission.aila_escort_pwd_1_filename || submission.rpa_documento_estado_filename || '',
          escortPwd2: detail.escoltas?.[1]?.documento_pdf || detail.escoltas?.[1]?.contrasena_pdf || docs.escortPwd2 || submission.aila_escort_pwd_2_filename || '',
          escortPwd3: detail.escoltas?.[2]?.documento_pdf || detail.escoltas?.[2]?.contrasena_pdf || docs.escortPwd3 || submission.aila_escort_pwd_3_filename || '',
          herramientasFotos: docs.herramientasFotos || submission.rpa_registro_entidad_filename || '',
          vehiculosTarjeta: docs.vehiculosTarjeta || submission.rpa_registro_representante_filename || ''
        };
        const fallbackPersonDocs = [
          submission.dpi_filename || '',
          submission.financial_declaraguate_2_filename || '',
          submission.financial_declaraguate_3_filename || '',
          submission.financial_declaraguate_4_filename || '',
          submission.financial_declaraguate_5_filename || ''
        ];
        (detail.personas || []).forEach((persona, index) => {
          const key = this.personDocumentKey(index + 1);
          this.ensurePersonFileKey(index + 1);
          this.existingFiles[key] = persona?.documento_pdf || fallbackPersonDocs[index] || '';
        });
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
      for (const field of ['nombre', 'documento']) {
        (this.form as any).removeControl(`persona${idx}_${field}`);
      }
      delete this.files[this.personDocumentKey(idx)];
      delete this.existingFiles[this.personDocumentKey(idx)];
      delete this.fileErrors[this.personDocumentKey(idx)];
    }
    for (const idx of this.escortRows) {
      if (idx <= this.minEscortRows) continue;
      for (const field of ['nombre', 'telefono', 'tia', 'vencimiento_tia']) {
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
    const leadTimeValidator = genericPermitLeadTimeValidator(() => new Date());
    const fechaIngresoControl = this.form.get('fecha_ingreso');
    fechaIngresoControl?.setValidators([Validators.required, leadTimeValidator]);
    fechaIngresoControl?.updateValueAndValidity({ emitEvent: false });

    const horaIngresoControl = this.form.get('hora_ingreso');
    horaIngresoControl?.setValidators([Validators.required, leadTimeValidator]);
    horaIngresoControl?.updateValueAndValidity({ emitEvent: false });
    for (const idx of this.peopleRows) {
      this.ensurePersonControls(idx);
      const required = idx === 1 || this.personRowHasValue(idx);
      for (const field of ['nombre', 'documento']) {
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
      phoneControl?.setValidators(required ? [Validators.required] : []);
      phoneControl?.updateValueAndValidity({ emitEvent: false });
      const passwordControl = this.form.get(`escolta${idx}_contrasena`);
      passwordControl?.setValidators(required && this.isEscortTiaExpired(idx) ? [Validators.required] : []);
      passwordControl?.updateValueAndValidity({ emitEvent: false });
    }
  }

  private personRowHasValue(idx: number) {
    return ['nombre', 'documento'].some((field) =>
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
    for (let idx = 1; idx <= target; idx++) {
      this.ensurePersonControls(idx);
      this.ensurePersonFileKey(idx);
    }
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
    for (const field of ['nombre', 'documento']) {
      const name = `persona${idx}_${field}`;
      if (!this.form.get(name)) {
        (this.form as any).addControl(name, this.fb.control(''));
      }
    }
  }

  personDocumentKey(idx: number): `personaDoc${number}` {
    return `personaDoc${idx}`;
  }

  private ensurePersonFileKey(idx: number) {
    const key = this.personDocumentKey(idx);
    if (!(key in this.files)) this.files[key] = null;
    if (!(key in this.existingFiles)) this.existingFiles[key] = '';
    if (!(key in this.fileErrors)) this.fileErrors[key] = '';
  }

  private createInitialFileRecord<T>(defaultValue: T): AilaFileMap<T> {
    return {
      cartaSolicitud: defaultValue,
      facturaSolvencia: defaultValue,
      personaDoc1: defaultValue,
      personaDoc2: defaultValue,
      personaDoc3: defaultValue,
      personaDoc4: defaultValue,
      personaDoc5: defaultValue,
      escortPwd1: defaultValue,
      escortPwd2: defaultValue,
      escortPwd3: defaultValue,
      herramientasFotos: defaultValue,
      vehiculosTarjeta: defaultValue
    };
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

  private loadImageAsDataUrl(path: string): Promise<string | null> {
    return fetch(path)
      .then((response) => response.blob())
      .then((blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('image-read-error'));
        reader.readAsDataURL(blob);
      }))
      .catch(() => null);
  }
}
